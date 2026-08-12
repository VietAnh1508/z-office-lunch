import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type PublicRoundItem = {
  // The curated round-menu-item's own id (not the underlying menu item's id)
  // — task 009's submission form posts this id straight through.
  id: number;
  name: string;
};

export type PublicRound = {
  label: string;
  deadline: string;
  status: "open" | "closed";
  foodItems: PublicRoundItem[];
  drinkItems?: PublicRoundItem[];
};

export const publicRoundKeys = {
  detail: (roundId: number) => ["public-rounds", roundId] as const,
};

export function usePublicRound(roundId: number) {
  return useQuery({
    queryKey: publicRoundKeys.detail(roundId),
    queryFn: () => api.get<PublicRound>(`/rounds/${roundId}/public`),
  });
}
