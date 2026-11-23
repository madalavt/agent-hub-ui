// The signed-in user, from the API (GET /v1/me) using the session cookie.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieSecure, decisionTreeUrl } from "@/lib/authConfig";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "sign in required" }, { status: 401 });
  let upstream: Response;
  try {
    upstream = await fetch(`${decisionTreeUrl()}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Decision-tree service unreachable" }, { status: 502 });
  }
  if (!upstream.ok) {
    if (upstream.status === 401 || upstream.status === 404) {
      const res = NextResponse.json({ detail: "sign in required" }, { status: 401 });
      res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, secure: cookieSecure() });
      return res;
    }
    const detail = await upstream
      .json()
      .then((b: { detail?: string }) => b?.detail)
      .catch(() => null);
    return NextResponse.json(
      { detail: detail ?? `Decision-tree service error (${upstream.status})` },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  }
  const me = (await upstream.json()) as { id: string; name: string; email: string | null };
  // v1 (NextAuth) session keys next to Agent Hub's. The session token stays in its httpOnly
  // cookie: it is never handed to the browser.
  return NextResponse.json({
    ...me,
    userId: me.id,
    user: { name: me.name, email: me.email, image: null },
    expires: tokenExpiry(token),
  });
}

function tokenExpiry(token: string): string | null {
  try {
    const body = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const exp = (JSON.parse(Buffer.from(body, "base64").toString("utf8")) as { exp?: number }).exp;
    return exp ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}
