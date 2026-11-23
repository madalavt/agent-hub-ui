import { redirect } from "next/navigation";

export default async function SettingsHome({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  redirect(`/orgs/${encodeURIComponent(tenantSlug)}/settings/users`);
}
