import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type PublicRoundItem = {
  // The curated round-menu-item's own id (not the underlying menu item's id)
  // — task 009's submission form posts this id straight through.
  id: number;
  name: string;
};

export type PublicRoundRestaurant = {
  id: number;
  name: string;
  menuUrl: string | null;
  menuImage: string | null;
};

export type PublicRound = {
  label: string;
  deadline: string;
  status: "open" | "closed";
  foodItems: PublicRoundItem[];
  drinkItems?: PublicRoundItem[];
  foodRestaurant: PublicRoundRestaurant;
  drinkRestaurant?: PublicRoundRestaurant;
};

export type PublicRoundListItem = {
  id: number;
  label: string;
  status: "open" | "closed";
  deadline: string;
  foodRestaurantName: string;
  drinkRestaurantName: string | null;
};

export const publicRoundKeys = {
  detail: (roundId: number) => ["public-rounds", roundId] as const,
  list: () => ["public-rounds", "list"] as const,
};

export function usePublicRound(roundId: number) {
  return useQuery({
    queryKey: publicRoundKeys.detail(roundId),
    queryFn: () => api.get<PublicRound>(`/rounds/${roundId}/public`),
  });
}

export function usePublicRounds() {
  return useQuery({
    queryKey: publicRoundKeys.list(),
    queryFn: () => api.get<PublicRoundListItem[]>("/rounds/public"),
  });
}
