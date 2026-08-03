import { type SubmitEvent, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { ApiError } from "@/lib/api";
import { useCreateRestaurant, useRestaurants } from "./useRestaurants";

export function Restaurants() {
  const { data: restaurants, isPending, isError } = useRestaurants();
  const createRestaurant = useCreateRestaurant();

  const name = useRequiredField("Name is required.");
  const [type, setType] = useState<"food" | "drink">("food");
  const [contactInfo, setContactInfo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.validate()) return;
    try {
      await createRestaurant.mutateAsync({
        name: name.value,
        type,
        contactInfo: contactInfo || undefined,
      });
      name.reset();
      setType("food");
      setContactInfo("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create restaurant.");
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add restaurant</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restaurant-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="restaurant-name" {...name.inputProps} />
              {name.error && <p className="text-sm text-destructive">{name.error}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restaurant-type">Type</Label>
              <select
                id="restaurant-type"
                className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as "food" | "drink")}
              >
                <option value="food">Food</option>
                <option value="drink">Drink</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restaurant-contact-info">Contact info</Label>
              <Input
                id="restaurant-contact-info"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={createRestaurant.isPending}>
              Add restaurant
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restaurants</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading restaurants…</p>
          ) : isError && !restaurants ? (
            <p className="text-sm text-destructive">Could not load restaurants.</p>
          ) : (
            <>
              {isError && (
                <p className="mb-2 text-sm text-destructive">Could not refresh restaurants.</p>
              )}
              {restaurants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No restaurants yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {restaurants.map((restaurant) => (
                    <li key={restaurant.id} className="text-sm">
                      <Link to={`/admin/restaurants/${restaurant.id}`} className="underline">
                        {restaurant.name}
                      </Link>
                      <span className="text-muted-foreground"> ({restaurant.type})</span>
                      {restaurant.contactInfo && (
                        <span className="text-muted-foreground"> — {restaurant.contactInfo}</span>
                      )}
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
