import { auth0 } from "@/lib/auth0";
import sql, { ensureTables } from "@/lib/db";
import { appendMemory } from "@/lib/memory";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const { itemId, itemType, itemKey, title, sender } = await req.json();

  if (!itemId || !itemType || !itemKey) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  await ensureTables();

  // Persist dismissal so it survives across scans
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO dismissed_items (id, user_id, item_type, item_key, title, sender, created_at)
    VALUES (${id}, ${userId}, ${itemType}, ${itemKey}, ${title || null}, ${sender || null}, ${new Date().toISOString()})
    ON CONFLICT (id) DO NOTHING
  `;

  // Save a memory so the agent learns from dismissal patterns
  const senderName = sender ? sender.split("<")[0].trim() : "unknown";
  await appendMemory(userId, {
    content: `User dismissed ${itemType}: "${title || "untitled"}" from ${senderName}`,
    source: "agent",
  });

  return Response.json({ success: true });
}
