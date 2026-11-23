import type { DisplayStatus } from "@/lib/types";
import { IconAlert, IconCheck } from "./icons";
import { Badge, Spinner } from "./ui";

export function StatusBadge({ status, queued }: { status: DisplayStatus; queued?: boolean }) {
  if (status === "completed")
    return (
      <Badge tone="green">
        <IconCheck className="h-3 w-3" /> Completed
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge tone="red">
        <IconAlert className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge tone="amber">
      <Spinner className="h-3 w-3" /> {queued ? "Queued" : "Processing"}
    </Badge>
  );
}
