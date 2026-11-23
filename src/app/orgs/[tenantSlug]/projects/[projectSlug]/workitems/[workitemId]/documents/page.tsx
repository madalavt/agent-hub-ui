"use client";

import { WorkItemPage } from "@/components/workitems/WorkItemPage";

// /orgs/{tenant}/projects/{project}/workitems/{traceId}/documents (like v1)
export default function WorkItemDocumentsPage() {
  return <WorkItemPage view="documents" />;
}
