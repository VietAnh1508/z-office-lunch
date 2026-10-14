import Linkify from "linkify-react";
import type { PublicRoundRestaurant } from "../usePublicRound";

const LINK_OPTIONS = {
  defaultProtocol: "https",
  target: "_blank",
  rel: "noopener noreferrer",
  className: "underline hover:text-foreground",
};

export function RestaurantNote({ restaurant }: { restaurant: PublicRoundRestaurant }) {
  if (!restaurant.note?.trim()) return null;
  return (
    <div
      data-testid="restaurant-note"
      className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 px-3 py-2"
    >
      <p className="text-xs font-medium text-foreground">Note from {restaurant.name}</p>
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        <Linkify options={LINK_OPTIONS}>{restaurant.note}</Linkify>
      </p>
    </div>
  );
}
