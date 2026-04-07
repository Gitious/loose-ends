/**
 * Plate — a structured scratchpad summarizing what's on the user's plate.
 * Updated on every scan. Read by the chat route for agent context.
 * Stored as a single JSONB row per user in Neon.
 */

import sql, { ensureTables } from "./db";
import { sanitizeUserId } from "./storage";
import type { LooseEnd, JunkEmail } from "./types";

export interface PlateData {
  /** When this plate was last built */
  updatedAt: string;
  /** Total active items */
  total: number;
  /** Breakdown by urgency */
  urgent: number;
  attention: number;
  low: number;
  /** Breakdown by service */
  emails: number;
  meetings: number;
  reviews: number;
  messages: number;
  /** Junk pending cleanup */
  junk: number;
  /** Top 5 urgent items (title + type + age) for agent context */
  topItems: Array<{ title: string; type: string; age: string; urgency: string }>;
  /** One-line summary for the system prompt */
  summary: string;
}

/** Build plate data from scan results. */
export function buildPlate(looseEnds: LooseEnd[], junkEmails: JunkEmail[]): PlateData {
  const urgent = looseEnds.filter((le) => le.urgency === "red");
  const attention = looseEnds.filter((le) => le.urgency === "yellow");
  const low = looseEnds.filter((le) => le.urgency === "green");

  const emails = looseEnds.filter((le) => le.type === "email").length;
  const meetings = looseEnds.filter((le) => le.type === "calendar").length;
  const reviews = looseEnds.filter((le) => le.type === "github").length;
  const messages = looseEnds.filter((le) => le.type === "slack").length;

  const topItems = urgent
    .concat(attention)
    .slice(0, 5)
    .map((le) => ({ title: le.title, type: le.type, age: le.age, urgency: le.urgency }));

  // Build a natural-language summary
  const parts: string[] = [];
  if (emails > 0) parts.push(`${emails} email${emails !== 1 ? "s" : ""} (${urgent.filter((l) => l.type === "email").length} urgent)`);
  if (reviews > 0) parts.push(`${reviews} PR review${reviews !== 1 ? "s" : ""}`);
  if (meetings > 0) parts.push(`${meetings} meeting${meetings !== 1 ? "s" : ""}`);
  if (messages > 0) parts.push(`${messages} Slack message${messages !== 1 ? "s" : ""}`);
  if (junkEmails.length > 0) parts.push(`${junkEmails.length} junk to clean`);

  const load = looseEnds.length;
  const loadLabel = load === 0 ? "clear" : urgent.length >= 5 ? "heavy" : urgent.length >= 2 ? "moderate" : "light";

  const summary = parts.length > 0
    ? `${parts.join(", ")}. Load: ${load} items (${loadLabel}).`
    : "Plate is clear — nothing pending.";

  return {
    updatedAt: new Date().toISOString(),
    total: looseEnds.length,
    urgent: urgent.length,
    attention: attention.length,
    low: low.length,
    emails,
    meetings,
    reviews,
    messages,
    junk: junkEmails.length,
    topItems,
    summary,
  };
}

/** Save plate to DB. Called after each scan. */
export async function savePlate(userId: string, plate: PlateData): Promise<void> {
  await ensureTables();
  const key = sanitizeUserId(userId);
  await sql`
    INSERT INTO plate (user_id, data, updated_at)
    VALUES (${key}, ${JSON.stringify(plate)}, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET data = ${JSON.stringify(plate)}, updated_at = NOW()
  `;
}

/** Load plate from DB. Called by the chat route. */
export async function loadPlate(userId: string): Promise<PlateData | null> {
  await ensureTables();
  const key = sanitizeUserId(userId);
  const rows = await sql`SELECT data, updated_at FROM plate WHERE user_id = ${key}`;
  if (rows.length === 0) return null;

  const plate = rows[0].data as PlateData;
  const updatedAt = new Date(rows[0].updated_at as string);
  const ageMinutes = (Date.now() - updatedAt.getTime()) / 60000;

  // Mark as stale if older than 30 minutes
  if (ageMinutes > 30) {
    plate.summary = `(Stale — last scanned ${Math.round(ageMinutes)}m ago) ${plate.summary}`;
  }

  return plate;
}
