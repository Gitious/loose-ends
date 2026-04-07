import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { generateDigestContent, buildDigestEmail, sendDigestEmail } from "@/lib/digest";
import { logAction } from "@/lib/audit";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 30;

/**
 * POST /api/cron/daily-digest
 *
 * Called from the client (user must be logged in) to generate and send
 * a daily digest email summarizing the user's current loose ends.
 *
 * Body: { looseEnds: LooseEnd[], junkCount: number }
 */
export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";

  // FGA check: require gmail.can_read to send a digest (it reads email data)
  const allowed = await checkPermission(userId, "gmail", "can_read");
  if (!allowed) {
    return Response.json(
      { error: "Permission denied. Enable Gmail Read in Settings to send digest." },
      { status: 403 }
    );
  }

  const userName =
    (typeof session.user?.name === "string" ? session.user.name.split(" ")[0] : null) ||
    session.user?.nickname ||
    "there";

  // Parse the loose ends from the request body
  let looseEnds: LooseEnd[];
  let junkCount: number;
  try {
    const body = await req.json();
    looseEnds = body.looseEnds || [];
    junkCount = body.junkCount ?? 0;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(looseEnds) || looseEnds.length > 200) {
    return Response.json({ error: "Invalid loose ends data" }, { status: 400 });
  }

  if (typeof junkCount !== "number" || junkCount < 0) {
    junkCount = 0;
  }

  if (looseEnds.length === 0) {
    return Response.json(
      { error: "No loose ends to digest. Your inbox is clear!" },
      { status: 400 },
    );
  }

  // Get Google token for sending email
  let googleToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({
      connection: "google-oauth2",
    });
    googleToken = result.token;
  } catch {
    await logAction({
      userId,
      action: "digest.send",
      service: "gmail",
      details: "Google not connected — cannot send digest",
      permitted: true,
      success: false,
    });
    return Response.json(
      { error: "Google account not connected. Connect Google in Settings to send digest emails." },
      { status: 401 },
    );
  }

  // Get user email from Gmail profile
  let userEmail: string;
  try {
    const profileRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${googleToken}` } },
    );
    if (!profileRes.ok) throw new Error("Profile fetch failed");
    const profile = await profileRes.json();
    userEmail = profile.emailAddress || session.user?.email || "";
  } catch {
    userEmail = session.user?.email || "";
  }

  if (!userEmail) {
    return Response.json({ error: "Could not determine email address" }, { status: 400 });
  }

  // Generate AI briefing with Haiku
  let briefing: string;
  try {
    briefing = await generateDigestContent(looseEnds, junkCount);
  } catch (err) {
    console.error("[digest] AI generation failed:", err);
    await logAction({
      userId,
      action: "digest.generate",
      service: "ai",
      details: `Briefing generation failed: ${String(err).slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Failed to generate digest briefing" }, { status: 500 });
  }

  // Build the email
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const subject = `Loose Ends Daily Digest — ${dateStr}`;

  // Determine dashboard URL from request origin
  const origin = new URL(req.url).origin;
  const dashboardUrl = `${origin}/dashboard`;

  const html = buildDigestEmail(briefing, userName, dashboardUrl, looseEnds, dateStr);

  // Send the email
  const result = await sendDigestEmail(googleToken, userEmail, userEmail, html, subject);

  if (!result.success) {
    console.error("[digest] Send failed:", result.error);
    await logAction({
      userId,
      action: "digest.send",
      service: "gmail",
      details: `Send failed: ${(result.error || "").slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Failed to send digest email" }, { status: 500 });
  }

  await logAction({
    userId,
    action: "digest.send",
    service: "gmail",
    details: `Daily digest sent to ${userEmail}`,
    permitted: true,
    success: true,
  });

  return Response.json({
    success: true,
    messageId: result.messageId,
    sentTo: userEmail,
  });
}
