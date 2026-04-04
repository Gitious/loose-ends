import { Auth0AI } from "@auth0/ai-vercel";
import { FSStore } from "@auth0/ai/stores";
import { auth0 } from "./auth0";

// Separate Auth0AI instance for CIBA with persistent file store
// (default MemoryStore loses state between serverless invocations)
const cibaAI = new Auth0AI({
  store: new FSStore(".data/ciba-store.json"),
});

/**
 * Sanitize a string for CIBA binding messages.
 * Auth0 only allows: alphanumerics, whitespace, and +-_.,:#
 * Everything else is stripped.
 */
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9\s+\-_.,:#@]/g, "").trim();
}

/**
 * Build a human-readable binding message for the Guardian push notification
 * based on the tool arguments. Keeps it short and descriptive.
 * All output is sanitized to only CIBA-allowed characters.
 */
function buildBindingMessage(args: Record<string, any>): string {
  // bulkTrashJunk: { messageIds, reason }
  if (Array.isArray(args.messageIds) && args.reason) {
    return sanitize(`Trash ${args.messageIds.length} junk emails`);
  }

  // trashEmail: { messageId, reason }
  if (args.messageId && args.reason) {
    const reason = String(args.reason).slice(0, 40);
    return sanitize(`Trash email: ${reason}`);
  }

  // sendEmailReply: { threadId, to, subject, body }
  if (args.threadId && args.to && args.subject) {
    const subject = String(args.subject).slice(0, 30);
    return sanitize(`Send email to ${args.to}: ${subject}`);
  }

  // sendNewEmail: { to, subject, body } (no threadId)
  if (args.to && args.subject && args.body && !args.threadId) {
    const subject = String(args.subject).slice(0, 30);
    return sanitize(`Send email to ${args.to}: ${subject}`);
  }

  // reviewPullRequest: { owner, repo, prNumber, event, body }
  if (args.owner && args.repo && args.prNumber) {
    const action = (args.event || "review").toLowerCase().replace(/_/g, " ");
    return sanitize(`${action.charAt(0).toUpperCase() + action.slice(1)} PR ${args.owner}/${args.repo}#${args.prNumber}`);
  }

  // sendSlackMessage: { channel, text }
  if (args.channel && args.text) {
    const preview = String(args.text).slice(0, 30);
    return sanitize(`Post to Slack ${args.channel}: ${preview}`);
  }

  return "Loose Ends: perform an action";
}

/**
 * CIBA authorizer for high-stakes actions.
 * Sends a push notification via Auth0 Guardian and waits for user approval.
 * Used for Tier 3 actions: sending emails, approving PRs, posting messages.
 *
 * NOTE: authorizationDetails (RFC 9396 RAR) is intentionally omitted.
 * The Auth0 resource server must be configured to accept custom RAR types
 * before they can be used. The binding message alone is sufficient for the
 * Guardian push notification to show what action the agent wants to take.
 */
export const withCIBA = cibaAI.withAsyncAuthorization({
  scopes: ["openid"],
  audience: process.env.AUTH0_AUDIENCE || "https://loose-ends-api",

  userID: async () => {
    const session = await auth0.getSession();
    const sub = session?.user?.sub;
    if (!sub) {
      throw new Error(
        "[CIBA] No authenticated user — session or user.sub is missing. " +
          "The user must be logged in before CIBA authorization can proceed."
      );
    }
    return sub;
  },

  bindingMessage: async (toolArgs: any) => {
    const msg = buildBindingMessage(toolArgs ?? {});
    console.log("[CIBA] Binding message:", msg);
    console.log("[CIBA] Initiating backchannel authorization...");
    return msg;
  },

  // RAR removed — Auth0 API rejects custom authorization_details types
  // unless explicitly configured in the Dashboard. The binding message
  // is sufficient for Guardian push notifications.

  requestedExpiry: 300, // 5 minutes to approve

  // Block mode: tool execution waits until user approves on their phone
  onAuthorizationRequest: "block",

  // Credentials valid for a single tool call
  credentialsContext: "tool-call",

  // FAIL-CLOSED: when CIBA fails for ANY reason (user denies, config error,
  // timeout), THROW so the tool does NOT execute and safeTool reports the error.
  // Previously this RETURNED an error object, which the model misinterpreted as success.
  onUnauthorized: (err) => {
    const msg = err?.message || "unknown error";
    console.error("[CIBA] Unauthorized — THROWING to prevent tool execution:", msg);
    throw new Error(
      `Action blocked: Guardian approval required. ${msg}`
    );
  },
});
