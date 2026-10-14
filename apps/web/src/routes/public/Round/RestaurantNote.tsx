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
    <p
      data-testid="restaurant-note"
      className="whitespace-pre-wrap text-sm text-muted-foreground"
    >
      <Linkify options={LINK_OPTIONS}>{restaurant.note}</Linkify>
    </p>
  );
}
