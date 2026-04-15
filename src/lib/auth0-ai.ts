import { Auth0AI, getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { getRefreshToken } from "./auth0";
import { GOOGLE_CONNECTION, GOOGLE_SCOPES } from "./google-scopes";

export const getAccessToken = async () => getAccessTokenFromTokenVault();

const auth0AI = new Auth0AI();

// Google services (Gmail + Calendar)
export const withGoogleConnection = auth0AI.withTokenVault({
  connection: GOOGLE_CONNECTION,
  scopes: GOOGLE_SCOPES,
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
