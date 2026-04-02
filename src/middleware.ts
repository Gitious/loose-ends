import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth0 } from "@/lib/auth0";

const PROTECTED_PATHS = ["/dashboard", "/settings"];
const PROTECTED_API_PATHS = ["/api/chat"];

export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);
  const { pathname } = request.nextUrl;

  const isProtectedPage = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isProtectedApi = PROTECTED_API_PATHS.some((p) => pathname.startsWith(p));

  if (isProtectedPage || isProtectedApi) {
    const session = await auth0.getSession();
    if (!session) {
      if (isProtectedApi) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  return authRes;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
