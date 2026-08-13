import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { type SubmitEvent, useState } from "react";
import { Link } from "react-router";
import { RestaurantTypeBadge } from "./RestaurantTypeBadge";
import { useCreateRestaurant, useRestaurants, type Restaurant } from "./useRestaurants";

type TypeFilter = "all" | Restaurant["type"];

const TYPE_FILTER_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All types" },
  { value: "food", label: "Food" },
  { value: "drink", label: "Drink" },
];

export function Restaurants() {
  const { data: restaurants, isPending, isError } = useRestaurants();
  const createRestaurant = useCreateRestaurant();

  const name = useRequiredField("Name is required.");
  const [type, setType] = useState<"food" | "drink">("food");
  const [contactInfo, setContactInfo] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const filteredRestaurants =
    restaurants?.filter(
      (restaurant) => typeFilter === "all" || restaurant.type === typeFilter,
    ) ?? [];

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.validate()) return;
    createRestaurant.mutate(
      { name: name.value, type, contactInfo: contactInfo || undefined },
      {
        onSuccess: () => {
          name.reset();
          setType("food");
          setContactInfo("");
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Add restaurant</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="restaurant-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input id="restaurant-name" {...name.inputProps} />
                {name.error && (
                  <p className="text-sm text-destructive">{name.error}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="restaurant-type">Type</Label>
                <select
                  id="restaurant-type"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <Button type="submit" disabled={createRestaurant.isPending}>
                Add restaurant
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restaurants</CardTitle>
            <CardAction>
              <div className="flex items-center gap-2">
                <Label htmlFor="restaurant-type-filter" className="text-sm text-muted-foreground">
                  Type
                </Label>
                <select
                  id="restaurant-type-filter"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                >
                  {TYPE_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-sm text-muted-foreground">
                Loading restaurants…
              </p>
            ) : isError && !restaurants ? (
              <p className="text-sm text-destructive">
                Could not load restaurants.
              </p>
            ) : (
              <>
                {isError && (
                  <p className="mb-2 text-sm text-destructive">
                    Could not refresh restaurants.
                  </p>
                )}
                {restaurants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No restaurants yet.
                  </p>
                ) : filteredRestaurants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No restaurants match this filter.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {filteredRestaurants.map((restaurant) => (
                      <li
                        key={restaurant.id}
                        className="flex flex-wrap items-center gap-2 py-2.5 text-sm first:pt-0 last:pb-0"
                      >
                        <Link
                          to={`/admin/restaurants/${restaurant.id}`}
                          className="font-medium hover:underline"
                        >
                          {restaurant.name}
                        </Link>
                        <RestaurantTypeBadge type={restaurant.type} />
                        {restaurant.contactInfo && (
                          <span className="text-muted-foreground">
                            — {restaurant.contactInfo}
                          </span>
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
    </div>
  );
}
