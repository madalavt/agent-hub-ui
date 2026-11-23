"use client";

import { WorkItemPage } from "@/components/workitems/WorkItemPage";

// /orgs/{tenant}/projects/{project}/workitems/{traceId}/details (like v1)
export default function WorkItemDetailsPage() {
  return <WorkItemPage view="details" />;
}
