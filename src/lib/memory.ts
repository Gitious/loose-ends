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
  source: "gmail" | "calendar" | "github" | "slack" | "chat" | "agent";
  createdAt: string; // ISO 8601
}

/**
 * Load all memories for a user, newest first.
 */
export async function loadMemories(userId: string): Promise<Memory[]> {
  await ensureTables();

  const rows = await sql`
    SELECT id, content, source, created_at
    FROM memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;

  return rows.map((r) => ({
    id: r.id as string,
    content: r.content as string,
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
  memory: Omit<Memory, "id" | "createdAt">
): Promise<Memory> {
  await ensureTables();

  const existing = await loadMemories(userId);

  // Deduplicate: skip if a semantically similar memory already exists
  const newNorm = memory.content.trim().toLowerCase();
  const isDupe = existing.some((m) => {
    const existNorm = m.content.trim().toLowerCase();
    // Exact match
    if (existNorm === newNorm) return true;
    // High overlap: check if one contains the other or first 50 chars match
    if (existNorm.includes(newNorm) || newNorm.includes(existNorm)) return true;
    if (newNorm.slice(0, 50) === existNorm.slice(0, 50)) return true;
    // Word-level similarity: if 70%+ of words overlap, it's a dupe
    const newWords = new Set(newNorm.split(/\s+/).filter((w) => w.length > 3));
    const existWords = new Set(
      existNorm.split(/\s+/).filter((w) => w.length > 3)
    );
    if (newWords.size === 0) return false;
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
          m.content.trim().toLowerCase().slice(0, 50) === newNorm.slice(0, 50)
      ) || existing[0];
    return match;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO memories (id, user_id, content, source, created_at)
    VALUES (${id}, ${userId}, ${memory.content}, ${memory.source}, ${now})
  `;

  const entry: Memory = {
    id,
    content: memory.content,
    source: memory.source,
    createdAt: now,
  };

  // Compact if we've hit the memory cap (existing + newly inserted)
  await compactIfNeeded(userId, existing.length + 1);

  return entry;
}

const MEMORY_CAP = 50;
const COMPACT_OLDEST = 20;
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
      prompt: `You are consolidating a user's memory entries. These are insights an AI assistant learned about a user over time. Many are redundant or outdated.

Consolidate these ${oldest.length} memories into at most ${COMPACT_TARGET} concise, high-value insights. Merge duplicates, generalize patterns, drop trivial observations. Each consolidated memory should be one clear sentence.

Memories to consolidate:
${oldestText}`,
    });

    // Delete the old memories
    const oldIds = oldest.map((m) => m.id);
    await sql`
      DELETE FROM memories
      WHERE user_id = ${userId}
        AND id = ANY(${oldIds})
    `;

    // Insert consolidated memories
    const now = new Date();
    for (const c of object.consolidated) {
      const id = crypto.randomUUID();
      await sql`
        INSERT INTO memories (id, user_id, content, source, created_at)
        VALUES (${id}, ${userId}, ${c.content}, ${c.source}, ${now.toISOString()})
      `;
    }
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
