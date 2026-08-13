import { ArrowLeft, CircleCheck, CircleX } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import { formatPrice } from "@/lib/format-price";
import { RestaurantTypeBadge } from "./RestaurantTypeBadge";
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
  const [price, setPrice] = useState("");

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.validate()) return;
    createMenuItem.mutate(
      { name: name.value, price: price || undefined },
      {
        onSuccess: () => {
          name.reset();
          setPrice("");
        },
      },
    );
  }

  if (restaurantPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading restaurant…</p>;
  }

  if (!restaurant) {
    return <p className="p-6 text-sm text-destructive">Restaurant not found.</p>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <Link
          to="/admin/restaurants"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All restaurants
        </Link>
        <div className="mt-1 flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{restaurant.name}</h1>
          <RestaurantTypeBadge type={restaurant.type} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Add menu item</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="menu-item-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input id="menu-item-name" {...name.inputProps} />
                {name.error && <p className="text-sm text-destructive">{name.error}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="menu-item-price">Price</Label>
                <Input
                  id="menu-item-price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
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
              <ul className="flex flex-col divide-y divide-border">
                {menuItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span
                      className={!item.active ? "text-muted-foreground line-through" : undefined}
                    >
                      {item.name}
                      {item.price && (
                        <span className="text-muted-foreground"> — {formatPrice(item.price)}</span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={item.active ? "Deactivate" : "Activate"}
                      onClick={() => toggleActive.mutate(item.id)}
                      disabled={toggleActive.isPending}
                      className={
                        item.active
                          ? "text-emerald-600 hover:opacity-80 dark:text-emerald-400"
                          : "text-muted-foreground hover:opacity-80"
                      }
                    >
                      {item.active ? <CircleCheck /> : <CircleX />}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
