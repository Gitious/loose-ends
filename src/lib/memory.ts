/**
 * Simple file-backed memory store for per-user insights.
 *
 * Stores JSON files under {dataDir}/memories/{sanitizedUserId}.json.
 * Uses fs.promises so it works in Node.js runtime API routes.
 * On Vercel, uses /tmp for writable storage (ephemeral between cold starts).
 */

import fs from "fs/promises";
import path from "path";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDataDir, sanitizeUserId } from "./storage";

export interface Memory {
  id: string;
  content: string;
  source: "gmail" | "calendar" | "github" | "slack" | "chat" | "agent";
  createdAt: string; // ISO 8601
}

export interface UserMemoryFile {
  userId: string;
  memories: Memory[];
}

/** Directory for memory files (adapts to Vercel vs local) */
const MEMORIES_DIR = path.join(getDataDir(), "memories");

function filePath(userId: string): string {
  return path.join(MEMORIES_DIR, `${sanitizeUserId(userId)}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(MEMORIES_DIR, { recursive: true });
}

/**
 * Load all memories for a user.
 * Returns an empty array if the file does not exist yet.
 */
export async function loadMemories(userId: string): Promise<Memory[]> {
  try {
    const raw = await fs.readFile(filePath(userId), "utf-8");
    const data: UserMemoryFile = JSON.parse(raw);
    return data.memories ?? [];
  } catch {
    // File doesn't exist yet — that's fine
    return [];
  }
}

/**
 * Append a single memory entry for a user.
 */
export async function appendMemory(
  userId: string,
  memory: Omit<Memory, "id" | "createdAt">
): Promise<Memory> {
  await ensureDir();

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
    const newWords = new Set(newNorm.split(/\s+/).filter(w => w.length > 3));
    const existWords = new Set(existNorm.split(/\s+/).filter(w => w.length > 3));
    if (newWords.size === 0) return false;
    let overlap = 0;
    for (const w of newWords) { if (existWords.has(w)) overlap++; }
    return overlap / newWords.size > 0.7;
  });

  if (isDupe) {
    // Return the existing similar memory instead of creating a duplicate
    const match = existing.find((m) => m.content.trim().toLowerCase().slice(0, 50) === newNorm.slice(0, 50)) || existing[0];
    return match;
  }

  const entry: Memory = {
    id: crypto.randomUUID(),
    content: memory.content,
    source: memory.source,
    createdAt: new Date().toISOString(),
  };

  let updated = [...existing, entry];

  // Compact if we've hit the memory cap
  updated = await compactIfNeeded(userId, updated);

  const file: UserMemoryFile = { userId, memories: updated };
  await fs.writeFile(filePath(userId), JSON.stringify(file, null, 2), "utf-8");
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
async function compactIfNeeded(userId: string, memories: Memory[]): Promise<Memory[]> {
  if (memories.length < MEMORY_CAP) return memories;

  // Sort oldest first
  const sorted = [...memories].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const oldest = sorted.slice(0, COMPACT_OLDEST);
  const keep = sorted.slice(COMPACT_OLDEST);

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
            source: z.enum(["gmail", "calendar", "github", "slack", "chat", "agent"]),
          })
        ),
      }),
      prompt: `You are consolidating a user's memory entries. These are insights an AI assistant learned about a user over time. Many are redundant or outdated.

Consolidate these ${oldest.length} memories into at most ${COMPACT_TARGET} concise, high-value insights. Merge duplicates, generalize patterns, drop trivial observations. Each consolidated memory should be one clear sentence.

Memories to consolidate:
${oldestText}`,
    });

    const compacted: Memory[] = object.consolidated.map((c) => ({
      id: crypto.randomUUID(),
      content: c.content,
      source: c.source,
      createdAt: new Date().toISOString(),
    }));

    const result = [...compacted, ...keep];

    // Save immediately
    await ensureDir();
    const file: UserMemoryFile = { userId, memories: result };
    await fs.writeFile(filePath(userId), JSON.stringify(file, null, 2), "utf-8");

    return result;
  } catch (err) {
    console.error("[memory] Compaction failed, skipping:", err);
    return memories; // graceful fallback — don't lose data
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
  await ensureDir();

  const existing = await loadMemories(userId);
  const filtered = existing.filter((m) => m.id !== memoryId);

  if (filtered.length === existing.length) return false;

  const file: UserMemoryFile = { userId, memories: filtered };
  await fs.writeFile(filePath(userId), JSON.stringify(file, null, 2), "utf-8");
  return true;
}
