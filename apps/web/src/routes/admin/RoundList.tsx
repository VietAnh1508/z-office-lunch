import { useState } from "react";
import { Link } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RoundStatusBadge } from "./RoundStatusBadge";
import { useRestaurants } from "./useRestaurants";
import { useDeleteRound, useRounds, type Round } from "./useRounds";

type StatusFilter = "all" | Round["status"];

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

export function RoundList() {
  const { data: rounds, isPending, isError } = useRounds();
  const { data: restaurants } = useRestaurants();
  const deleteRound = useDeleteRound();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const restaurantName = (id: number) =>
    restaurants?.find((restaurant) => restaurant.id === id)?.name ?? `#${id}`;

  const filteredRounds =
    rounds?.filter((round) => statusFilter === "all" || round.status === statusFilter) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rounds</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            <Label htmlFor="round-status-filter" className="text-sm text-muted-foreground">
              Status
            </Label>
            <select
              id="round-status-filter"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              {STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading rounds…</p>
        ) : isError && !rounds ? (
          <p className="text-sm text-destructive">Could not load rounds.</p>
        ) : (
          <>
            {isError && (
              <p className="mb-2 text-sm text-destructive">Could not refresh rounds.</p>
            )}
            {rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rounds yet.</p>
            ) : filteredRounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rounds match this filter.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {filteredRounds.map((round) => (
                  <li
                    key={round.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/rounds/${round.id}`}
                          className="font-medium hover:underline"
                        >
                          {round.label}
                        </Link>
                        <RoundStatusBadge status={round.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {restaurantName(round.foodRestaurantId)}
                        {round.drinkRestaurantId != null &&
                          ` + ${restaurantName(round.drinkRestaurantId)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Deadline {new Date(round.deadline).toLocaleString()}
                      </p>
                    </div>
                    {round.status === "draft" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="shrink-0"
                            disabled={deleteRound.isPending && deleteRound.variables === round.id}
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this round?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => deleteRound.mutate(round.id)}
                            >
                              Delete round
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
