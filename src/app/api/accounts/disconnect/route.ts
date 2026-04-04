import { auth0 } from "@/lib/auth0";

const CONNECTION_MAP: Record<string, string> = {
  "google-oauth2": "google-oauth2",
  github: "github",
  "sign-in-with-slack": "sign-in-with-slack",
};

export async function POST(request: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { connection?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const connection = body.connection;
  if (!connection || !CONNECTION_MAP[connection]) {
    return Response.json(
      { error: "Invalid connection. Must be one of: google-oauth2, github, sign-in-with-slack" },
      { status: 400 }
    );
  }

  const sub = session.user?.sub ?? "";

  // Attempt to unlink via the Auth0 Management API.
  // This requires the Management API client ID/secret and appropriate scopes.
  const domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL?.replace("https://", "");
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;

  if (!domain || !clientId || !clientSecret) {
    return Response.json(
      {
        success: false,
        message:
          "Disconnect is not fully configured. To disconnect, visit your Auth0 account settings or contact support.",
      },
      { status: 200 }
    );
  }

  try {
    // Get a Management API token
    const tokenRes = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        audience: `https://${domain}/api/v2/`,
        grant_type: "client_credentials",
      }),
    });

    if (!tokenRes.ok) {
      return Response.json(
        {
          success: false,
          message:
            "Unable to disconnect at this time. You can revoke access from the connected service's settings directly.",
        },
        { status: 200 }
      );
    }

    const { access_token } = await tokenRes.json();

    // Find the linked identity for this connection
    const userRes = await fetch(
      `https://${domain}/api/v2/users/${encodeURIComponent(sub)}`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!userRes.ok) {
      return Response.json(
        {
          success: false,
          message:
            "Unable to look up your account. Please try again or revoke access from the service directly.",
        },
        { status: 200 }
      );
    }

    const user = await userRes.json();
    const identities: Array<{ connection: string; provider: string; user_id: string }> =
      user.identities || [];

    const linked = identities.find(
      (id) => id.connection === CONNECTION_MAP[connection]
    );

    if (!linked) {
      // The connection may be stored in Token Vault but not as a linked identity.
      // Return success-ish — the token will expire naturally.
      return Response.json({
        success: true,
        message:
          "Connection not found as a linked identity. The stored token will expire automatically. You may need to re-authenticate to fully clear it.",
      });
    }

    // Check if this is the primary identity — we can't unlink the primary
    const isPrimary = identities[0]?.connection === linked.connection && identities[0]?.user_id === linked.user_id;
    if (isPrimary) {
      return Response.json({
        success: false,
        message:
          "This is your primary login method and cannot be disconnected. You can disconnect other linked accounts.",
      });
    }

    // Unlink the identity
    const unlinkRes = await fetch(
      `https://${domain}/api/v2/users/${encodeURIComponent(sub)}/identities/${linked.provider}/${linked.user_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!unlinkRes.ok) {
      const errBody = await unlinkRes.text();
      console.error("Failed to unlink identity:", errBody);
      return Response.json(
        {
          success: false,
          message:
            "Failed to disconnect. The Management API may not have the required scopes (update:users). You can revoke access from the service's settings.",
        },
        { status: 200 }
      );
    }

    return Response.json({
      success: true,
      message: `Successfully disconnected ${connection}.`,
    });
  } catch (err) {
    console.error("Disconnect error:", err);
    return Response.json(
      {
        success: false,
        message:
          "An unexpected error occurred. Please try again or revoke access from the service directly.",
      },
      { status: 500 }
    );
  }
}
