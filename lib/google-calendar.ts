import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Initialize the Google Calendar API client
// This expects either:
// 1. GOOGLE_APPLICATION_CREDENTIALS env var pointing to a JSON key file
// 2. GOOGLE_SERVICE_ACCOUNT_JSON env var containing the JSON key string
// 3. Manual setup below using env vars for Client Email and Private Key

const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'];

export async function getCalendarClient() {
    let auth: JWT;

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        const keys = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        auth = new google.auth.JWT({
            email: keys.client_email,
            key: keys.private_key.replace(/\\n/g, '\n'),
            scopes: SCOPES,
        });
    } else if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
        auth = new google.auth.JWT({
            email: process.env.GOOGLE_CLIENT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newlines in env var
            scopes: SCOPES,
        });
    } else {
        // Fallback to Application Default Credentials if running in an environment that supports it (e.g. GCE, Lambda)
        // or if GOOGLE_APPLICATION_CREDENTIALS is set
        const authClient = await google.auth.getClient({
            scopes: SCOPES,
        });
        return google.calendar({ version: 'v3', auth: authClient });
    }

    return google.calendar({ version: 'v3', auth });
}
