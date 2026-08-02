import { type SubmitEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

type Restaurant = {
  id: number;
  name: string;
  contactInfo: string | null;
  menuSourceNote: string | null;
};

export function Restaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Restaurant[]>("/restaurants").then(setRestaurants).catch(() => {
      setError("Could not load restaurants.");
    });
  }, []);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<Restaurant>("/restaurants", {
        name,
        contactInfo: contactInfo || undefined,
      });
      setRestaurants((prev) => [...prev, created]);
      setName("");
      setContactInfo("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create restaurant.");
    } finally {
      setSubmitting(false);
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
            <Button type="submit" disabled={submitting}>
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
        </CardContent>
      </Card>
    </div>
  );
}
