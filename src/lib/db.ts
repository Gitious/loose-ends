import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export default sql;

/**
 * Initialize database tables. Called lazily on first use.
 */
let initialized = false;

export async function ensureTables() {
  if (initialized) return;
  initialized = true;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      action TEXT NOT NULL,
      service TEXT,
      target TEXT,
      details TEXT,
      permitted BOOLEAN NOT NULL DEFAULT TRUE,
      success BOOLEAN NOT NULL DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS permissions (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS autonomous_state (
      user_id TEXT PRIMARY KEY,
      last_hash TEXT,
      last_result TEXT,
      last_time TIMESTAMPTZ,
      last_notified_at TIMESTAMPTZ
    )
  `;

  // Add last_notified_at column if it doesn't exist (for existing deployments)
  await sql`
    ALTER TABLE autonomous_state
    ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS dismissed_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_key TEXT NOT NULL,
      title TEXT,
      sender TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Create indexes for common queries
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_entries(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_dismissed_user ON dismissed_items(user_id)`;
}
