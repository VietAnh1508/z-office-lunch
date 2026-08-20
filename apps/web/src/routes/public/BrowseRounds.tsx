import { Link } from "react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoundStatusBadge } from "@/routes/admin/RoundStatusBadge";
import { usePublicRounds } from "./usePublicRound";
import type { PublicRoundListItem } from "./usePublicRound";

function RoundRow({ round }: { round: PublicRoundListItem }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/r/${round.id}`} className="font-medium hover:underline">
          {round.label}
        </Link>
        <RoundStatusBadge status={round.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {round.foodRestaurantName}
        {round.drinkRestaurantName != null && ` + ${round.drinkRestaurantName}`}
      </p>
      <p className="text-xs text-muted-foreground">
        Deadline {new Date(round.deadline).toLocaleString()}
      </p>
    </li>
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
          <ul className="flex flex-col divide-y divide-border">
            {rounds.map((round) => (
              <RoundRow key={round.id} round={round} />
            ))}
          </ul>
        )}
      </CardContent>
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

  const openRounds = rounds.filter((round) => round.status === "open");
  const closedRounds = rounds.filter((round) => round.status === "closed");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <RoundSection
        title="Current office lunches"
        description="Still open for ordering — join in before the deadline."
        emptyMessage="No office lunch is open for orders right now."
        rounds={openRounds}
      />
      <RoundSection
        title="Past office lunches"
        description="Closed for ordering."
        emptyMessage="No past office lunches yet."
        rounds={closedRounds}
      />
    </div>
  );
}
