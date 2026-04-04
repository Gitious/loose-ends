import { auth0 } from "@/lib/auth0";
import { loadPermissions, updatePermissions, getFgaMode } from "@/lib/fga";
import { logAction } from "@/lib/audit";

/**
 * GET /api/permissions — returns the current user's FGA permissions
 * plus metadata about which FGA backend is active.
 */
export async function GET() {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const permissions = await loadPermissions(userId);
  return Response.json({
    ...permissions,
    _fgaMode: getFgaMode(),
  });
}

/**
 * PUT /api/permissions — updates (partial merge) the user's FGA permissions.
 *
 * Body example: { "gmail": { "can_reply": false } }
 */
export async function PUT(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build a human-readable summary of what changed
  const changes: string[] = [];
  for (const [service, perms] of Object.entries(body)) {
    if (typeof perms === "object" && perms !== null) {
      for (const [action, value] of Object.entries(perms as Record<string, unknown>)) {
        changes.push(`${service}.${action} = ${value}`);
      }
    }
  }

  const updated = await updatePermissions(userId, body);

  await logAction({
    userId,
    action: "permission.update",
    service: "system",
    details: `[${getFgaMode()}] ${changes.join(", ") || "No changes"}`,
    permitted: true,
    success: true,
  });

  return Response.json({
    ...updated,
    _fgaMode: getFgaMode(),
  });
}
