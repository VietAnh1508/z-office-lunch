import { Label } from "@/components/ui/label";
import type { Restaurant } from "./useRestaurants";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

type Props = {
  idPrefix: string;
  restaurants: Restaurant[] | undefined;
  foodRestaurantId: string;
  drinkRestaurantId: string;
  onFoodChange: (value: string) => void;
  onDrinkChange: (value: string) => void;
  error: string | null;
};

// Both selects are optional individually, but at least one is required, so a
// single error shows under both.
export function RoundRestaurantFields({
  idPrefix,
  restaurants,
  foodRestaurantId,
  drinkRestaurantId,
  onFoodChange,
  onDrinkChange,
  error,
}: Props) {
  const sides = [
    { type: "food", label: "Food restaurant", value: foodRestaurantId, onChange: onFoodChange },
    { type: "drink", label: "Drink restaurant", value: drinkRestaurantId, onChange: onDrinkChange },
  ] as const;

  return (
    <>
      {sides.map(({ type, label, value, onChange }) => (
        <div key={type} className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-${type}-restaurant`}>{label}</Label>
          <select
            id={`${idPrefix}-${type}-restaurant`}
            className={selectClassName}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error !== null}
          >
            <option value="">None</option>
            {(restaurants ?? [])
              .filter((restaurant) => restaurant.type === type)
              .map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
          </select>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      ))}
    </>
  );
}
