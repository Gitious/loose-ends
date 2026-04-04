import { Auth0AI, getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { getRefreshToken } from "./auth0";

export const getAccessToken = async () => getAccessTokenFromTokenVault();

const auth0AI = new Auth0AI();

// Google services (Gmail + Calendar)
export const withGoogleConnection = auth0AI.withTokenVault({
  connection: "google-oauth2",
  scopes: [
    "openid",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  refreshToken: getRefreshToken,
});

// GitHub
export const withGitHubConnection = auth0AI.withTokenVault({
  connection: "github",
  scopes: ["read:user", "repo"],
  refreshToken: getRefreshToken,
});

// Slack — custom OAuth2 connection using oauth.v2.user.access for top-level user tokens
export const withSlackConnection = auth0AI.withTokenVault({
  connection: "sign-in-with-slack",
  scopes: [],
  refreshToken: getRefreshToken,
});
