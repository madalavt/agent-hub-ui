"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { canManageTenant, useSession } from "@/lib/session";

export interface TenantRole {
  tenant_role_id: string;
  tenant_id: string;
  role_name: string;
  created_at: string | null;
  users_count: number;
  permissions: string[];
  built_in: boolean;
}

export interface TenantMember {
  tenant_user_id: string;
  platform_user_id: string;
  display_name: string;
  email: string | null;
  role_name: string | null;
  tenant_role_id: string | null;
  last_active_time: string | null;
  is_platform_admin: boolean;
  username: string | null;
  temporary_password?: string;
}

export interface TenantPermission {
  tenant_permission_id: string;
  tenant_permission_name: string;
  permission_description: string;
}

/** The tenant in the URL, its roles, and whether the signed-in user may manage it. */
export function useTenant() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const me = useSession().data;
  const roles = useSWR<TenantRole[]>(`ra:/tenant/${tenantSlug}/roles`, fetcher);
  return { tenant: tenantSlug, roles, canManage: canManageTenant(me, tenantSlug), me };
}

export function SettingsHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="my-10 flex flex-wrap items-center justify-between gap-4">
      <h1 className="flex items-center gap-6 font-slab text-[40px] font-bold leading-none tracking-tight text-slate-950 sm:text-[48px]">
        Settings <span className="text-3xl font-normal text-slate-700">›</span> {title}
      </h1>
      {action}
    </div>
  );
}
