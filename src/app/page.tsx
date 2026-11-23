"use client";

// Entry point: the first customer (tenant) the user can see, like v1's /orgs/{tenant}/projects.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import useSWR from "swr";
import { ErrorBanner, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { tenantHome } from "@/lib/paths";
import type { Customer } from "@/lib/types";

export default function RootPage() {
  return (
    <Suspense fallback={null}>
      <ToFirstTenant />
    </Suspense>
  );
}

function ToFirstTenant() {
  const router = useRouter();
  const wanted = useSearchParams().get("customer"); // older links: /?customer={id}
  const customers = useSWR<Customer[]>("dt:/v1/customers", fetcher);
  useEffect(() => {
    const list = customers.data;
    if (!list?.length) return;
    const target = list.find((c) => c.id === wanted) ?? list[0];
    router.replace(tenantHome(target.id));
  }, [customers.data, wanted, router]);

  if (customers.error) return <div className="p-8"><ErrorBanner error={customers.error} /></div>;
  if (customers.data && customers.data.length === 0)
    return <p className="p-10 text-[17px] text-slate-600">You don&apos;t have access to any customer yet. Ask an administrator to assign one.</p>;
  return <div className="flex justify-center p-10"><Spinner className="h-6 w-6 text-violet-500" /></div>;
}
