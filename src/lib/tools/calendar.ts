import { tool } from "ai";
import { z } from "zod";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { withGmailAccess } from "@/lib/auth0-ai";
import type { LooseEnd, UrgencyLevel } from "@/lib/types";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function getUrgencyByHoursUntil(hoursUntil: number): UrgencyLevel {
  if (hoursUntil < 1) return "red";
  if (hoursUntil < 4) return "yellow";
  return "green";
}

function formatTimeUntil(hoursUntil: number): string {
  if (hoursUntil < 1) {
    const minutes = Math.round(hoursUntil * 60);
    return minutes <= 0 ? "now" : `in ${minutes} minutes`;
  }
  if (hoursUntil < 24) {
    return `in ${Math.round(hoursUntil)} hours`;
  }
  const days = Math.round(hoursUntil / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  htmlLink?: string;
}

export const scanCalendar = withGmailAccess(
  tool({
    description:
      "Scan Google Calendar for upcoming events that need attention: conflicts (overlapping events) and meetings with no agenda/description that have multiple attendees.",
    inputSchema: z.object({
      hours: z
        .number()
        .default(24)
        .describe("Number of hours ahead to scan for calendar events"),
    }),
    execute: async ({ hours }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const looseEnds: LooseEnd[] = [];

      const now = new Date();
      const until = new Date(now.getTime() + hours * 60 * 60 * 1000);

      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: until.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });

      const res = await fetch(
        `${CALENDAR_API}/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) {
        throw new Error(
          `Calendar API error: ${res.status} ${res.statusText}`
        );
      }

      const data = await res.json();
      const events: CalendarEvent[] = data.items ?? [];

      // Detect conflicts (overlapping events)
      for (let i = 0; i < events.length; i++) {
        const eventA = events[i];
        const startA = new Date(
          eventA.start.dateTime ?? eventA.start.date ?? ""
        );
        const endA = new Date(eventA.end.dateTime ?? eventA.end.date ?? "");

        for (let j = i + 1; j < events.length; j++) {
          const eventB = events[j];
          const startB = new Date(
            eventB.start.dateTime ?? eventB.start.date ?? ""
          );
          const endB = new Date(
            eventB.end.dateTime ?? eventB.end.date ?? ""
          );

          // Check for overlap: A starts before B ends AND B starts before A ends
          if (startA < endB && startB < endA) {
            const hoursUntil =
              (Math.min(startA.getTime(), startB.getTime()) - now.getTime()) /
              (1000 * 60 * 60);

            looseEnds.push({
              id: `cal-conflict-${eventA.id}-${eventB.id}`,
              type: "calendar",
              title: "Calendar conflict",
              description: `"${eventA.summary ?? "Untitled"}" overlaps with "${eventB.summary ?? "Untitled"}"`,
              urgency: getUrgencyByHoursUntil(hoursUntil),
              age: formatTimeUntil(hoursUntil),
              source: "Google Calendar",
              actionLabel: "Resolve conflict",
              meta: {
                eventIdA: eventA.id,
                eventIdB: eventB.id,
                summaryA: eventA.summary ?? "",
                summaryB: eventB.summary ?? "",
                startA: startA.toISOString(),
                startB: startB.toISOString(),
              },
            });
          }
        }
      }

      // Detect meetings with no agenda and multiple attendees
      for (const event of events) {
        const attendeeCount = event.attendees?.length ?? 0;
        const hasDescription =
          event.description && event.description.trim().length > 0;

        if (attendeeCount >= 2 && !hasDescription) {
          const startTime = new Date(
            event.start.dateTime ?? event.start.date ?? ""
          );
          const hoursUntil =
            (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

          looseEnds.push({
            id: `cal-noagenda-${event.id}`,
            type: "calendar",
            title: "Meeting without agenda",
            description: `"${event.summary ?? "Untitled"}" has ${attendeeCount} attendees but no description or agenda`,
            urgency: getUrgencyByHoursUntil(hoursUntil),
            age: formatTimeUntil(hoursUntil),
            source: "Google Calendar",
            actionLabel: "Add meeting agenda",
            meta: {
              eventId: event.id,
              summary: event.summary ?? "",
              start: startTime.toISOString(),
              attendeeCount: String(attendeeCount),
              link: event.htmlLink ?? "",
            },
          });
        }
      }

      return looseEnds;
    },
  })
);
