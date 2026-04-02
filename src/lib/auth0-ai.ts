import { Auth0AI } from "@auth0/ai-vercel";
import { auth0 } from "./auth0";

const auth0AI = new Auth0AI();

async function getRefreshToken(): Promise<string> {
  const session = await auth0.getSession();
  const token = session?.tokenSet.refreshToken;
  if (!token) {
    throw new Error("No refresh token available — user may need to re-authenticate");
  }
  return token;
}

export const withGmailAccess = auth0AI.withTokenVault({
  refreshToken: getRefreshToken,
  connection: "google-oauth2",
  scopes: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ],
});

export const withCalendarAccess = auth0AI.withTokenVault({
  refreshToken: getRefreshToken,
  connection: "google-oauth2",
  scopes: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
});

export const withGitHubAccess = auth0AI.withTokenVault({
  refreshToken: getRefreshToken,
  connection: "github",
  scopes: ["repo", "read:user"],
});

