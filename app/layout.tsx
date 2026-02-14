import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "ピアノ教室",
  description: "ピアノ教室のレッスン予約・管理システム",
};

export const preferredRegion = ["syd1"];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={cn(inter.variable, playfair.variable, "font-sans antialiased text-slate-900 bg-slate-50")}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
