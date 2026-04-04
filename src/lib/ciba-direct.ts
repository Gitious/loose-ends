/**
 * Direct CIBA client for autonomous flows (outside chat tool wrapper).
 * Calls Auth0's backchannel.authorize() and polls for approval.
 */
import { AuthenticationClient } from "auth0";

const auth0Client = new AuthenticationClient({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CIBAResult {
  approved: boolean;
  error?: string;
}

/**
 * Send a CIBA push notification and block until the user approves/denies.
 * Returns { approved: true } on approval, { approved: false, error } on denial/timeout.
 */
export async function requestCIBAApproval({
  userId,
  bindingMessage,
  scope = "openid",
  audience,
  timeoutSeconds = 120,
}: {
  userId: string;
  bindingMessage: string;
  scope?: string;
  audience?: string;
  timeoutSeconds?: number;
}): Promise<CIBAResult> {
  try {
    // Initiate CIBA request — sends Guardian push notification
    const response = await auth0Client.backchannel.authorize({
      userId,
      binding_message: bindingMessage,
      scope,
      audience: audience || process.env.AUTH0_AUDIENCE || "https://loose-ends-api",
      requested_expiry: String(timeoutSeconds),
    });

    const { auth_req_id, interval = 5, expires_in = timeoutSeconds } = response;
    const deadline = Date.now() + expires_in * 1000;

    // Poll for approval
    while (Date.now() < deadline) {
      await sleep(interval * 1000);

      try {
        await auth0Client.backchannel.backchannelGrant({
          auth_req_id,
        } as any);
        // If we get here without error, the user approved
        return { approved: true };
      } catch (err: any) {
        const errorCode = err?.error || err?.code || "";
        if (errorCode === "authorization_pending" || errorCode === "slow_down") {
          continue; // Still waiting
        }
        if (errorCode === "access_denied") {
          return { approved: false, error: "User denied the request" };
        }
        if (errorCode === "expired_token") {
          return { approved: false, error: "Request expired" };
        }
        // Unknown error — bail
        return { approved: false, error: err?.message || String(err) };
      }
    }

    return { approved: false, error: "Timed out waiting for approval" };
  } catch (err: any) {
    console.error("[CIBA-direct] Failed to initiate:", err?.message);
    return { approved: false, error: err?.message || "Failed to send push notification" };
  }
}
