/**
 * Neon Postgres-backed memory store for per-user insights.
 *
 * Stores memories in the `memories` table. Uses @neondatabase/serverless
 * so it works in both Node.js and edge runtimes.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import sql, { ensureTables } from "./db";

export interface Memory {
  id: string;
  content: string;
  memo: string; // short summary (~15 words) for dashboard preview — auto-generated if not provided
  source: "gmail" | "calendar" | "github" | "slack" | "chat" | "agent";
  createdAt: string; // ISO 8601
}

/** Input type for appendMemory — memo is auto-generated */
export type MemoryInput = Omit<Memory, "id" | "createdAt" | "memo">;

/** Generate a short memo from content — max 8 words for dashboard preview. */
function buildMemo(content: string): string {
  const words = content.split(/\s+/);
  if (words.length <= 8) return content;
  return words.slice(0, 8).join(" ") + "…";
}

/**
 * Load all memories for a user, newest first.
 */
export async function loadMemories(userId: string): Promise<Memory[]> {
  await ensureTables();

  const rows = await sql`
    SELECT id, content, memo, source, created_at
    FROM memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  return rows.map((r) => ({
    id: r.id as string,
    content: r.content as string,
    memo: (r.memo as string) || buildMemo(r.content as string),
    source: r.source as Memory["source"],
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

/**
 * Append a single memory entry for a user.
 * Deduplicates against existing memories before inserting.
 */
export async function appendMemory(
  userId: string,
  memory: MemoryInput
): Promise<Memory> {
  await ensureTables();

  const existing = await loadMemories(userId);

  // Deduplicate: skip if a semantically similar memory already exists
  const newNorm = memory.content.trim().toLowerCase();
  // Pre-compute the new memory's word set once (avoids re-creating per iteration)
  const newWords = new Set(newNorm.split(/\s+/).filter((w) => w.length > 3));
  const newFirst50 = newNorm.slice(0, 50);

  const isDupe = existing.some((m) => {
    const existNorm = m.content.trim().toLowerCase();
    // Exact match
    if (existNorm === newNorm) return true;
    // High overlap: check if one contains the other or first 50 chars match
    if (existNorm.includes(newNorm) || newNorm.includes(existNorm)) return true;
    if (newFirst50 === existNorm.slice(0, 50)) return true;
    // Word-level similarity: if 70%+ of words overlap, it's a dupe
    if (newWords.size === 0) return false;
    const existWords = new Set(
      existNorm.split(/\s+/).filter((w) => w.length > 3)
    );
    let overlap = 0;
    for (const w of newWords) {
      if (existWords.has(w)) overlap++;
    }
    return overlap / newWords.size > 0.7;
  });

  if (isDupe) {
    // Return the existing similar memory instead of creating a duplicate
    const match =
      existing.find(
        (m) =>
          m.content.trim().toLowerCase().slice(0, 50) === newFirst50
      ) || existing[0];
    return match;
  }

  // Hard cap: compact first if at limit, reject if still full
  if (existing.length >= MEMORY_CAP) {
    await compactIfNeeded(userId, existing.length);
    const refreshed = await sql`SELECT COUNT(*) as c FROM memories WHERE user_id = ${userId}`;
    if (Number(refreshed[0].c) >= MEMORY_CAP) {
      return existing[0]; // Still full after compaction — skip
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const memo = buildMemo(memory.content);

  await sql`
    INSERT INTO memories (id, user_id, content, memo, source, created_at)
    VALUES (${id}, ${userId}, ${memory.content}, ${memo}, ${memory.source}, ${now})
  `;

  const entry: Memory = {
    id,
    content: memory.content,
    memo,
    source: memory.source,
    createdAt: now,
  };

  // Compact in the background — don't block the insert return path
  compactIfNeeded(userId, existing.length + 1).catch((err) =>
    console.error("[memory] Background compaction error:", err)
  );

  return entry;
}

const MEMORY_CAP = 25;
const COMPACT_OLDEST = 15;
const COMPACT_TARGET = 5;

/**
 * Compact old memories when approaching the cap.
 * Takes the oldest COMPACT_OLDEST memories, sends them to Claude Haiku
 * to consolidate into COMPACT_TARGET concise insights, then replaces them.
 */
async function compactIfNeeded(
  userId: string,
  count: number
): Promise<void> {
  if (count < MEMORY_CAP) return;

  // Fetch the oldest COMPACT_OLDEST memories
  const oldestRows = await sql`
    SELECT id, content, source, created_at
    FROM memories
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
    LIMIT ${COMPACT_OLDEST}
  `;

  if (oldestRows.length < COMPACT_OLDEST) return;

  const oldest = oldestRows.map((r) => ({
    id: r.id as string,
    content: r.content as string,
    source: r.source as Memory["source"],
    createdAt: new Date(r.created_at as string).toISOString(),
  }));

  const oldestText = oldest
    .map((m, i) => `${i + 1}. [${m.source}] ${m.content}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      schema: z.object({
        consolidated: z.array(
          z.object({
            content: z.string(),
            source: z.enum([
              "gmail",
              "calendar",
              "github",
              "slack",
              "chat",
              "agent",
            ]),
          })
        ),
      }),
      prompt: `Consolidate these ${oldest.length} memories into at most ${COMPACT_TARGET} entries.

RULES:
- Each memory should be 15-30 words. One clear sentence with enough context to be useful.
- Focus on patterns, preferences, and behaviors — not one-time events.
- Merge duplicates, drop trivial observations, keep actionable insights.
- No paragraphs. One sentence per memory.

Good examples:
- "Responds to Slack DMs within 2 hours but lets email pile up during sprints."
- "Defers infrastructure decisions (Neon DB) under deadline pressure, revisits post-submission."
- "Iman sends escalating urgent emails when blocked — always prioritize responding."

Memories:
${oldestText}`,
    });

    // Archive the old memories before deleting — batch all inserts in parallel
    const oldIds = oldest.map((m) => m.id);
    await Promise.all(
      oldest.map((m) =>
        sql`
          INSERT INTO archived_memories (id, user_id, content, memo, source, created_at)
          VALUES (${m.id}, ${userId}, ${m.content}, ${buildMemo(m.content)}, ${m.source}, ${m.createdAt})
          ON CONFLICT (id) DO NOTHING
        `
      )
    );

    // Delete from active memories
    await sql`
      DELETE FROM memories
      WHERE user_id = ${userId}
        AND id = ANY(${oldIds})
    `;

    // Insert consolidated memories in parallel
    const now = new Date();
    await Promise.all(
      object.consolidated.map((c) => {
        const id = crypto.randomUUID();
        const memo = buildMemo(c.content);
        return sql`
          INSERT INTO memories (id, user_id, content, memo, source, created_at)
          VALUES (${id}, ${userId}, ${c.content}, ${memo}, ${c.source}, ${now.toISOString()})
        `;
      })
    );
  } catch (err) {
    console.error("[memory] Compaction failed, skipping:", err);
    // graceful fallback — don't lose data
  }
}

/**
 * Delete a memory by ID.
 * Returns true if the memory was found and removed, false otherwise.
 */
export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  await ensureTables();

  const result = await sql`
    DELETE FROM memories
    WHERE id = ${memoryId} AND user_id = ${userId}
    RETURNING id
  `;

  return result.length > 0;
}
