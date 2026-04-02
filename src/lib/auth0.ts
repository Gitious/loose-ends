import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  authorizationParameters: {
    scope: process.env.AUTH0_SCOPE,
    audience: process.env.AUTH0_AUDIENCE,
  },
});

export async function getSession() {
  return auth0.getSession();
}

export async function getAccessToken() {
  const tokenResult = await auth0.getAccessToken();
  if (!tokenResult?.token) {
    throw new Error("No access token available");
  }
  return tokenResult.token;
}

export async function getUser() {
  const session = await auth0.getSession();
  return session?.user ?? null;
}
