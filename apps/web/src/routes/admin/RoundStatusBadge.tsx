import { Badge } from "@/components/ui/badge";
import type { Round } from "./useRounds";

const STATUS_BADGE_CLASS: Record<Round["status"], string> = {
  draft: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  open: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  closed: "border-border bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export function RoundStatusBadge({ status }: { status: Round["status"] }) {
  return <Badge className={STATUS_BADGE_CLASS[status]}>{status}</Badge>;
}
