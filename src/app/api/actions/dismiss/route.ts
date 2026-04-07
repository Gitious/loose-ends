import { auth0 } from "@/lib/auth0";
import sql, { ensureTables } from "@/lib/db";
import { appendMemory } from "@/lib/memory";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { itemId, itemType, itemKey, title, sender } = body as Record<string, unknown>;

  if (
    !itemId || typeof itemId !== "string" ||
    !itemType || typeof itemType !== "string" ||
    !itemKey || typeof itemKey !== "string"
  ) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Validate itemType against known types
  const validTypes = ["email", "calendar", "github", "slack"];
  if (!validTypes.includes(itemType)) {
    return Response.json({ error: "Invalid item type" }, { status: 400 });
  }

  // Length limits
  if (itemId.length > 500 || itemKey.length > 500) {
    return Response.json({ error: "Input too long" }, { status: 400 });
  }

  await ensureTables();

  // Persist dismissal so it survives across scans
  const id = crypto.randomUUID();
  const safeTitle = typeof title === "string" ? title.slice(0, 500) : null;
  const safeSender = typeof sender === "string" ? sender.slice(0, 500) : null;

  await sql`
    INSERT INTO dismissed_items (id, user_id, item_type, item_key, title, sender, created_at)
    VALUES (${id}, ${userId}, ${itemType}, ${itemKey}, ${safeTitle}, ${safeSender}, ${new Date().toISOString()})
    ON CONFLICT (id) DO NOTHING
  `;

  // Save a memory so the agent learns from dismissal patterns
  const senderName = safeSender ? safeSender.split("<")[0].trim() : "unknown";
  await appendMemory(userId, {
    content: `User dismissed ${itemType}: "${safeTitle || "untitled"}" from ${senderName}`,
    source: "agent",
  });

  return Response.json({ success: true });
}
