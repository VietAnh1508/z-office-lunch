import { type SubmitEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { RoundList } from "./RoundList";
import { RoundRestaurantFields } from "./RoundRestaurantFields";
import { RESTAURANT_REQUIRED_ERROR, hasRestaurant } from "./roundRestaurantValidation";
import { useRestaurants } from "./useRestaurants";
import { useCreateRound } from "./useRounds";

export function Rounds() {
  const { data: restaurants } = useRestaurants();
  const createRound = useCreateRound();

  const label = useRequiredField("Label is required.");
  const deadline = useRequiredField("Deadline is required.");
  const [foodRestaurantId, setFoodRestaurantId] = useState("");
  const [drinkRestaurantId, setDrinkRestaurantId] = useState("");
  const [restaurantError, setRestaurantError] = useState<string | null>(null);

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const labelValid = label.validate();
    const deadlineValid = deadline.validate();

    const restaurantValid = hasRestaurant(foodRestaurantId, drinkRestaurantId);
    setRestaurantError(restaurantValid ? null : RESTAURANT_REQUIRED_ERROR);

    if (!labelValid || !restaurantValid || !deadlineValid) return;

    createRound.mutate(
      {
        label: label.value,
        foodRestaurantId: foodRestaurantId ? Number(foodRestaurantId) : undefined,
        drinkRestaurantId: drinkRestaurantId ? Number(drinkRestaurantId) : undefined,
        deadline: new Date(deadline.value).toISOString(),
      },
      {
        onSuccess: () => {
          label.reset();
          setFoodRestaurantId("");
          setDrinkRestaurantId("");
          deadline.reset();
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Rounds</h1>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Add round</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-label">
                  Label <span className="text-destructive">*</span>
                </Label>
                <Input id="round-label" {...label.inputProps} />
                {label.error && <p className="text-sm text-destructive">{label.error}</p>}
              </div>
              <RoundRestaurantFields
                idPrefix="round"
                restaurants={restaurants}
                foodRestaurantId={foodRestaurantId}
                drinkRestaurantId={drinkRestaurantId}
                onFoodChange={(value) => {
                  setFoodRestaurantId(value);
                  setRestaurantError(null);
                }}
                onDrinkChange={(value) => {
                  setDrinkRestaurantId(value);
                  setRestaurantError(null);
                }}
                error={restaurantError}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-deadline">
                  Deadline <span className="text-destructive">*</span>
                </Label>
                <Input id="round-deadline" type="datetime-local" {...deadline.inputProps} />
                {deadline.error && <p className="text-sm text-destructive">{deadline.error}</p>}
              </div>
              <Button type="submit" disabled={createRound.isPending}>
                Add round
              </Button>
            </form>
          </CardContent>
        </Card>

        <RoundList />
      </div>
    </div>
  );
}
