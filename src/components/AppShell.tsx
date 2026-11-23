"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { TopBar } from "./TopBar";
import { ErrorBanner, Spinner } from "./ui";
import { setCurrentUser } from "@/lib/currentUser";
import { useSession } from "@/lib/session";

// Signed-out users go to /login. The login page itself has no navigation.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const onLogin = pathname === "/login";
  const signedOut = session.error?.status === 401;
  const user = session.data;

  useEffect(() => {
    if (!onLogin && signedOut) {
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
    }
  }, [onLogin, signedOut, pathname, router]);

  // The work item and annotation services name the person acting (audit trail, reviewer) from
  // this identity; it follows the sign-in.
  useEffect(() => {
    if (user) setCurrentUser({ id: user.id, name: user.name, email: user.email });
  }, [user]);

  if (onLogin) return <main className="min-h-screen">{children}</main>;
  if (session.error && !signedOut)
    return (
      <div className="p-8">
        <ErrorBanner error={session.error} />
      </div>
    );
  if (!user)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={<div className="h-[72px] border-b border-slate-200" />}>
        <TopBar user={user} />
      </Suspense>
      {children}
    </div>
  );
}
