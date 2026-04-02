import { Auth0AI } from "@auth0/ai-vercel";
import { auth0 } from "./auth0";

const auth0AI = new Auth0AI();

export const withGmailAccess = auth0AI.withTokenVault({
  refreshToken: async () => {
    const session = await auth0.getSession();
    return session?.tokenSet.refreshToken!;
  },
  connection: "google-oauth2",
  scopes: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
});

export const withGitHubAccess = auth0AI.withTokenVault({
  refreshToken: async () => {
    const session = await auth0.getSession();
    return session?.tokenSet.refreshToken!;
  },
  connection: "github",
  scopes: ["repo", "read:user"],
});

export const withSendApproval = auth0AI.withAsyncAuthorization({
  userID: async () => {
    const user = await auth0.getSession();
    return user?.user.sub as string;
  },
  bindingMessage: async (params: { action: string; target: string }) =>
    `Approve: ${params.action} to ${params.target}`,
  scopes: ["openid"],
  audience: process.env.AUTH0_AUDIENCE!,
});
