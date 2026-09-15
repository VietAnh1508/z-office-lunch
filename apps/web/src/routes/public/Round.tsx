import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useParams } from "react-router";
import { MenuPanel } from "./Round/MenuPanel";
import { SubmissionForm } from "./Round/SubmissionForm";
import { usePublicRound } from "./usePublicRound";

export function Round() {
  const { roundId } = useParams<{ roundId: string }>();
  const id = Number(roundId);
  const { data: round, isPending, isError, error } = usePublicRound(id);

  if (isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading round…</p>;
  }

  // A real failure (network/5xx) is not the same as "round not found" — don't
  // tell an employee the round isn't open yet when the backend is actually down.
  if (isError && !(error instanceof ApiError && error.status === 404)) {
    return (
      <p className="p-6 text-sm text-destructive">
        Something went wrong loading this round. Please try again.
      </p>
    );
  }

  // A draft round 404s identically to a nonexistent one — this generic
  // message must not leak which case it is either.
  if (isError || !round) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        This round isn't open yet.
      </p>
    );
  }

  if (round.status === "closed") {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{round.label}</h1>
        <p className="text-sm text-muted-foreground">This round is closed.</p>
      </div>
    );
  }

  const deadlinePassed = new Date(round.deadline).getTime() < Date.now();
  if (deadlinePassed) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{round.label}</h1>
        <p className="text-sm text-muted-foreground">
          The deadline for this round has passed.
        </p>
      </div>
    );
  }

  const hasMenuPanel =
    round.foodRestaurant.menuImage !== null ||
    (round.drinkRestaurant?.menuImage ?? null) !== null;

  return (
    <div
      className={cn(
        "mx-auto flex flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10",
        hasMenuPanel
          ? "max-w-xl lg:grid lg:max-w-5xl lg:grid-cols-[1fr_20rem] lg:gap-8"
          : "max-w-xl",
      )}
    >
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {round.label}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deadline: {new Date(round.deadline).toLocaleDateString("en-GB")}
          </p>
        </div>

        <SubmissionForm roundId={id} round={round} />
      </div>

      {hasMenuPanel && <MenuPanel round={round} />}
    </div>
  );
}
