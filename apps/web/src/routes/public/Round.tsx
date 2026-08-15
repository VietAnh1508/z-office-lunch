import { type SubmitEvent, useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { SubmissionsTable } from "../shared/SubmissionsTable";
import { useRoundSubmissions } from "../shared/useRoundSubmissions";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { useActiveEmployees, useCreateSubmission } from "./useSubmission";
import { usePublicRound } from "./usePublicRound";
import type { PublicRound } from "./usePublicRound";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

function SubmissionForm({ roundId, round }: { roundId: number; round: PublicRound }) {
  const { data: employees } = useActiveEmployees();
  const createSubmission = useCreateSubmission(roundId);

  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [foodItemId, setFoodItemId] = useState("");
  const [foodItemError, setFoodItemError] = useState<string | null>(null);
  const [foodNote, setFoodNote] = useState("");
  const [drinkItemId, setDrinkItemId] = useState("");
  const [drinkNote, setDrinkNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    const employeeValid = employeeId !== null;
    setEmployeeError(employeeValid ? null : "Please select your name.");

    const foodValid = foodItemId !== "";
    setFoodItemError(foodValid ? null : "Please select a food item.");

    if (!employeeValid || !foodValid) return;

    createSubmission.mutate(
      {
        employeeId: employeeId,
        foodRoundMenuItemId: Number(foodItemId),
        foodNote: foodNote.trim() || undefined,
        drinkRoundMenuItemId: drinkItemId ? Number(drinkItemId) : undefined,
        drinkNote: drinkItemId && drinkNote.trim() ? drinkNote.trim() : undefined,
      },
      { onSuccess: () => setSubmitted(true) },
    );
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Thanks! Your order has been recorded.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place your order</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <EmployeeCombobox
            employees={employees ?? []}
            value={employeeId}
            onChange={(id) => {
              setEmployeeId(id);
              setEmployeeError(null);
            }}
            error={employeeError}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="submission-food-item">
              Food item <span className="text-destructive">*</span>
            </Label>
            <select
              id="submission-food-item"
              className={selectClassName}
              value={foodItemId}
              onChange={(e) => {
                setFoodItemId(e.target.value);
                setFoodItemError(null);
              }}
              aria-invalid={foodItemError !== null}
            >
              <option value="">Select a food item</option>
              {round.foodItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {foodItemError && <p className="text-sm text-destructive">{foodItemError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="submission-food-note">Food note</Label>
            <Input
              id="submission-food-note"
              placeholder="Optional, e.g. no cilantro"
              value={foodNote}
              onChange={(e) => setFoodNote(e.target.value)}
            />
          </div>

          {round.drinkItems && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="submission-drink-item">Drink item</Label>
                <select
                  id="submission-drink-item"
                  className={selectClassName}
                  value={drinkItemId}
                  onChange={(e) => setDrinkItemId(e.target.value)}
                >
                  <option value="">None</option>
                  {round.drinkItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="submission-drink-note">Drink note</Label>
                <Input
                  id="submission-drink-note"
                  placeholder="Optional, e.g. less ice"
                  value={drinkNote}
                  onChange={(e) => setDrinkNote(e.target.value)}
                  disabled={!drinkItemId}
                />
              </div>
            </>
          )}

          <Button type="submit" disabled={createSubmission.isPending} className="self-start">
            Submit
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SubmissionsCard({ roundId }: { roundId: number }) {
  const { data: submissions } = useRoundSubmissions(roundId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submissions</CardTitle>
      </CardHeader>
      <CardContent>
        <SubmissionsTable submissions={submissions} />
      </CardContent>
    </Card>
  );
}

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
    return <p className="p-6 text-sm text-muted-foreground">This round isn't open yet.</p>;
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
        <p className="text-sm text-muted-foreground">The deadline for this round has passed.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{round.label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deadline: {new Date(round.deadline).toLocaleString()}
        </p>
      </div>

      <SubmissionForm roundId={id} round={round} />
      <SubmissionsCard roundId={id} />
    </div>
  );
}
