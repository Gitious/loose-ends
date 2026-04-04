import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { loadMemories, appendMemory } from "@/lib/memory";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 30;

/**
 * Decide if this scan has enough "signal" to warrant memory analysis.
 * No point burning tokens on 15 promotional emails.
 */
function hasMemorySignal(looseEnds: LooseEnd[]): boolean {
  // Has urgent or attention items (not just green/promotional)
  const nonGreen = looseEnds.filter((le) => le.urgency !== "green");
  if (nonGreen.length > 0) return true;

  // Has GitHub or Calendar items (these are always meaningful)
  const meaningful = looseEnds.filter((le) => le.type === "github" || le.type === "calendar" || le.type === "slack");
  if (meaningful.length > 0) return true;

  // Has real emails (not just marketing/noreply)
  const realEmails = looseEnds.filter((le) => {
    if (le.type !== "email") return false;
    const from = (le.meta?.from || le.source || "").toLowerCase();
    return !from.includes("noreply") && !from.includes("no-reply") &&
           !from.includes("newsletter") && !from.includes("marketing") &&
           !from.includes("email@") && !from.includes("info@");
  });
  if (realEmails.length >= 2) return true;

  return false;
}

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.sub;
  const { looseEnds } = (await req.json()) as { looseEnds: LooseEnd[] };
  if (!looseEnds?.length) return Response.json({ suggestions: {}, newMemories: [] });

  const shouldAnalyzeMemories = hasMemorySignal(looseEnds);
  const existingMemories = shouldAnalyzeMemories ? await loadMemories(userId) : [];

  // Build compact item list
  const items = looseEnds.slice(0, 20).map((le, i) =>
    `${i + 1}. [${le.type}] ${le.title} — ${le.description} (${le.age})`
  ).join("\n");

  // Memory context only when we're doing memory analysis
  const memoryBlock = shouldAnalyzeMemories && existingMemories.length > 0
    ? `\n\nExisting memories about this user (don't repeat these):\n${existingMemories.map((m) => `- [${m.source}] ${m.content}`).join("\n")}`
    : "";

  const schema = shouldAnalyzeMemories
    ? z.object({
        suggestions: z.record(z.string(), z.string()),
        memories: z.array(z.object({
          content: z.string(),
          source: z.enum(["gmail", "calendar", "github", "slack"]),
        })).describe("Only genuinely useful new patterns. Max 2. Empty array if nothing notable."),
      })
    : z.object({
        suggestions: z.record(z.string(), z.string()),
      });

  const memoryInstruction = shouldAnalyzeMemories
    ? `\n\n2. MEMORIES: If you notice a genuinely useful pattern (work habits, key contacts, recurring themes), save it. Skip trivial observations. Max 2, or empty array if nothing interesting.${memoryBlock}`
    : "";

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    schema,
    prompt: `Analyze these loose ends from a user's Gmail, Calendar, GitHub, and Slack.

1. SUGGESTIONS: For each item, write ONE sentence (max 12 words). For marketing emails, say "Marketing, safe to archive". Never use em dashes. Be specific for real items.${memoryInstruction}

Items:
${items}`,
  });

  // Map suggestions back to IDs
  const suggestions: Record<string, string> = {};
  looseEnds.slice(0, 20).forEach((le, i) => {
    const key = String(i + 1);
    if ((object as Record<string, unknown>).suggestions && (object.suggestions as Record<string, string>)[key]) {
      suggestions[le.id] = (object.suggestions as Record<string, string>)[key];
    }
  });

  // Save memories only when signal was detected
  const newMemories: string[] = [];
  if (shouldAnalyzeMemories && "memories" in object) {
    for (const mem of (object as { memories: { content: string; source: string }[] }).memories || []) {
      const isDuplicate = existingMemories.some(
        (existing) => existing.content.toLowerCase().includes(mem.content.toLowerCase().slice(0, 30))
      );
      if (!isDuplicate) {
        await appendMemory(userId, {
          content: mem.content,
          source: mem.source as "gmail" | "calendar" | "github" | "slack",
        });
        newMemories.push(mem.content);
      }
    }
  }

  return Response.json({ suggestions, newMemories });
}
