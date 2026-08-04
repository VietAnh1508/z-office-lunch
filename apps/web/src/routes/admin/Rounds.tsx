import { type SubmitEvent, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { useRestaurants } from "./useRestaurants";
import { useCreateRound, useRounds } from "./useRounds";

export function Rounds() {
  const { data: rounds, isPending, isError } = useRounds();
  const { data: restaurants } = useRestaurants();
  const createRound = useCreateRound();

  const label = useRequiredField("Label is required.");
  const deadline = useRequiredField("Deadline is required.");
  const [foodRestaurantId, setFoodRestaurantId] = useState("");
  const [foodRestaurantError, setFoodRestaurantError] = useState<string | null>(null);
  const [drinkRestaurantId, setDrinkRestaurantId] = useState("");

  const foodRestaurants = (restaurants ?? []).filter((restaurant) => restaurant.type === "food");
  const drinkRestaurants = (restaurants ?? []).filter((restaurant) => restaurant.type === "drink");
  const restaurantName = (id: number) =>
    restaurants?.find((restaurant) => restaurant.id === id)?.name ?? `#${id}`;

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const labelValid = label.validate();
    const deadlineValid = deadline.validate();

    const foodValid = foodRestaurantId !== "";
    setFoodRestaurantError(foodValid ? null : "Food restaurant is required.");

    if (!labelValid || !foodValid || !deadlineValid) return;

    createRound.mutate(
      {
        label: label.value,
        foodRestaurantId: Number(foodRestaurantId),
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
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Rounds</h1>
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
              <Label htmlFor="round-food-restaurant">
                Food restaurant <span className="text-destructive">*</span>
              </Label>
              <select
                id="round-food-restaurant"
                className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                value={foodRestaurantId}
                onChange={(e) => {
                  setFoodRestaurantId(e.target.value);
                  setFoodRestaurantError(null);
                }}
                aria-invalid={foodRestaurantError !== null}
              >
                <option value="">Select a food restaurant</option>
                {foodRestaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
              {foodRestaurantError && (
                <p className="text-sm text-destructive">{foodRestaurantError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="round-drink-restaurant">Drink restaurant</Label>
              <select
                id="round-drink-restaurant"
                className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                value={drinkRestaurantId}
                onChange={(e) => setDrinkRestaurantId(e.target.value)}
              >
                <option value="">None</option>
                {drinkRestaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
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

      <Card>
        <CardHeader>
          <CardTitle>Rounds</CardTitle>
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
              ) : (
                <ul className="flex flex-col gap-2">
                  {rounds.map((round) => (
                    <li key={round.id} className="text-sm">
                      <Link
                        to={`/admin/rounds/${round.id}`}
                        className="font-medium underline"
                      >
                        {round.label}
                      </Link>
                      <span className="text-muted-foreground"> ({round.status})</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {restaurantName(round.foodRestaurantId)}
                        {round.drinkRestaurantId != null &&
                          ` + ${restaurantName(round.drinkRestaurantId)}`}
                      </span>
                      <span className="text-muted-foreground">
                        {" "}
                        · deadline {new Date(round.deadline).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
