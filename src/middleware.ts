// Pages need the session cookie. Without it the browser goes to /login (the API checks the
// token itself on every call, so an expired cookie is caught there and sent back to /login).
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/authConfig";

export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", req.url);
  const fullPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (fullPath !== "/") login.searchParams.set("next", fullPath);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
