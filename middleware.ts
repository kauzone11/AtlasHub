import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = [
  "/hub/login",
  "/hub/convite",
  "/hub/select-organization",
  "/api/hub/auth/login",
  "/api/hub/auth/organizations",
  "/api/hub/invitations",
  "/api/health",
];

function isPublic(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/hub") && !pathname.startsWith("/api/hub")) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const authenticated = request.cookies.has("atlas_hub_session") || request.cookies.has("atlas_hub_account_session");
  if (authenticated) return NextResponse.next();
  if (pathname.startsWith("/api/hub")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.redirect(new URL("/hub/login", request.url));
}

export const config = {
  matcher: ["/hub/:path*", "/api/hub/:path*"],
};
