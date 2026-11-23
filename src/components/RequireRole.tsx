"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "./ui";
import { type Role, useSession } from "@/lib/session";

// Renders its children only for the listed roles; everyone else is sent to the customers page.
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const router = useRouter();
  const { data } = useSession();
  const allowed = !!data && roles.includes(data.role);

  useEffect(() => {
    if (data && !allowed) router.replace("/");
  }, [data, allowed, router]);

  if (!allowed)
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </div>
    );
  return <>{children}</>;
}
