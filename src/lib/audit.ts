/**
 * Audit log system for tracking all AI agent actions.
 *
 * Every action the agent takes (or is denied from taking) is logged
 * with full context: who, what, when, permitted, and success status.
 *
 * Stores JSON files under <project-root>/data/audit/{sanitizedUserId}.json.
 */

import fs from "fs/promises";
import path from "path";
import { getDataDir, sanitizeUserId } from "./storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string; // "email.reply", "email.trash", "github.comment", "slack.send", "scan", "permission.update"
  service: string; // "gmail", "github", "slack", "calendar", "system"
  target?: string; // message ID, PR number, channel ID
  details?: string; // brief description of what happened
  permitted: boolean; // was the action allowed by FGA?
  success: boolean; // did the action succeed?
}

interface AuditLog {
  userId: string;
  entries: AuditEntry[];
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

const AUDIT_DIR = path.join(getDataDir(), "audit");

function filePath(userId: string): string {
  return path.join(AUDIT_DIR, `${sanitizeUserId(userId)}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(AUDIT_DIR, { recursive: true });
}

function generateId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append an action entry to the user's audit log.
 */
export async function logAction(
  entry: Omit<AuditEntry, "id" | "timestamp">
): Promise<void> {
  await ensureDir();

  const fullEntry: AuditEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  let log: AuditLog;
  try {
    const raw = await fs.readFile(filePath(entry.userId), "utf-8");
    log = JSON.parse(raw) as AuditLog;
  } catch {
    log = { userId: entry.userId, entries: [] };
  }

  log.entries.push(fullEntry);

  // Cap at 500 entries to prevent unbounded growth
  if (log.entries.length > 500) {
    log.entries = log.entries.slice(-500);
  }

  await fs.writeFile(filePath(entry.userId), JSON.stringify(log, null, 2), "utf-8");
}

/**
 * Get the user's audit log entries, newest first.
 * @param userId - The user ID
 * @param limit - Maximum number of entries to return (default 50)
 */
export async function getAuditLog(
  userId: string,
  limit: number = 50
): Promise<AuditEntry[]> {
  try {
    const raw = await fs.readFile(filePath(userId), "utf-8");
    const log = JSON.parse(raw) as AuditLog;
    // Return newest first, limited
    return log.entries.slice().reverse().slice(0, limit);
  } catch {
    return [];
  }
}
