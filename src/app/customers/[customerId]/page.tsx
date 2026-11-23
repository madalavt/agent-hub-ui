import { redirect } from "next/navigation";

// A customer's projects live on its tenant home, like v1.
export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  redirect(`/orgs/${encodeURIComponent(customerId)}/projects`);
}
