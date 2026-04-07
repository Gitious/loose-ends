import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 300; // 5 min — allows time for CIBA approval

export async function POST(req: Request) {
  // 1. Auth check
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.sub || "";
  if (!userId) return Response.json({ error: "No user" }, { status: 401 });

  // Parse request body
  let item: LooseEnd | undefined;
  let params: { body_hint?: string } | undefined;
  try {
    const body = await req.json();
    item = body.item;
    params = body.params;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!item || typeof item !== "object") {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }
  if (!params || typeof params !== "object") {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }

  // 4. Extract repo info from item.meta (owner, repo, number)
  const owner = item.meta?.owner;
  const repo = item.meta?.repo;
  const number = item.meta?.number;

  if (!owner || !repo || !number) {
    return Response.json(
      { error: "Missing required meta fields: owner, repo, number" },
      { status: 400 },
    );
  }

  // Validate owner/repo format (GitHub allowed chars)
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
    return Response.json({ error: "Invalid owner or repo format" }, { status: 400 });
  }
  if (isNaN(Number(number))) {
    return Response.json({ error: "Invalid issue/PR number" }, { status: 400 });
  }

  const target = `${owner}/${repo}#${number}`;

  // 2. FGA check: github.can_comment
  const allowed = await checkPermission(userId, "github", "can_comment");
  if (!allowed) {
    await logAction({
      userId,
      action: "autonomous.post_comment",
      service: "github",
      target,
      details: "FGA denied: github.can_comment is off",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Permission denied: enable GitHub Comment in Agent Permissions" },
      { status: 403 },
    );
  }

  // 3. Get GitHub token via Auth0 Token Vault
  let githubToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "github" });
    githubToken = result.token;
  } catch {
    await logAction({
      userId,
      action: "autonomous.post_comment",
      service: "github",
      target,
      details: "GitHub not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "GitHub not connected" }, { status: 401 });
  }

  // 5. Generate comment content with Claude Haiku using body_hint
  const bodyHint = params.body_hint || "";
  const { text: commentBody } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: `You are writing a short, professional GitHub comment on behalf of a user.

Context:
- Repository: ${owner}/${repo}
- Issue/PR #${number}
- Title: ${item.title}
- Description: ${item.description}

The user's intent (body_hint): ${bodyHint}

Instructions:
- Write a short comment — 1-2 sentences maximum.
- Keep the tone professional and friendly.
- Do not add a greeting or sign-off — just the comment body.
- Do not use markdown headings.
- Reflect the intent of the body_hint accurately.`,
  });

  // 6. Build CIBA binding message: "Comment on {owner}/{repo}#{number}" (sanitized, <= 64 chars)
  // Allowed chars: alphanumerics, whitespace, and +-_.,:#@/ (slash for owner/repo)
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s+\-_.,:#@/]/g, "").trim();
  const rawMessage = `Comment on ${owner}/${repo}#${number}`;
  const sanitized = sanitize(rawMessage);
  const bindingMessage =
    sanitized.length > 64 ? sanitized.slice(0, 64).trim() : sanitized;

  console.log(`[Autonomous] Requesting CIBA approval: ${bindingMessage}`);

  // 7. requestCIBAApproval with 120s timeout
  const ciba = await requestCIBAApproval({
    userId,
    bindingMessage,
    timeoutSeconds: 120,
  });

  // 8. If denied: audit + return
  if (!ciba.approved) {
    await logAction({
      userId,
      action: "autonomous.post_comment",
      service: "github",
      target,
      details: `CIBA denied: ${ciba.error}`,
      permitted: true,
      success: false,
    });
    return Response.json({
      approved: false,
      error: ciba.error || "Action not approved. Check Auth0 Guardian on your phone.",
    });
  }

  // 9. If approved: POST to GitHub issues comments API
  console.log(`[Autonomous] CIBA approved, posting comment on ${target}`);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: commentBody }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      await logAction({
        userId,
        action: "autonomous.post_comment",
        service: "github",
        target,
        details: `GitHub API error ${res.status}: ${errText.slice(0, 100)}`,
        permitted: true,
        success: false,
      });
      return Response.json({
        approved: true,
        success: false,
        error: `Failed to post comment: ${errText.slice(0, 200)}`,
      });
    }

    const comment = await res.json();

    await logAction({
      userId,
      action: "autonomous.post_comment",
      service: "github",
      target,
      details: `Comment posted on ${target} via CIBA`,
      permitted: true,
      success: true,
    });

    return Response.json({
      approved: true,
      success: true,
      commentUrl: comment.html_url,
    });
  } catch (err: any) {
    await logAction({
      userId,
      action: "autonomous.post_comment",
      service: "github",
      target,
      details: `Unexpected error: ${err?.message}`,
      permitted: true,
      success: false,
    });
    return Response.json({
      approved: true,
      success: false,
      error: err?.message || "Unknown error",
    });
  }
}
