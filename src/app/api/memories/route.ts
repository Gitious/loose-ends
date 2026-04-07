import { auth0 } from "@/lib/auth0";
import { loadMemories, deleteMemory, appendMemory } from "@/lib/memory";

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.sub;
  const memories = await loadMemories(userId);

  return Response.json(memories);
}

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { content, source } = body as Record<string, unknown>;
  if (!content || typeof content !== "string") {
    return Response.json({ error: "Missing content" }, { status: 400 });
  }

  if (content.length > 2000) {
    return Response.json({ error: "Content too long (max 2000 characters)" }, { status: 400 });
  }

  const userId = session.user.sub;
  const validSources = ["gmail", "calendar", "github", "slack", "chat", "agent"];
  const safeSource = typeof source === "string" && validSources.includes(source) ? source : "chat";
  const memory = await appendMemory(userId, {
    content: content.trim(),
    source: safeSource as "gmail" | "calendar" | "github" | "slack" | "chat" | "agent",
  });

  return Response.json(memory);
}

export async function DELETE(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const memoryId = url.searchParams.get("id");

  if (!memoryId) {
    return Response.json({ error: "Missing id parameter" }, { status: 400 });
  }

  // Validate UUID format to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryId)) {
    return Response.json({ error: "Invalid id format" }, { status: 400 });
  }

  const userId = session.user.sub;
  const deleted = await deleteMemory(userId, memoryId);

  if (!deleted) {
    return Response.json({ error: "Memory not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
