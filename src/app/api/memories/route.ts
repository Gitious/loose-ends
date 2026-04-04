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

  const { content, source } = await request.json();
  if (!content || typeof content !== "string") {
    return Response.json({ error: "Missing content" }, { status: 400 });
  }

  const userId = session.user.sub;
  const validSources = ["gmail", "calendar", "github", "slack", "chat", "agent"];
  const memory = await appendMemory(userId, {
    content: content.trim(),
    source: validSources.includes(source) ? source : "chat",
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

  const userId = session.user.sub;
  const deleted = await deleteMemory(userId, memoryId);

  if (!deleted) {
    return Response.json({ error: "Memory not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
