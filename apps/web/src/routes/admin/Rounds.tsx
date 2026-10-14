import { type SubmitEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { RoundList } from "./RoundList";
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

  const foodRestaurants = (restaurants ?? []).filter((restaurant) => restaurant.type === "food");
  const drinkRestaurants = (restaurants ?? []).filter((restaurant) => restaurant.type === "drink");

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const labelValid = label.validate();
    const deadlineValid = deadline.validate();

    const restaurantValid = foodRestaurantId !== "" || drinkRestaurantId !== "";
    setRestaurantError(restaurantValid ? null : "Select at least one restaurant.");

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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-food-restaurant">Food restaurant</Label>
                <select
                  id="round-food-restaurant"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
                  value={foodRestaurantId}
                  onChange={(e) => {
                    setFoodRestaurantId(e.target.value);
                    setRestaurantError(null);
                  }}
                  aria-invalid={restaurantError !== null}
                >
                  <option value="">None</option>
                  {foodRestaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
                {restaurantError && <p className="text-sm text-destructive">{restaurantError}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="round-drink-restaurant">Drink restaurant</Label>
                <select
                  id="round-drink-restaurant"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
                  value={drinkRestaurantId}
                  onChange={(e) => {
                    setDrinkRestaurantId(e.target.value);
                    setRestaurantError(null);
                  }}
                  aria-invalid={restaurantError !== null}
                >
                  <option value="">None</option>
                  {drinkRestaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
                {restaurantError && <p className="text-sm text-destructive">{restaurantError}</p>}
              </div>
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
