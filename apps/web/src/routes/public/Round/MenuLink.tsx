import { normalizeMenuUrl } from "@/lib/menu-url";
import type { PublicRoundRestaurant } from "../usePublicRound";

export function MenuLink({ restaurant }: { restaurant: PublicRoundRestaurant }) {
  if (!restaurant.menuUrl) return null;
  return (
    <a
      href={normalizeMenuUrl(restaurant.menuUrl)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
    >
      Open menu ↗
    </a>
  );
}
