import { ArrowLeft, CircleCheck, CircleX, Pencil, Trash2, Upload } from "lucide-react";
import { type ChangeEvent, type SubmitEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useRequiredField } from "@/hooks/useRequiredField";
import { formatPrice } from "@/lib/format-price";
import { BulkAddMenuItems } from "./BulkAddMenuItems";
import { GenerateMenuFromImage } from "./GenerateMenuFromImage";
import { RestaurantTypeBadge } from "./RestaurantTypeBadge";
import { SizePresetSelect } from "./SizePresetSelect";
import { type SizeOption, useSizePresets } from "./useSizePresets";
import type { Restaurant } from "./useRestaurants";
import {
  useDeleteRestaurantMenuImage,
  useRestaurants,
  useSizeResetImpact,
  useUpdateRestaurant,
  useUploadRestaurantMenuImage,
} from "./useRestaurants";
import {
  type MenuItem,
  useCreateMenuItem,
  useMenuItems,
  useToggleMenuItemActive,
  useUpdateMenuItem,
  useUpdateMenuItemSizes,
} from "./useMenuItems";

function RestaurantDetailsForm({ restaurant }: { restaurant: Restaurant }) {
  const updateRestaurant = useUpdateRestaurant(restaurant.id);
  const uploadMenuImage = useUploadRestaurantMenuImage(restaurant.id);
  const deleteMenuImage = useDeleteRestaurantMenuImage(restaurant.id);
  const name = useRequiredField("Name is required.", restaurant.name);
  const [contactInfo, setContactInfo] = useState(restaurant.contactInfo ?? "");
  const [note, setNote] = useState(restaurant.note ?? "");
  const [menuUrl, setMenuUrl] = useState(restaurant.menuUrl ?? "");
  const [menuImage, setMenuImage] = useState(restaurant.menuImage);
  const [sizePresetId, setSizePresetId] = useState(restaurant.sizePresetId);
  const [impactCount, setImpactCount] = useState<number | null>(null);
  const sizeResetImpact = useSizeResetImpact(restaurant.id);
  const menuImageInputRef = useRef<HTMLInputElement>(null);
  const presetChanged = restaurant.type === "drink" && sizePresetId !== restaurant.sizePresetId;

  function save() {
    updateRestaurant.mutate({
      name: name.value,
      contactInfo: contactInfo || null,
      note: note || null,
      menuUrl: menuUrl || null,
      ...(presetChanged ? { sizePresetId } : {}),
    });
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.validate()) return;
    if (!presetChanged) {
      save();
      return;
    }
    sizeResetImpact.mutate(sizePresetId, {
      onSuccess: ({ affectedSubmissions }) => {
        if (affectedSubmissions > 0) setImpactCount(affectedSubmissions);
        else save();
      },
    });
  }

  function handleMenuImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadMenuImage.mutate(file, {
      onSuccess: (updated) => setMenuImage(updated.menuImage),
    });
  }

  function handleRemoveMenuImage() {
    deleteMenuImage.mutate(undefined, {
      onSuccess: (updated) => setMenuImage(updated.menuImage),
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
          {restaurant.type === "drink" && (
            <SizePresetSelect
              id="restaurant-detail-size-preset"
              value={sizePresetId}
              onChange={setSizePresetId}
            />
          )}
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
            <p className="text-xs text-muted-foreground">Shown to employees on the order page.</p>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="restaurant-detail-menu-image" className="sr-only">
              Upload menu image
            </Label>
            <input
              ref={menuImageInputRef}
              id="restaurant-detail-menu-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleMenuImageChange}
            />
            {menuImage && (
              <img
                src={`/api/restaurants/${restaurant.id}/menu-image?v=${menuImage}`}
                alt="Menu"
                className="max-w-xs rounded-lg border border-border"
              />
            )}
            <div className="flex flex-wrap items-center gap-4">
              {menuImage && <GenerateMenuFromImage restaurantId={restaurant.id} />}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadMenuImage.isPending}
                  onClick={() => menuImageInputRef.current?.click()}
                >
                  <Upload />
                  Upload menu image
                </Button>
                {menuImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleRemoveMenuImage}
                    disabled={deleteMenuImage.isPending}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                    Remove image
                  </Button>
                )}
              </div>
            </div>
          </div>
          <Button
            type="submit"
            disabled={updateRestaurant.isPending || sizeResetImpact.isPending}
            className="self-start"
          >
            Save
          </Button>
        </form>
      </CardContent>

      <AlertDialog
        open={impactCount !== null}
        onOpenChange={(open) => {
          if (!open) setImpactCount(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change size preset?</AlertDialogTitle>
            <AlertDialogDescription>
              {impactCount} {impactCount === 1 ? "order" : "orders"} in open rounds will lose{" "}
              {impactCount === 1 ? "its" : "their"} size. Ask people to resubmit after this change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setImpactCount(null);
                save();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function MenuItemRow({
  restaurantId,
  item,
  sizeOptions,
}: {
  restaurantId: number;
  item: MenuItem;
  sizeOptions: SizeOption[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const toggleActive = useToggleMenuItemActive(restaurantId);
  const updateMenuItem = useUpdateMenuItem(restaurantId);
  const updateSizes = useUpdateMenuItemSizes(restaurantId);
  const [sizeIds, setSizeIds] = useState(item.sizeOptionIds);
  const name = useRequiredField("Name is required.", item.name);
  const [price, setPrice] = useState(item.price ?? "");
  const [priceError, setPriceError] = useState<string | null>(null);

  const sizesChanged =
    sizeIds.length !== item.sizeOptionIds.length ||
    sizeIds.some((id) => !item.sizeOptionIds.includes(id));

  function validatePrice(): boolean {
    const trimmed = price.trim();
    if (trimmed !== "" && !(Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0)) {
      setPriceError("Price must be a valid non-negative number.");
      return false;
    }
    setPriceError(null);
    return true;
  }

  function handleSave() {
    const isNameValid = name.validate();
    const isPriceValid = validatePrice();
    if (!isNameValid || !isPriceValid) return;
    updateMenuItem.mutate(
      { id: item.id, name: name.value, price: price.trim() || null },
      {
        onSuccess: () => {
          if (!sizesChanged) {
            setIsEditing(false);
            return;
          }
          updateSizes.mutate(
            { id: item.id, sizeOptionIds: sizeIds },
            { onSuccess: () => setIsEditing(false) },
          );
        },
      },
    );
  }

  function toggleSize(optionId: number, checked: boolean) {
    setSizeIds((prev) => (checked ? [...prev, optionId] : prev.filter((id) => id !== optionId)));
  }

  function handleCancel() {
    name.reset();
    setPrice(item.price ?? "");
    setPriceError(null);
    setSizeIds(item.sizeOptionIds);
    setIsEditing(false);
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
      {isEditing ? (
        <div className="flex flex-1 flex-col gap-1.5">
          <Input {...name.inputProps} aria-label="Menu item name" placeholder="Name" />
          {name.error && <p className="text-sm text-destructive">{name.error}</p>}
          <Input
            aria-label="Menu item price"
            placeholder="Price"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setPriceError(null);
            }}
            aria-invalid={priceError !== null}
          />
          {priceError && <p className="text-sm text-destructive">{priceError}</p>}
          {sizeOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {sizeOptions.map((option) => (
                <div key={option.id} className="flex items-center gap-1.5">
                  <Checkbox
                    id={`menu-item-${item.id}-size-${option.id}`}
                    checked={sizeIds.includes(option.id)}
                    onCheckedChange={(checked) => toggleSize(option.id, checked === true)}
                  />
                  <Label htmlFor={`menu-item-${item.id}-size-${option.id}`}>{option.label}</Label>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className={!item.active ? "text-muted-foreground line-through" : undefined}>
          {item.name}
          {item.price && (
            <span className="text-muted-foreground"> — {formatPrice(item.price)}</span>
          )}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {isEditing ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={updateMenuItem.isPending || updateSizes.isPending}
            >
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Edit menu item"
              onClick={() => {
                setSizeIds(item.sizeOptionIds);
                setIsEditing(true);
              }}
            >
              <Pencil />
            </Button>
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
          </>
        )}
      </div>
    </li>
  );
}

export function RestaurantDetail() {
  const { id } = useParams<{ id: string }>();
  const restaurantId = Number(id);

  const { data: restaurants, isPending: restaurantPending } = useRestaurants();
  const restaurant = restaurants?.find((r) => r.id === restaurantId);
  const { data: sizePresets } = useSizePresets({
    enabled: restaurant?.sizePresetId != null,
  });
  const sizeOptions = sizePresets?.find((p) => p.id === restaurant?.sizePresetId)?.options ?? [];

  const { data: menuItems, isPending, isError } = useMenuItems(restaurantId);
  const createMenuItem = useCreateMenuItem(restaurantId);

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

      <Separator />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Add menu item</CardTitle>
            <CardAction>
              <BulkAddMenuItems restaurantId={restaurantId} />
            </CardAction>
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
                  <MenuItemRow
                    key={item.id}
                    restaurantId={restaurantId}
                    item={item}
                    sizeOptions={sizeOptions}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
