"use client";

// Settings of a tenant, like v1: Projects, Users, Roles and Permissions.

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import useSWR from "swr";
import { cx } from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { tenantHome } from "@/lib/paths";

const TABS = [
  { slug: "projects", label: "Projects" },
  { slug: "users", label: "Users" },
  { slug: "roles", label: "Roles and Permissions" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const pathname = usePathname();
  const base = `/orgs/${tenantSlug}/settings`;
  // A tenant the user may not see answers 404 (existence is not revealed).
  const roles = useSWR(`ra:/tenant/${tenantSlug}/roles`, fetcher);
  const denied = roles.error instanceof ApiError && [403, 404].includes(roles.error.status);
  return (
    <main className="px-6 pb-16 pt-10 sm:px-12">
      <div className="flex justify-end">
        <Link href={tenantHome(tenantSlug)} className="flex items-center gap-3 text-[17px] font-semibold uppercase tracking-wide text-violet-700 hover:text-violet-800">
          <span aria-hidden className="text-2xl leading-none">←</span> Exit settings
        </Link>
      </div>
      <nav className="mt-8 flex gap-2 overflow-x-auto border-b border-slate-200 scrollbar-thin">
        {TABS.map((t) => {
          const active = pathname.startsWith(`${base}/${t.slug}`);
          return (
            <Link
              key={t.slug}
              href={`${base}/${t.slug}`}
              className={cx(
                "-mb-px whitespace-nowrap border-b-[3px] px-6 pb-4 text-[17px] font-semibold uppercase tracking-wide",
                active ? "border-violet-600 text-violet-700" : "border-transparent text-slate-900 hover:text-violet-700",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {denied ? (
        <div className="my-16">
          <h1 className="font-slab text-[40px] font-bold leading-none text-slate-950">Not available</h1>
          <p className="mt-5 text-[17px] text-slate-700">You don&apos;t have access to this tenant&apos;s settings.</p>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
