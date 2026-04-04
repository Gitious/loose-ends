import { auth0 } from "@/lib/auth0";
import { getAuditLog } from "@/lib/audit";

/**
 * GET /api/audit — returns the current user's audit log (last 50 entries, newest first).
 */
export async function GET() {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const entries = await getAuditLog(userId, 50);
  return Response.json({ entries });
}
