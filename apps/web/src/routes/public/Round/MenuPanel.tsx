import { MenuPanelCard } from "./MenuPanelCard";
import type { Step } from "./SubmissionForm";
import type { PublicRound } from "../usePublicRound";

export function MenuPanel({ round, step }: { round: PublicRound; step: Step }) {
  const restaurant =
    step === "food"
      ? round.foodRestaurant
      : step === "drink"
        ? round.drinkRestaurant
        : undefined;
  if (!restaurant?.menuImage) return null;
  return (
    <aside className="hidden lg:sticky lg:top-8 lg:flex lg:flex-col lg:gap-4 lg:self-start">
      <MenuPanelCard key={restaurant.id} restaurant={restaurant} />
    </aside>
  );
}
