export const GOOGLE_CONNECTION = "google-oauth2";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export function buildGoogleConnectUrl(returnTo = "/dashboard"): string {
  const params = new URLSearchParams();
  params.set("connection", GOOGLE_CONNECTION);
  params.set("returnTo", returnTo);
  for (const s of GOOGLE_SCOPES) params.append("scopes", s);
  return `/auth/connect?${params.toString()}`;
}
