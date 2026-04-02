import { auth0 } from "@/lib/auth0";
import type { NextRequest } from "next/server";

// In @auth0/nextjs-auth0 v4, auth routes are handled by the middleware.
// This route handler delegates to the middleware for any requests that
// reach /api/auth/* directly (e.g., from legacy links or redirects).
export async function GET(request: NextRequest) {
  return auth0.middleware(request);
}

export async function POST(request: NextRequest) {
  return auth0.middleware(request);
}
