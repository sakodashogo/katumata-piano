"use server"

import { getCalendarClient } from "@/lib/google-calendar"; // Note: Adjust import if file location is different
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { addDays, format, setHours, setMinutes, startOfDay, endOfDay, areIntervalsOverlapping, addMinutes } from "date-fns";

// Configuration for Working Hours
const WORKING_HOURS_START = 10; // 10:00
const WORKING_HOURS_END = 20;   // 20:00
const SLOT_DURATION_MINUTES = 30; // 30 minutes slots

export async function syncScheduleFromGoogle(startDateStr: string, endDateStr: string, roomId: string = "A") {
    const calendarId = process.env.GOOGLE_CALENDAR_ID;
    if (!calendarId) {
        return { success: false, error: "Google Calendar ID is not configured." };
    }

    try {
        const calendar = await getCalendarClient();

        // ensure start and end dates are valid Date objects
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);

        // Fetch events from Google Calendar
        const response = await calendar.events.list({
            calendarId,
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = response.data.items || [];
        console.log(`Fetched ${events.length} events from Google Calendar.`);

        // Process each day in the range
        const daysToProcess = [];
        let currentDay = new Date(start);
        while (currentDay <= end) {
            daysToProcess.push(new Date(currentDay));
            currentDay = addDays(currentDay, 1);
        }

        const newSlotsToCreate: { roomId: string; startTime: Date; endTime: Date; isBooked: boolean }[] = [];

        for (const day of daysToProcess) {
            // Define working hours for this day
            const workStart = setMinutes(setHours(day, WORKING_HOURS_START), 0);
            const workEnd = setMinutes(setHours(day, WORKING_HOURS_END), 0);

            // Filter GCal events that overlap with working hours on this day
            const dayEvents = events.filter(event => {
                if (!event.start?.dateTime || !event.end?.dateTime) return false; // Skip full day events for now or handle them

                const eventStart = new Date(event.start.dateTime);
                const eventEnd = new Date(event.end.dateTime);

                return areIntervalsOverlapping(
                    { start: workStart, end: workEnd },
                    { start: eventStart, end: eventEnd }
                );
            });

            // Calculate free slots
            // Iterate through every possible slot in the working day
            let slotTime = new Date(workStart);
            while (slotTime < workEnd) {
                const slotEnd = addMinutes(slotTime, SLOT_DURATION_MINUTES);

                // Check if this slot overlaps with ANY GCal event
                const isBlocked = dayEvents.some(event => {
                    if (!event.start?.dateTime || !event.end?.dateTime) return false;
                    const eventStart = new Date(event.start.dateTime);
                    const eventEnd = new Date(event.end.dateTime);

                    // Check overlap
                    return areIntervalsOverlapping(
                        { start: slotTime, end: slotEnd },
                        { start: eventStart, end: eventEnd }
                    );
                });

                if (!isBlocked) {
                    newSlotsToCreate.push({
                        roomId,
                        startTime: new Date(slotTime),
                        endTime: new Date(slotEnd),
                        isBooked: false, // Default is available
                    });
                }

                slotTime = slotEnd; // Move to next slot
            }
        }

        // Database Update Transaction
        await prisma.$transaction(async (tx) => {
            // 1. Delete existing Unbooked OpenSlots in the range for this room
            // We do NOT delete booked slots.
            await tx.openSlot.deleteMany({
                where: {
                    roomId,
                    isBooked: false,
                    startTime: {
                        gte: startOfDay(start),
                        lte: endOfDay(end),
                    },
                },
            });

            // 2. Create new OpenSlots
            // We need to be careful not to create a slot that overlaps with an EXISTING BOOKED slot
            // So we fetch existing booked slots first
            const existingBookedSlots = await tx.openSlot.findMany({
                where: {
                    roomId,
                    isBooked: true,
                    startTime: {
                        gte: startOfDay(start),
                        lte: endOfDay(end),
                    },
                },
            });

            const finalSlotsToCreate = newSlotsToCreate.filter(newSlot => {
                // Check if this new slot overlaps with any existing BOOKED slot
                return !existingBookedSlots.some(bookedSlot =>
                    areIntervalsOverlapping(
                        { start: newSlot.startTime, end: newSlot.endTime },
                        { start: bookedSlot.startTime, end: bookedSlot.endTime }
                    )
                );
            });

            if (finalSlotsToCreate.length > 0) {
                await tx.openSlot.createMany({
                    data: finalSlotsToCreate,
                });
            }
        });

        revalidatePath("/teacher/schedule");
        return { success: true, count: newSlotsToCreate.length };

    } catch (error) {
        console.error("Sync failed:", error);
        return { success: false, error: "Sync failed. Check credentials and calendar ID." };
    }
}
