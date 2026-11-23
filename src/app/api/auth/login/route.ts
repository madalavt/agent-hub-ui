// Password sign-in: forwards username and password to the API (POST /auth/login) and keeps the
// returned session token in an httpOnly cookie. The browser never sees the token itself.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieSecure, decisionTreeUrl } from "@/lib/authConfig";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;
  let upstream: Response;
  try {
    upstream = await fetch(`${decisionTreeUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: body?.username ?? "", password: body?.password ?? "" }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Decision-tree service unreachable" }, { status: 502 });
  }
  const data = (await upstream.json().catch(() => ({}))) as {
    detail?: string;
    access_token?: string;
    expires_in?: number;
    user?: unknown;
  };
  if (!upstream.ok || !data.access_token) {
    return NextResponse.json({ detail: data.detail ?? "Sign-in failed" }, { status: upstream.status || 401 });
  }
  const res = NextResponse.json({ user: data.user });
  res.cookies.set(SESSION_COOKIE, data.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: data.expires_in,
  });
  return res;
}
