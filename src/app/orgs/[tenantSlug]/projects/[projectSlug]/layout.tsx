import { Suspense } from "react";
import { WorkItemsShell } from "@/components/workitems/WorkItemsShell";

export default function WorkItemsLayout({ children }: { children: React.ReactNode }) {
  // useSearchParams (current queue in the URL) needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <WorkItemsShell>{children}</WorkItemsShell>
    </Suspense>
  );
}
