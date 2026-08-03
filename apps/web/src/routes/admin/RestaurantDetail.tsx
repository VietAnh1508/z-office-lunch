import { type SubmitEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { ApiError } from "@/lib/api";
import { useRestaurants } from "./useRestaurants";
import { useCreateMenuItem, useMenuItems, useToggleMenuItemActive } from "./useMenuItems";

export function RestaurantDetail() {
  const { id } = useParams<{ id: string }>();
  const restaurantId = Number(id);

  const { data: restaurants, isPending: restaurantPending } = useRestaurants();
  const restaurant = restaurants?.find((r) => r.id === restaurantId);

  const { data: menuItems, isPending, isError } = useMenuItems(restaurantId);
  const createMenuItem = useCreateMenuItem(restaurantId);
  const toggleActive = useToggleMenuItemActive(restaurantId);

  const name = useRequiredField("Name is required.");
  const [type, setType] = useState<"food" | "drink">("food");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!name.validate()) return;
    try {
      await createMenuItem.mutateAsync({
        type,
        name: name.value,
        price: price || undefined,
      });
      name.reset();
      setType("food");
      setPrice("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create menu item.");
    }
  }

  if (restaurantPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading restaurant…</p>;
  }

  if (!restaurant) {
    return <p className="p-6 text-sm text-destructive">Restaurant not found.</p>;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <Link to="/admin/restaurants" className="text-sm text-muted-foreground underline">
          ← Restaurants
        </Link>
        <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add menu item</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="menu-item-type">Type</Label>
              <select
                id="menu-item-type"
                className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as "food" | "drink")}
              >
                <option value="food">Food</option>
                <option value="drink">Drink</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="menu-item-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input id="menu-item-name" {...name.inputProps} />
              {name.error && <p className="text-sm text-destructive">{name.error}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="menu-item-price">Price</Label>
              <Input id="menu-item-price" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={createMenuItem.isPending}>
              Add menu item
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menu items</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading menu items…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Could not load menu items.</p>
          ) : menuItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No menu items yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {menuItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {item.name}
                    <span className="text-muted-foreground"> ({item.type})</span>
                    {item.price && <span className="text-muted-foreground"> — {item.price}</span>}
                    {!item.active && <span className="text-muted-foreground"> — inactive</span>}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive.mutate(item.id)}
                    disabled={toggleActive.isPending}
                  >
                    {item.active ? "Deactivate" : "Activate"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
