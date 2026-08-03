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
  const [contactInfo, setContactInfo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.validate()) return;
    try {
      await createRestaurant.mutateAsync({
        name: name.value,
        contactInfo: contactInfo || undefined,
      });
      name.reset();
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
