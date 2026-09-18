import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth =
    pathname.startsWith("/admin") || pathname.startsWith("/api/edge");

  // Public friends site + admin login endpoints
  if (!needsAuth) return NextResponse.next();
  if (pathname === "/admin/login" || pathname === "/api/edge/login") {
    return NextResponse.next();
  }

  const password = process.env.EDGE_PASSWORD;
  if (!password) {
    // Local/dev without password: allow admin (still not advertised)
    return NextResponse.next();
  }

  const cookie = req.cookies.get("edge_auth")?.value;
  if (cookie === password) return NextResponse.next();

  if (pathname.startsWith("/api/edge")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/edge/:path*"],
};
