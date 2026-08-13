import { Badge } from "@/components/ui/badge";
import type { Round } from "./useRounds";

const STATUS_BADGE_CLASS: Record<Round["status"], string> = {
  draft: "border-transparent bg-secondary text-secondary-foreground",
  open: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  closed: "border-border bg-muted text-muted-foreground",
};

export function RoundStatusBadge({ status }: { status: Round["status"] }) {
  return <Badge className={STATUS_BADGE_CLASS[status]}>{status}</Badge>;
}
