import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { extractBody } from "@/lib/gmail-body";
import type {
  LooseEnd,
  ScheduleCheckResult,
  ProposedEvent,
  ExistingMeeting,
  CalendarConflict,
  FreeSlot,
} from "@/lib/types";

export const maxDuration = 30;

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { item } = parsed as { item: LooseEnd };
  if (!item || typeof item !== "object") {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }

  let googleToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    googleToken = result.token;
  } catch {
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  // --- Fetch email body for context ---
  let emailBody = "";
  if (item.type === "email" && item.meta?.messageId) {
    try {
      const msgRes = await fetch(
        `${GMAIL_API}/messages/${item.meta.messageId}?format=full`,
        { headers: { Authorization: `Bearer ${googleToken}` } },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        emailBody = extractBody(msgData.payload || {});
        if (emailBody.length > 1500) emailBody = emailBody.slice(0, 1500);
      }
    } catch {}
  }

  // --- Parse sender info ---
  const senderName = (item.meta?.from || item.source || "").split("<")[0].trim();
  const fromField = item.meta?.from || item.source || "";
  const senderEmail =
    fromField.match(/<([^>]+)>/)?.[1] ||
    (fromField.match(/[\w.-]+@[\w.-]+/) || [""])[0];
  const subject = item.meta?.subject || item.title || "";
  const now = new Date();

  // --- AI extraction of proposed event details ---
  const { object: proposed } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: z.object({
      summary: z.string().describe("Event title - short and clear"),
      date: z.string().describe("ISO date string YYYY-MM-DD"),
      startTime: z.string().describe("Start time in HH:MM (24h format)"),
      endTime: z.string().describe("End time in HH:MM (24h format), default to 1 hour after start"),
      attendees: z.array(z.string()).describe("Email addresses to invite"),
      description: z.string().optional().describe("Brief event description"),
    }),
    prompt: `Extract calendar event details from this email. Today is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Current time is ${now.toLocaleTimeString()}.

From: ${senderName} <${senderEmail}>
Subject: ${subject}

${emailBody ? `Email body:\n${emailBody}` : `Description: ${item.description}`}

Instructions:
- Extract the proposed meeting time. "Tomorrow" means ${new Date(now.getTime() + 86400000).toISOString().split("T")[0]}.
- If a specific time is mentioned (e.g. "1pm"), use it. Default duration is 1 hour.
- If no specific time, default to 10:00-11:00.
- Include the sender as an attendee if they have an email address.
- Make the summary concise: "Meeting with [Name]" or use the topic if mentioned.`,
  });

  const proposedEvent: ProposedEvent = {
    summary: proposed.summary,
    date: proposed.date,
    startTime: proposed.startTime,
    endTime: proposed.endTime,
    attendees: proposed.attendees,
    description: proposed.description,
  };

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";

  // --- Duplicate detection: query +-7 days around proposed date ---
  let existingMeeting: ExistingMeeting | null = null;
  try {
    const proposedDate = new Date(`${proposed.date}T12:00:00`);
    const searchMin = new Date(proposedDate.getTime() - 7 * 86400000).toISOString();
    const searchMax = new Date(proposedDate.getTime() + 7 * 86400000).toISOString();

    const dupeUrl = `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(searchMin)}&timeMax=${encodeURIComponent(searchMax)}&singleEvents=true&maxResults=50`;
    const dupeRes = await fetch(dupeUrl, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });

    if (dupeRes.ok) {
      const dupeData = await dupeRes.json();
      const events = dupeData.items || [];

      for (const evt of events) {
        const attendees = evt.attendees || [];
        const hasSender = attendees.some(
          (a: { email?: string }) =>
            a.email && senderEmail && a.email.toLowerCase() === senderEmail.toLowerCase(),
        );
        if (hasSender) {
          existingMeeting = {
            eventId: evt.id,
            summary: evt.summary || "(no title)",
            start: evt.start?.dateTime || evt.start?.date || "",
            end: evt.end?.dateTime || evt.end?.date || "",
            htmlLink: evt.htmlLink || "",
          };
          break;
        }
      }
    }
  } catch {}

  // --- Conflict detection: query exact proposed time window ---
  const conflicts: CalendarConflict[] = [];
  try {
    const startDT = new Date(`${proposed.date}T${proposed.startTime}:00`);
    const endDT = new Date(`${proposed.date}T${proposed.endTime}:00`);

    const conflictUrl = `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(startDT.toISOString())}&timeMax=${encodeURIComponent(endDT.toISOString())}&singleEvents=true&maxResults=10`;
    const conflictRes = await fetch(conflictUrl, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });

    if (conflictRes.ok) {
      const conflictData = await conflictRes.json();
      for (const evt of conflictData.items || []) {
        // Skip all-day events (those with start.date instead of start.dateTime)
        if (evt.start?.date && !evt.start?.dateTime) continue;
        if (evt.summary) {
          conflicts.push({
            eventId: evt.id,
            summary: evt.summary,
            start: evt.start?.dateTime || "",
            end: evt.end?.dateTime || "",
          });
        }
      }
    }
  } catch {}

  // --- Free slot computation via FreeBusy API ---
  const freeSlots: FreeSlot[] = [];
  try {
    // Calculate proposed meeting duration in minutes
    const [startH, startM] = proposed.startTime.split(":").map(Number);
    const [endH, endM] = proposed.endTime.split(":").map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    const meetingDuration = durationMinutes > 0 ? durationMinutes : 60;

    // Query FreeBusy for 3 days starting from the proposed date
    const freeBusyStart = new Date(`${proposed.date}T00:00:00`);
    const freeBusyEnd = new Date(freeBusyStart.getTime() + 3 * 86400000);

    const freeBusyRes = await fetch(`${CALENDAR_API}/freeBusy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: freeBusyStart.toISOString(),
        timeMax: freeBusyEnd.toISOString(),
        timeZone,
        items: [{ id: "primary" }],
      }),
    });

    if (freeBusyRes.ok) {
      const freeBusyData = await freeBusyRes.json();
      const busyPeriods: { start: string; end: string }[] =
        freeBusyData.calendars?.primary?.busy || [];

      // Compute free gaps during working hours (9 AM - 6 PM)
      const WORK_START = 9; // 9 AM
      const WORK_END = 18; // 6 PM
      const today = new Date();

      for (let dayOffset = 0; dayOffset < 3 && freeSlots.length < 5; dayOffset++) {
        const day = new Date(freeBusyStart.getTime() + dayOffset * 86400000);
        const dayStr = day.toISOString().split("T")[0];

        // Working hours for this day
        const workStart = new Date(`${dayStr}T${String(WORK_START).padStart(2, "0")}:00:00`);
        const workEnd = new Date(`${dayStr}T${String(WORK_END).padStart(2, "0")}:00:00`);

        // Skip past times for today
        const effectiveStart = day.toDateString() === today.toDateString()
          ? new Date(Math.max(workStart.getTime(), today.getTime()))
          : workStart;

        if (effectiveStart >= workEnd) continue;

        // Get busy periods for this day
        const dayBusy = busyPeriods
          .filter((b) => {
            const bStart = new Date(b.start);
            const bEnd = new Date(b.end);
            return bEnd > effectiveStart && bStart < workEnd;
          })
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        // Find free gaps
        let cursor = effectiveStart;
        for (const busy of dayBusy) {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          const gapStart = cursor;
          const gapEnd = busyStart < workEnd ? busyStart : workEnd;

          if (gapEnd.getTime() - gapStart.getTime() >= meetingDuration * 60000) {
            // Round start to nearest 15 minutes
            const roundedStart = new Date(gapStart);
            const mins = roundedStart.getMinutes();
            if (mins % 15 !== 0) {
              roundedStart.setMinutes(Math.ceil(mins / 15) * 15, 0, 0);
            }
            const slotEnd = new Date(roundedStart.getTime() + meetingDuration * 60000);

            if (slotEnd <= gapEnd) {
              freeSlots.push(formatFreeSlot(roundedStart, slotEnd, today));
              if (freeSlots.length >= 5) break;
            }
          }
          cursor = busyEnd > cursor ? busyEnd : cursor;
        }

        // Check gap after last busy period
        if (freeSlots.length < 5 && cursor < workEnd) {
          const gapDuration = workEnd.getTime() - cursor.getTime();
          if (gapDuration >= meetingDuration * 60000) {
            const roundedStart = new Date(cursor);
            const mins = roundedStart.getMinutes();
            if (mins % 15 !== 0) {
              roundedStart.setMinutes(Math.ceil(mins / 15) * 15, 0, 0);
            }
            const slotEnd = new Date(roundedStart.getTime() + meetingDuration * 60000);

            if (slotEnd <= workEnd) {
              freeSlots.push(formatFreeSlot(roundedStart, slotEnd, today));
            }
          }
        }
      }
    }
  } catch {}

  // --- Already-responded check: check if last message in thread is from user ---
  let alreadyResponded = false;
  if (item.meta?.threadId && googleToken) {
    try {
      const threadRes = await fetch(
        `${GMAIL_API}/threads/${item.meta.threadId}?format=metadata&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${googleToken}` } },
      );
      if (threadRes.ok) {
        const threadData = await threadRes.json();
        const messages = threadData.messages || [];
        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          const lastFrom =
            lastMsg?.payload?.headers?.find(
              (h: { name: string }) => h.name === "From",
            )?.value || "";
          const userEmail = session.user?.email || "";
          if (userEmail && lastFrom.toLowerCase().includes(userEmail.toLowerCase())) {
            alreadyResponded = true;
          }
        }
      }
    } catch {}
  }

  const result: ScheduleCheckResult = {
    proposed: proposedEvent,
    existingMeeting,
    conflicts,
    freeSlots,
    alreadyResponded,
  };

  return Response.json(result);
}

/** Format a free slot with a nice human-readable label */
function formatFreeSlot(start: Date, end: Date, today: Date): FreeSlot {
  const dayStr = start.toISOString().split("T")[0];
  const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;

  const startDate = new Date(start);
  startDate.setHours(0, 0, 0, 0);
  const todayDate = new Date(today);
  todayDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startDate.getTime() - todayDate.getTime()) / 86400000,
  );

  let dayLabel: string;
  if (diffDays === 0) {
    dayLabel = "Today";
  } else if (diffDays === 1) {
    dayLabel = "Tomorrow";
  } else {
    dayLabel = start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const label = `${dayLabel} ${formatTime(start)} - ${formatTime(end)}`;

  return { date: dayStr, startTime, endTime, label };
}
