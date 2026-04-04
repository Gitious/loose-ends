import { auth0 } from "@/lib/auth0";

/**
 * Attempt to fetch an access token for a Token Vault connection.
 * Returns true if the connection is active (token retrieved successfully),
 * false otherwise.
 *
 * Note: session.connectionTokenSets is only populated *after*
 * getAccessTokenForConnection has been called at least once for that
 * connection — it is a session-level cache, not a source of truth.
 * The only reliable way to check whether Token Vault holds a connection
 * is to attempt the token exchange.
 */
async function isConnectionActive(connection: string): Promise<boolean> {
  try {
    await auth0.getAccessTokenForConnection({ connection });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await auth0.getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sub = session.user?.sub ?? "";
  const primaryGoogle = sub.startsWith("google-oauth2|");
  const primaryGitHub = sub.startsWith("github|");

  // Check Token Vault connections in parallel
  const [google, github, slack] = await Promise.all([
    isConnectionActive("google-oauth2"),
    isConnectionActive("github"),
    isConnectionActive("sign-in-with-slack"),
  ]);

  return Response.json({
    google: google || primaryGoogle,
    github,
    slack,
    loginProvider: primaryGitHub ? "github" : primaryGoogle ? "google" : "other",
  });
}
