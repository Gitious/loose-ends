/**
 * Audit log system for tracking all AI agent actions.
 *
 * Every action the agent takes (or is denied from taking) is logged
 * with full context: who, what, when, permitted, and success status.
 *
 * Stores rows in the Neon Postgres `audit_entries` table.
 */

import sql, { ensureTables } from "./db";

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

// ---------------------------------------------------------------------------
// Initialization guard
// ---------------------------------------------------------------------------

let tablesReady: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!tablesReady) {
    tablesReady = ensureTables();
  }
  return tablesReady;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append an action entry to the audit log.
 */
export async function logAction(
  entry: Omit<AuditEntry, "id" | "timestamp">
): Promise<void> {
  try {
    await ensureReady();

    const id = crypto.randomUUID();

    await sql`
      INSERT INTO audit_entries (id, user_id, action, service, target, details, permitted, success)
      VALUES (
        ${id},
        ${entry.userId},
        ${entry.action},
        ${entry.service},
        ${entry.target ?? null},
        ${entry.details ?? null},
        ${entry.permitted},
        ${entry.success}
      )
    `;
  } catch (err) {
    console.error("[audit] logAction failed:", err);
  }
}

/**
 * Get the user's audit log entries, newest first.
 * @param userId - The user ID
 * @param limit - Maximum number of entries to return (default 50, max 500)
 */
export async function getAuditLog(
  userId: string,
  limit: number = 50
): Promise<AuditEntry[]> {
  try {
    await ensureReady();

    const safeLimit = Math.min(Math.max(1, limit), 500);

    const rows = await sql`
      SELECT id, user_id, timestamp, action, service, target, details, permitted, success
      FROM audit_entries
      WHERE user_id = ${userId}
      ORDER BY timestamp DESC
      LIMIT ${safeLimit}
    `;

    return rows.map((r) => ({
      id: r.id as string,
      timestamp: (r.timestamp as Date).toISOString(),
      userId: r.user_id as string,
      action: r.action as string,
      service: r.service as string,
      target: (r.target as string) ?? undefined,
      details: (r.details as string) ?? undefined,
      permitted: r.permitted as boolean,
      success: r.success as boolean,
    }));
  } catch (err) {
    console.error("[audit] getAuditLog failed:", err);
    return [];
  }
}
