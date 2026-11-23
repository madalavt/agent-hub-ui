"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useSWRConfig } from "swr";
import { Button, Field, Input } from "@/components/ui";
import { SESSION_KEY } from "@/lib/session";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only same-site paths: never redirect to another host or back to /login.
  const next = params.get("next");
  const target =
    next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")
      ? next
      : "/";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      if (!res.ok) {
        setError(body.detail ?? "Sign-in failed");
        return;
      }
      // Clear cached data from any previous user before hydrating the new session.
      await mutate(() => true, undefined, { revalidate: false });
      await mutate(SESSION_KEY);
      router.replace(target);
    } catch {
      setError("Could not reach the sign-in service");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">AH</div>
          <div>
            <div className="text-base font-semibold text-slate-900">Agent Hub</div>
            <div className="text-xs text-slate-500">Sign in to continue</div>
          </div>
        </div>
        <Field label="User ID">
          <Input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={!username || !password}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
