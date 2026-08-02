import { type SubmitEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useCreateRestaurant, useRestaurants } from "./useRestaurants";

export function Restaurants() {
  const { data: restaurants, isPending, isError } = useRestaurants();
  const createRestaurant = useCreateRestaurant();

  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await createRestaurant.mutateAsync({
        name,
        contactInfo: contactInfo || undefined,
      });
      setName("");
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
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              placeholder="Contact info (optional)"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
            />
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
                      {restaurant.name}
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
