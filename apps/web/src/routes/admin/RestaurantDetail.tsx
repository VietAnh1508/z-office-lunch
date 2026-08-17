import { ArrowLeft, CircleCheck, CircleX } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRequiredField } from "@/hooks/useRequiredField";
import { formatPrice } from "@/lib/format-price";
import { RestaurantTypeBadge } from "./RestaurantTypeBadge";
import type { Restaurant } from "./useRestaurants";
import { useRestaurants, useUpdateRestaurant } from "./useRestaurants";
import { useCreateMenuItem, useMenuItems, useToggleMenuItemActive } from "./useMenuItems";

function RestaurantDetailsForm({ restaurant }: { restaurant: Restaurant }) {
  const updateRestaurant = useUpdateRestaurant(restaurant.id);
  const name = useRequiredField("Name is required.", restaurant.name);
  const [contactInfo, setContactInfo] = useState(restaurant.contactInfo ?? "");
  const [note, setNote] = useState(restaurant.note ?? "");
  const [menuUrl, setMenuUrl] = useState(restaurant.menuUrl ?? "");

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.validate()) return;
    updateRestaurant.mutate({
      name: name.value,
      contactInfo: contactInfo || null,
      note: note || null,
      menuUrl: menuUrl || null,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restaurant-detail-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input id="restaurant-detail-name" {...name.inputProps} />
            {name.error && <p className="text-sm text-destructive">{name.error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restaurant-detail-contact-info">Contact info</Label>
            <Input
              id="restaurant-detail-contact-info"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restaurant-detail-note">Note</Label>
            <Textarea
              id="restaurant-detail-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restaurant-detail-menu-url">Menu website</Label>
            <div className="flex items-center gap-2">
              <Input
                id="restaurant-detail-menu-url"
                value={menuUrl}
                onChange={(e) => setMenuUrl(e.target.value)}
              />
              {restaurant.menuUrl && (
                <a
                  href={restaurant.menuUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  Open menu ↗
                </a>
              )}
            </div>
          </div>
          <Button type="submit" disabled={updateRestaurant.isPending} className="self-start">
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

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
  const [priceError, setPriceError] = useState<string | null>(null);

  function validatePrice(): boolean {
    const trimmed = price.trim();
    if (trimmed !== "" && !(Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0)) {
      setPriceError("Price must be a valid non-negative number.");
      return false;
    }
    setPriceError(null);
    return true;
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const isNameValid = name.validate();
    const isPriceValid = validatePrice();
    if (!isNameValid || !isPriceValid) return;
    createMenuItem.mutate(
      { name: name.value, price: price || undefined },
      {
        onSuccess: () => {
          name.reset();
          setPrice("");
          setPriceError(null);
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

      <RestaurantDetailsForm key={restaurant.id} restaurant={restaurant} />

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
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceError(null);
                  }}
                  aria-invalid={priceError !== null}
                />
                {priceError && <p className="text-sm text-destructive">{priceError}</p>}
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
