import { Auth0AI } from "@auth0/ai-vercel";
import { FSStore } from "@auth0/ai/stores";
import { auth0 } from "./auth0";

// Separate Auth0AI instance for CIBA with persistent file store
// (default MemoryStore loses state between serverless invocations)
const cibaAI = new Auth0AI({
  store: new FSStore(".data/ciba-store.json"),
});

/**
 * Build a human-readable binding message for the Guardian push notification
 * based on the tool arguments. Keeps it short and descriptive.
 */
function buildBindingMessage(args: Record<string, any>): string {
  // trashEmail: { messageId, reason }
  if (args.messageId && args.reason) {
    const reason = args.reason.length > 40 ? args.reason.slice(0, 40) + "…" : args.reason;
    return `Trash email: ${reason}`;
  }

  // sendEmailReply: { threadId, to, subject, body }
  if (args.threadId && args.to && args.subject) {
    const subject =
      args.subject.length > 30 ? args.subject.slice(0, 30) + "…" : args.subject;
    return `Send email to ${args.to}: ${subject}`;
  }

  // sendNewEmail: { to, subject, body } (no threadId)
  if (args.to && args.subject && args.body && !args.threadId) {
    const subject =
      args.subject.length > 30 ? args.subject.slice(0, 30) + "…" : args.subject;
    return `Send email to ${args.to}: ${subject}`;
  }

  // reviewPullRequest: { owner, repo, prNumber, event, body }
  if (args.owner && args.repo && args.prNumber) {
    const action = (args.event || "review").toLowerCase().replace(/_/g, " ");
    return `${action.charAt(0).toUpperCase() + action.slice(1)} PR ${args.owner}/${args.repo}#${args.prNumber}`;
  }

  // sendSlackMessage: { channel, text }
  if (args.channel && args.text) {
    const preview = args.text.length > 30 ? args.text.slice(0, 30) + "…" : args.text;
    return `Post to Slack ${args.channel}: ${preview}`;
  }

  return "Loose Ends: perform an action";
}

/**
 * Build RFC 9396 Rich Authorization Request details from tool arguments.
 * Each element has a `type` string and contextual fields so the Guardian
 * push notification can show exactly what the agent wants to do.
 */
function buildAuthorizationDetails(
  args: Record<string, any>
): Array<{ type: string; [key: string]: unknown }> {
  // trashEmail
  if (args.messageId && args.reason) {
    return [
      {
        type: "gmail_action",
        actions: ["trash"],
        messageId: args.messageId,
        reason: args.reason,
      },
    ];
  }

  // sendEmailReply
  if (args.threadId && args.to && args.subject) {
    return [
      {
        type: "gmail_action",
        actions: ["send_reply"],
        threadId: args.threadId,
        to: args.to,
        subject: args.subject,
      },
    ];
  }

  // sendNewEmail (no threadId)
  if (args.to && args.subject && args.body && !args.threadId) {
    return [
      {
        type: "gmail_action",
        actions: ["send"],
        to: args.to,
        subject: args.subject,
      },
    ];
  }

  // reviewPullRequest
  if (args.owner && args.repo && args.prNumber) {
    return [
      {
        type: "github_action",
        actions: ["review_pull_request"],
        owner: args.owner,
        repo: args.repo,
        prNumber: args.prNumber,
        event: args.event,
      },
    ];
  }

  // sendSlackMessage
  if (args.channel && args.text) {
    return [
      {
        type: "slack_action",
        actions: ["send_message"],
        channel: args.channel,
      },
    ];
  }

  return [{ type: "loose_ends_action", actions: ["unknown"] }];
}

/**
 * CIBA authorizer for high-stakes actions.
 * Sends a push notification via Auth0 Guardian and waits for user approval.
 * Used for Tier 3 actions: sending emails, approving PRs, posting messages.
 *
 * Includes RFC 9396 Rich Authorization Requests so Guardian shows exactly
 * what the agent wants to do (e.g. "Send email to jane@example.com: Re: Q2 Budget").
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
    return buildBindingMessage(toolArgs ?? {});
  },

  authorizationDetails: async (toolArgs: any) => {
    return buildAuthorizationDetails(toolArgs ?? {});
  },

  requestedExpiry: 300, // 5 minutes to approve

  // Block mode: tool execution waits until user approves on their phone
  // (no manual retry needed — the request hangs until Guardian approval comes through)
  onAuthorizationRequest: "block",

  // Credentials valid for a single tool call
  credentialsContext: "tool-call",

  // When user denies or request expires, return a friendly message
  onUnauthorized: (err) => {
    console.error("[CIBA] Unauthorized:", err?.message);
    return {
      error: `Action not approved: ${err?.message || "unknown error"}. Check Auth0 Guardian on your phone.`,
      denied: true,
    };
  },
});
