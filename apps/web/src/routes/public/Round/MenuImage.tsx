import { cn } from "@/lib/utils";
import type { PublicRoundRestaurant } from "../usePublicRound";

export function menuImageSrc(restaurant: PublicRoundRestaurant) {
  return `/api/restaurants/${restaurant.id}/menu-image?v=${restaurant.menuImage}`;
}

export function MenuImage({
  restaurant,
  className,
}: {
  restaurant: PublicRoundRestaurant;
  className?: string;
}) {
  if (!restaurant.menuImage) return null;
  return (
    <img
      src={menuImageSrc(restaurant)}
      alt={`${restaurant.name} menu`}
      className={cn("rounded-lg border border-border", className)}
    />
  );
}
