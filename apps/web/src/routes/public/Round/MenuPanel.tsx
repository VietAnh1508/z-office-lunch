import { MenuPanelCard } from "./MenuPanelCard";
import type { PublicRound, PublicRoundRestaurant } from "../usePublicRound";

export function MenuPanel({ round }: { round: PublicRound }) {
  const restaurants = [round.foodRestaurant, round.drinkRestaurant].filter(
    (r): r is PublicRoundRestaurant => Boolean(r?.menuImage),
  );
  if (restaurants.length === 0) return null;
  return (
    <aside className="hidden lg:sticky lg:top-8 lg:flex lg:flex-col lg:gap-4 lg:self-start">
      {restaurants.map((restaurant) => (
        <MenuPanelCard key={restaurant.id} restaurant={restaurant} />
      ))}
    </aside>
  );
}
