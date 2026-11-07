import { ChevronDown } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDateTime } from "@/lib/format-date";
import { RoundStatusBadge } from "@/routes/admin/RoundStatusBadge";
import { usePublicRounds } from "./usePublicRound";
import type { PublicRoundListItem } from "./usePublicRound";

function RoundRow({ round, linked }: { round: PublicRoundListItem; linked: boolean }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        {linked ? (
          <Link to={`/r/${round.id}`} className="font-medium hover:underline">
            {round.label}
          </Link>
        ) : (
          <span className="font-medium">{round.label}</span>
        )}
        <RoundStatusBadge status={round.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {[round.foodRestaurantName, round.drinkRestaurantName]
          .filter((name) => name != null)
          .join(" + ")}
      </p>
      <p className="text-xs text-muted-foreground">Deadline {formatDateTime(round.deadline)}</p>
    </li>
  );
}

function RoundList({ rounds, linked }: { rounds: PublicRoundListItem[]; linked: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rounds.map((round) => (
        <RoundRow key={round.id} round={round} linked={linked} />
      ))}
    </ul>
  );
}

function RoundSection({
  title,
  description,
  emptyMessage,
  rounds,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  rounds: PublicRoundListItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {rounds.length > 0 && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <RoundList rounds={rounds} linked />
        )}
      </CardContent>
    </Card>
  );
}

// Closed rounds can't be ordered from, so they're read-only (no links) and
// tucked away behind a toggle that starts collapsed.
function PastRoundSection({
  title,
  emptyMessage,
  rounds,
}: {
  title: string;
  emptyMessage: string;
  rounds: PublicRoundListItem[];
}) {
  return (
    <Card>
      <Collapsible defaultOpen={false}>
        <CardHeader>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 text-left">
            <CardTitle>{title}</CardTitle>
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-4">
            {rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              <RoundList rounds={rounds} linked={false} />
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function BrowseRounds() {
  const { data: rounds, isPending, isError } = usePublicRounds();

  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading rounds…</p>;
  }

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        Something went wrong loading rounds. Please try again.
      </p>
    );
  }

  // Latest deadline first.
  const newestFirst = [...rounds].sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline));
  const openRounds = newestFirst.filter((round) => round.status === "open");
  const closedRounds = newestFirst.filter((round) => round.status === "closed");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <RoundSection
        title="Current office lunches"
        description="Still open for ordering — join in before the deadline."
        emptyMessage="No office lunch is open for orders right now."
        rounds={openRounds}
      />
      <PastRoundSection
        title="Past office lunches"
        emptyMessage="No past office lunches yet."
        rounds={closedRounds}
      />
    </div>
  );
}
