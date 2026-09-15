import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type SubmitEvent, useState } from "react";
import type { RoundSubmission } from "../../shared/useRoundSubmissions";
import { useSubmissionForEmployee } from "../../shared/useRoundSubmissions";
import type { PublicRound } from "../usePublicRound";
import { useActiveEmployees, useCreateSubmission } from "../useSubmission";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { ItemCombobox } from "./ItemCombobox";
import { MenuImage } from "./MenuImage";
import { MenuLink } from "./MenuLink";
import { OverwriteSubmissionDialog } from "./OverwriteSubmissionDialog";

type SubmissionInput = {
  employeeId: number;
  foodRoundMenuItemId: number;
  foodNote?: string;
  drinkRoundMenuItemId?: number;
  drinkNote?: string;
};

export function SubmissionForm({
  roundId,
  round,
}: {
  roundId: number;
  round: PublicRound;
}) {
  const { data: employees } = useActiveEmployees();
  const createSubmission = useCreateSubmission(roundId);

  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [foodItemId, setFoodItemId] = useState<number | null>(null);
  const [foodItemError, setFoodItemError] = useState<string | null>(null);
  const [foodNote, setFoodNote] = useState("");
  const [drinkItemId, setDrinkItemId] = useState<number | null>(null);
  const [drinkNote, setDrinkNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: existingSubmissions } = useSubmissionForEmployee(roundId, employeeId);

  const [pendingInput, setPendingInput] = useState<SubmissionInput | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<RoundSubmission | null>(null);

  function buildInput(): SubmissionInput {
    return {
      employeeId: employeeId as number,
      foodRoundMenuItemId: foodItemId as number,
      foodNote: foodNote.trim() || undefined,
      drinkRoundMenuItemId: drinkItemId ?? undefined,
      drinkNote:
        drinkItemId !== null && drinkNote.trim() ? drinkNote.trim() : undefined,
    };
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    const employeeValid = employeeId !== null;
    setEmployeeError(employeeValid ? null : "Please select your name.");

    const foodValid = foodItemId !== null;
    setFoodItemError(foodValid ? null : "Please select a food item.");

    if (!employeeValid || !foodValid) return;

    const existing = existingSubmissions?.[0] ?? null;
    if (existing) {
      setPendingInput(buildInput());
      setExistingSubmission(existing);
      return;
    }

    createSubmission.mutate(buildInput(), { onSuccess: () => setSubmitted(true) });
  }

  function handleCancelOverwrite() {
    setPendingInput(null);
    setExistingSubmission(null);
  }

  function handleConfirmOverwrite() {
    if (!pendingInput) return;
    createSubmission.mutate(pendingInput, { onSuccess: () => setSubmitted(true) });
    setPendingInput(null);
    setExistingSubmission(null);
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
    <Card className="overflow-visible">
      <CardHeader>
        <CardTitle>Place your order</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <EmployeeCombobox
            employees={employees ?? []}
            value={employeeId}
            onChange={(id) => {
              setEmployeeId(id);
              setEmployeeError(null);
            }}
            error={employeeError}
          />

          <ItemCombobox
            id="submission-food-item"
            label="Food item"
            required
            items={round.foodItems}
            value={foodItemId}
            onChange={(id) => {
              setFoodItemId(id);
              setFoodItemError(null);
            }}
            error={foodItemError}
            placeholder="Search food items…"
          />
          <MenuLink restaurant={round.foodRestaurant} />
          <MenuImage restaurant={round.foodRestaurant} className="lg:hidden" />
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
              <ItemCombobox
                id="submission-drink-item"
                label="Drink item"
                items={round.drinkItems}
                value={drinkItemId}
                onChange={setDrinkItemId}
                error={null}
                placeholder="Search drink items…"
              />
              <MenuLink restaurant={round.drinkRestaurant!} />
              <MenuImage
                restaurant={round.drinkRestaurant!}
                className="lg:hidden"
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="submission-drink-note">Drink note</Label>
                <Input
                  id="submission-drink-note"
                  placeholder="Optional, e.g. size M, less ice"
                  value={drinkNote}
                  onChange={(e) => setDrinkNote(e.target.value)}
                  disabled={!drinkItemId}
                />
              </div>
            </>
          )}

          <Button
            type="submit"
            disabled={createSubmission.isPending}
            className="self-start"
          >
            Submit
          </Button>
        </form>
      </CardContent>

      <OverwriteSubmissionDialog
        open={existingSubmission !== null}
        existing={existingSubmission}
        pending={createSubmission.isPending}
        onCancel={handleCancelOverwrite}
        onConfirm={handleConfirmOverwrite}
      />
    </Card>
  );
}
