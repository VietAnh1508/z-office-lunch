import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { RoundSubmission } from "../../shared/useRoundSubmissions";
import { useSubmissionForEmployee } from "../../shared/useRoundSubmissions";
import type { PublicRound } from "../usePublicRound";
import { useActiveEmployees, useCreateSubmission } from "../useSubmission";
import { MenuImage } from "./MenuImage";
import { MenuLink } from "./MenuLink";
import { OrderSummary } from "./OrderSummary";
import { OverwriteSubmissionDialog } from "./OverwriteSubmissionDialog";
import { PickerList } from "./PickerList";
import { RestaurantNote } from "./RestaurantNote";

type SubmissionInput = {
  employeeId: number;
  foodRoundMenuItemId?: number;
  foodNote?: string;
  drinkRoundMenuItemId?: number;
  drinkNote?: string;
};

export type Step = "who" | "food" | "drink" | "review";

const STEP_TITLES: Record<Step, string> = {
  who: "Who's ordering?",
  food: "Pick your food",
  drink: "Pick your drink",
  review: "Looks good?",
};

export function SubmissionForm({
  roundId,
  round,
  onStepChange,
}: {
  roundId: number;
  round: PublicRound;
  onStepChange?: (step: Step) => void;
}) {
  const { data: employees } = useActiveEmployees();
  const createSubmission = useCreateSubmission(roundId);

  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [foodItemId, setFoodItemId] = useState<number | null>(null);
  const [foodNote, setFoodNote] = useState("");
  const [drinkItemId, setDrinkItemId] = useState<number | null>(null);
  const [drinkNote, setDrinkNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const { data: existingSubmissions } = useSubmissionForEmployee(
    roundId,
    employeeId,
  );

  const [pendingInput, setPendingInput] = useState<SubmissionInput | null>(
    null,
  );
  const [existingSubmission, setExistingSubmission] =
    useState<RoundSubmission | null>(null);

  const hasFood =
    round.foodItems !== undefined && round.foodRestaurant !== undefined;
  const hasDrink = round.drinkItems !== undefined;
  const drinkRequired = !hasFood;

  const steps: Step[] = [
    "who",
    ...(hasFood ? (["food"] as const) : []),
    ...(hasDrink ? (["drink"] as const) : []),
    "review",
  ];
  const step = steps[stepIndex];

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const employee = employees?.find((e) => e.id === employeeId) ?? null;
  const firstName = employee?.fullName.split(" ")[0] ?? null;
  const food = round.foodItems?.find((i) => i.id === foodItemId) ?? null;
  const drink = round.drinkItems?.find((i) => i.id === drinkItemId) ?? null;

  const canContinue =
    step === "who"
      ? employeeId !== null
      : step === "food"
        ? foodItemId !== null
        : step === "drink"
          ? !drinkRequired || drinkItemId !== null
          : true;

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function buildInput(): SubmissionInput {
    return {
      employeeId: employeeId as number,
      foodRoundMenuItemId: hasFood ? (foodItemId as number) : undefined,
      foodNote: hasFood ? foodNote.trim() || undefined : undefined,
      drinkRoundMenuItemId: drinkItemId ?? undefined,
      drinkNote:
        drinkItemId !== null && drinkNote.trim() ? drinkNote.trim() : undefined,
    };
  }

  function handleSubmit() {
    if (employeeId === null) return;
    if (hasFood && foodItemId === null) return;
    if (drinkRequired && drinkItemId === null) return;

    const existing = existingSubmissions?.[0] ?? null;
    if (existing) {
      setPendingInput(buildInput());
      setExistingSubmission(existing);
      return;
    }

    createSubmission.mutate(buildInput(), {
      onSuccess: () => setSubmitted(true),
    });
  }

  function handleCancelOverwrite() {
    setPendingInput(null);
    setExistingSubmission(null);
  }

  function handleConfirmOverwrite() {
    if (!pendingInput) return;
    createSubmission.mutate(pendingInput, {
      onSuccess: () => setSubmitted(true),
    });
    setPendingInput(null);
    setExistingSubmission(null);
  }

  const summaryRows = [
    { label: "Name", value: employee?.fullName ?? null },
    ...(hasFood
      ? [
          {
            label: "Food",
            value: food?.name ?? null,
            note: foodNote.trim() || undefined,
          },
        ]
      : []),
    ...(hasDrink
      ? [
          {
            label: "Drink",
            value: drink?.name ?? null,
            note: drinkNote.trim() || undefined,
          },
        ]
      : []),
  ];

  if (submitted) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary animate-in zoom-in-50 duration-500">
            <Check className="size-7" />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <p className="text-lg font-semibold">
              You're all set{firstName ? `, ${firstName}` : ""}!
            </p>
            <p className="text-sm text-muted-foreground">
              Thanks! Your order has been recorded.
            </p>
          </div>
          <OrderSummary
            rows={summaryRows}
            className="w-full max-w-xs text-left"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-visible">
      <CardContent className="flex flex-col gap-5">
        <nav aria-label="Progress" className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {steps.map((s, i) => (
              <button
                key={s}
                type="button"
                aria-label={`Step ${i + 1}: ${STEP_TITLES[s]}`}
                aria-current={i === stepIndex ? "step" : undefined}
                disabled={i >= stepIndex}
                onClick={() => setStepIndex(i)}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  i <= stepIndex ? "bg-primary" : "bg-muted",
                  i < stepIndex && "cursor-pointer hover:opacity-70",
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </nav>

        {/* key remounts the block so each step slides in */}
        <div
          key={step}
          className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300"
        >
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {STEP_TITLES[step]}
            </h2>
            {firstName && step !== "who" && (
              <p className="text-sm text-muted-foreground">
                Hi {firstName} 👋
              </p>
            )}
          </div>

          {stepIndex === 1 && existingSubmissions?.[0] && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Welcome back — you already ordered for this round. Submitting
              will replace it.
            </p>
          )}

          {step === "who" && (
            <PickerList
              label="Your name"
              placeholder="Search your name…"
              options={(employees ?? []).map((e) => ({
                id: e.id,
                label: e.fullName,
              }))}
              value={employeeId}
              onSelect={(id) => {
                setEmployeeId(id);
                goNext();
              }}
              columns
            />
          )}

          {step === "food" && round.foodItems && round.foodRestaurant && (
            <>
              <PickerList
                label="Food item"
                placeholder="Search food items…"
                options={round.foodItems.map((i) => ({
                  id: i.id,
                  label: i.name,
                }))}
                value={foodItemId}
                onSelect={setFoodItemId}
              />
              <MenuLink restaurant={round.foodRestaurant} />
              <RestaurantNote restaurant={round.foodRestaurant} />
              <MenuImage
                restaurant={round.foodRestaurant}
                className="lg:hidden"
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="submission-food-note">Food note</Label>
                <Input
                  id="submission-food-note"
                  placeholder="Optional, e.g. no cilantro"
                  value={foodNote}
                  onChange={(e) => setFoodNote(e.target.value)}
                />
              </div>
            </>
          )}

          {step === "drink" && round.drinkItems && round.drinkRestaurant && (
            <>
              <PickerList
                label="Drink item"
                placeholder="Search drink items…"
                options={round.drinkItems.map((i) => ({
                  id: i.id,
                  label: i.name,
                }))}
                value={drinkItemId}
                onSelect={setDrinkItemId}
              />
              <MenuLink restaurant={round.drinkRestaurant} />
              <RestaurantNote restaurant={round.drinkRestaurant} />
              <MenuImage
                restaurant={round.drinkRestaurant}
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

        </div>

        <OrderSummary rows={summaryRows} />

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            className={cn(stepIndex === 0 && "invisible")}
          >
            <ArrowLeft /> Back
          </Button>

          {step === "review" ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={createSubmission.isPending}
            >
              Submit order
            </Button>
          ) : step === "who" ? null : (
            <div className="flex gap-2">
              {step === "drink" && !drinkRequired && drinkItemId === null && (
                <Button type="button" variant="ghost" onClick={goNext}>
                  Skip drink
                </Button>
              )}
              <Button type="button" onClick={goNext} disabled={!canContinue}>
                Continue <ArrowRight />
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      <OverwriteSubmissionDialog
        open={existingSubmission !== null}
        existing={existingSubmission}
        hasFood={hasFood}
        pending={createSubmission.isPending}
        onCancel={handleCancelOverwrite}
        onConfirm={handleConfirmOverwrite}
      />
    </Card>
  );
}
