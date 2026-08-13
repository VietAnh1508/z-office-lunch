import { Badge } from "@/components/ui/badge";
import type { Restaurant } from "./useRestaurants";

const TYPE_BADGE_CLASS: Record<Restaurant["type"], string> = {
  food: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  drink: "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
};

export function RestaurantTypeBadge({ type }: { type: Restaurant["type"] }) {
  return <Badge className={TYPE_BADGE_CLASS[type]}>{type}</Badge>;
}
