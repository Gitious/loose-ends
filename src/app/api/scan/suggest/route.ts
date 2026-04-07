import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { loadMemories, appendMemory } from "@/lib/memory";
import { extractBody } from "@/lib/gmail-body";
import type { LooseEnd, JunkEmail } from "@/lib/types";

export const maxDuration = 30;

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function POST(req: Request) {
  // Debug: write immediately on entry to confirm endpoint is being called
  try { const fs = await import("fs"); fs.writeFileSync("/tmp/suggest-entry.txt", `called at ${new Date().toISOString()}\n`, { flag: "a" }); } catch {}

  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.sub;
  const userName = session.user?.name || session.user?.nickname || "";

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { looseEnds, junkEmails } = parsed as {
    looseEnds: LooseEnd[];
    junkEmails?: JunkEmail[];
  };

  if (!looseEnds?.length && !junkEmails?.length) {
    return Response.json({ suggestions: [], textSuggestions: {} });
  }

  // Enforce reasonable size limits to prevent abuse of the AI endpoint
  if (Array.isArray(looseEnds) && looseEnds.length > 100) {
    return Response.json({ error: "Too many loose ends (max 100)" }, { status: 400 });
  }
  if (Array.isArray(junkEmails) && junkEmails.length > 200) {
    return Response.json({ error: "Too many junk emails (max 200)" }, { status: 400 });
  }

  // Fetch Google token and load memories in parallel
  const [tokenResult, memories] = await Promise.all([
    auth0.getAccessTokenForConnection({ connection: "google-oauth2" }).catch(() => null),
    loadMemories(userId),
  ]);
  const googleToken = tokenResult?.token ?? null;
  const memoryContext = memories.length > 0
    ? memories.slice(0, 10).map((m) => `- [${m.source}] ${m.content}`).join("\n")
    : "No user patterns learned yet.";

  // Fetch email bodies and calendar events in parallel (both need Google token)
  const emailItems = (looseEnds || [])
    .filter((le) => le.type === "email" && le.meta?.messageId)
    .sort((a, b) => {
      const order: Record<string, number> = { red: 0, yellow: 1, green: 2 };
      return (order[a.urgency] ?? 2) - (order[b.urgency] ?? 2);
    })
    .slice(0, 5);

  const emailBodies: Record<string, string> = {};
  let calendarContext = "";

  // Run email body fetches and calendar fetch concurrently
  const emailBodiesPromise = (googleToken && emailItems.length > 0)
    ? Promise.allSettled(
        emailItems.map(async (le) => {
          const res = await fetch(`${GMAIL_API}/messages/${le.meta.messageId}?format=full`, {
            headers: { Authorization: `Bearer ${googleToken}` },
          });
          if (!res.ok) return null;
          const data = await res.json();
          let body = extractBody(data.payload || {});
          if (body.length > 500) body = body.slice(0, 500) + "...";
          return { id: le.id, body };
        })
      )
    : Promise.resolve([]);

  const calendarPromise = googleToken
    ? (async () => {
        try {
          const now = new Date();
          const weekAhead = new Date(now.getTime() + 7 * 86400000);
          const calRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(weekAhead.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=15`,
            { headers: { Authorization: `Bearer ${googleToken}` } }
          );
          if (calRes.ok) {
            const calData = await calRes.json();
            const events = calData.items || [];
            if (events.length > 0) {
              return `\n\nUPCOMING CALENDAR (next 7 days):\n${events.map((e: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; attendees?: { email?: string }[] }) =>
                `- ${e.summary || "(untitled)"}: ${e.start?.dateTime || e.start?.date || ""} to ${e.end?.dateTime || e.end?.date || ""}${e.attendees?.length ? ` (${e.attendees.slice(0, 3).map(a => a.email).join(", ")})` : ""}`
              ).join("\n")}`;
            }
          }
        } catch {}
        return "";
      })()
    : Promise.resolve("");

  const [bodyResults, calResult] = await Promise.all([emailBodiesPromise, calendarPromise]);
  for (const r of bodyResults) {
    if (typeof r === "object" && "status" in r && r.status === "fulfilled" && r.value) {
      emailBodies[r.value.id] = r.value.body;
    }
  }
  calendarContext = calResult;

  // Build rich context for the AI — include email bodies where available
  const items = (looseEnds || []).slice(0, 25).map((le, i) => {
    const from = le.meta?.from || le.source || "";
    const senderInfo = le.type === "email" && from ? ` [from: ${from}]` : "";
    const body = emailBodies[le.id];
    const bodyInfo = body ? `\n   Email body: "${body}"` : "";
    return `${i + 1}. [${le.type}|${le.urgency}] "${le.title}" — ${le.description} (${le.age})${senderInfo}${bodyInfo}`;
  }).join("\n");

  const junkContext = junkEmails && junkEmails.length > 0
    ? `\n\nJUNK EMAILS (${junkEmails.length}): ${junkEmails.slice(0, 5).map(j => `"${j.subject}" from ${j.from}`).join(", ")}${junkEmails.length > 5 ? ` +${junkEmails.length - 5} more` : ""}`
    : "";

  // Write the prompt context for debugging
  try { const fs = await import("fs"); fs.writeFileSync("/tmp/suggest-prompt.txt", `ITEMS:\n${items}\n\nJUNK:${junkContext}\n\nCAL:${calendarContext}`); } catch {}

  let object;
  try {
  const result = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: z.object({
      suggestions: z.array(z.object({
        action: z.enum(["send_email", "create_event", "book_and_reply", "trash_emails", "post_comment", "send_slack", "dismiss"]),
        title: z.string().describe("Short action title, max 8 words"),
        reason: z.string().describe("Why this action is suggested, 1 sentence"),
        service: z.enum(["gmail", "calendar", "github", "slack"]),
        priority: z.number().describe("1-100, higher = more important"),
        itemNumber: z.string().describe("Item number from the list (e.g. '1', '3'), or 'junk' for junk cleanup"),
        params: z.object({
          to: z.string().optional().describe("Recipient email address"),
          subject: z.string().optional().describe("Email subject"),
          body_hint: z.string().optional().describe("Hint for what the reply/message should say"),
          with: z.string().optional().describe("Person name for meetings"),
          when: z.string().optional().describe("Proposed time for meetings"),
          count: z.string().optional().describe("Number of items for bulk actions"),
          channel_hint: z.string().optional().describe("Slack channel name"),
        }).describe("Action-specific parameters"),
      })).describe("Max 3 high-value suggestions only — skip low-priority actions like archiving or dismissing"),
      textSuggestions: z.array(z.object({
        itemNumber: z.string(),
        suggestion: z.string().describe("One-sentence inline suggestion, max 12 words"),
      })).describe("Brief inline text for each item"),
      newMemory: z.string().optional().describe("If you notice a new behavioral pattern, write it as one clear sentence (15-30 words). Focus on patterns and preferences, not one-time events. Omit if nothing genuinely new."),
    }),
    prompt: `You are an AI personal assistant analyzing a user's loose ends across Gmail, Calendar, GitHub, and Slack. Your job is to suggest ACTIONS the agent should take.

User: ${userName}
Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
Time: ${new Date().toLocaleTimeString()}

USER PATTERNS (learned over time):
${memoryContext}

LOOSE ENDS:
${items}
${junkContext}
${calendarContext}

INSTRUCTIONS:
1. Analyze ALL items and suggest up to 5 concrete ACTIONS. Be PROACTIVE and DECISIVE.

   SCHEDULING DETECTION — READ THE EMAIL BODY CAREFULLY:
   - If someone is REQUESTING a meeting (e.g. "Can we meet?", "How about 2pm?", "Let's catch up") → suggest "book_and_reply"
   - If someone is DECLINING or CANCELING (e.g. "I can't make it", "need to reschedule", "won't be able to") → suggest "send_email" to acknowledge, NOT book_and_reply
   - If the subject says "Meet up", "Catch up", "Meeting" from a real person AND the email body confirms they want to meet → suggest "book_and_reply"
   - Include "with" (sender name) and "when" (proposed time from email) in params
   - Check the calendar context for conflicts at the proposed time

   OTHER ACTIONS:
   - Urgent emails from real people with no reply → suggest "send_email" reply
   - Calendar conflicts → suggest "send_email" to reschedule
   - Stale items → suggest "send_email" follow-up nudge
   - Junk emails → suggest "trash_emails"
   - GitHub PRs waiting for review → suggest "post_comment"
   - Slack DMs unanswered → suggest "send_slack" reply

2. For each action, provide:
   - A clear title (what the agent will do)
   - A reason (why)
   - The relevant item number
   - Parameters: for send_email include "to", "subject", "body_hint"; for trash_emails include "count"; for book_and_reply include "with" and "when"

3. Also provide a brief TEXT suggestion for each item (shown inline on the card).

4. If you notice a pattern worth remembering, save it as newMemory.

CRITICAL RULES:
- Only suggest actions the AGENT CAN ACTUALLY EXECUTE with the info available. Ask yourself: "Does the agent have everything it needs to do this in one step?"
  - GOOD: "Reply to Alice confirming 2pm meeting" (agent has recipient, time, can generate reply)
  - GOOD: "Trash 32 junk emails" (agent has messageIds, can execute)
  - GOOD: "Book meeting with Bob Tuesday 2pm" (agent has attendee, time, can create event)
  - BAD: "Correct contact address and resend" (agent doesn't know the correct address — human judgment needed)
  - BAD: "Reach out to team about X" (agent doesn't know who "the team" is)
  - BAD: "Follow up when convenient" (no clear action or recipient)
- If an item is informational but NOT actionable by the agent, use "dismiss" or just skip suggesting — do NOT generate a fake action.
- Delivery failures, bounce notifications, and system alerts are usually NOT actionable by the agent — skip them.
- NEVER suggest "book_and_reply" for promotional/automated emails (Domino's, Yelp, USPS, Amazon, etc.)
- Read the email body when available — it tells you the INTENT (requesting vs declining a meeting).
- Be specific in body_hint — the agent will use it to generate the actual reply.
- Priority should reflect actual urgency.`,
  });
  object = result.object;
  } catch (aiErr: unknown) {
    const errMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
    try { const fs = await import("fs"); fs.writeFileSync("/tmp/suggest-error.txt", `${new Date().toISOString()}: ${errMsg}\n`); } catch {}
    console.error("[suggest] AI call failed:", errMsg);
    return Response.json({ suggestions: [], textSuggestions: {} });
  }

  // Map text suggestions back to IDs
  const textSuggestions: Record<string, string> = {};
  for (const ts of object.textSuggestions || []) {
    const idx = parseInt(ts.itemNumber) - 1;
    if (idx >= 0 && idx < looseEnds.length) {
      textSuggestions[looseEnds[idx].id] = ts.suggestion;
    }
  }

  // Debug: write what the AI returned
  try {
    const fs = await import("fs");
    fs.writeFileSync("/tmp/suggest-debug.json", JSON.stringify({
      timestamp: new Date().toISOString(),
      itemCount: looseEnds.length,
      emailBodiesFetched: Object.keys(emailBodies).length,
      hasCalendar: calendarContext.length > 0,
      aiSuggestions: object.suggestions,
      aiTextSuggestions: object.textSuggestions,
      aiMemory: object.newMemory,
      promptItemsPreview: items.slice(0, 500),
    }, null, 2));
  } catch {}

  // Map action suggestions to include item IDs
  const suggestions = (object.suggestions || []).map((s, i) => {
    let itemId: string | undefined;
    if (s.itemNumber === "junk") {
      itemId = "junk-cleanup";
    } else {
      const idx = parseInt(s.itemNumber) - 1;
      if (idx >= 0 && idx < looseEnds.length) {
        itemId = looseEnds[idx].id;
      }
    }
    return {
      id: `agent-${i}-${Date.now()}`,
      action: s.action,
      title: s.title,
      reason: s.reason,
      service: s.service,
      priority: s.priority,
      itemId,
      params: Object.fromEntries(
        Object.entries(s.params).filter(([, v]) => v != null) as [string, string][]
      ),
    };
  });

  // Save memory if the AI noticed a pattern (fire-and-forget — don't block the response)
  if (object.newMemory && object.newMemory.trim()) {
    appendMemory(userId, {
      content: object.newMemory.trim(),
      source: "agent",
    }).catch((err) => console.error("[suggest] Memory save error:", err));
  }

  return Response.json({ suggestions, textSuggestions });
}
