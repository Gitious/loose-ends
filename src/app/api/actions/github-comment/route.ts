import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  // FGA check: github.can_comment
  const userId = session.user?.sub || session.user?.email || "anonymous";
  const allowed = await checkPermission(userId, "github", "can_comment");

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { owner, repo, number, body } = parsed as Record<string, unknown>;

  if (
    typeof owner !== "string" || typeof repo !== "string" ||
    typeof body !== "string" || !number ||
    !/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo) ||
    isNaN(Number(number))
  ) {
    return Response.json({ error: "Invalid parameters" }, { status: 400 });
  }

  if (body.length > 65536) {
    return Response.json({ error: "Comment body too long" }, { status: 400 });
  }

  const target = `${owner}/${repo}#${number}`;

  if (!allowed) {
    await logAction({
      userId,
      action: "github.comment",
      service: "github",
      target,
      details: "Permission denied for GitHub comment",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable GitHub actions in Settings." },
      { status: 403 }
    );
  }

  if (!owner || !repo || !number || !body) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  let token: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "github" });
    token = result.token;
  } catch {
    await logAction({
      userId,
      action: "github.comment",
      service: "github",
      target,
      details: "GitHub not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "GitHub not connected" }, { status: 401 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    await logAction({
      userId,
      action: "github.comment",
      service: "github",
      target,
      details: `Comment failed: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Failed to post comment" }, { status: 500 });
  }

  const comment = await res.json();
  await logAction({
    userId,
    action: "github.comment",
    service: "github",
    target,
    details: `Comment posted on ${target}`,
    permitted: true,
    success: true,
  });
  return Response.json({ success: true, commentUrl: comment.html_url });
}
