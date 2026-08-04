import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type Round = {
  id: number;
  label: string;
  foodRestaurantId: number;
  drinkRestaurantId: number | null;
  deadline: string;
  status: "draft" | "open" | "closed";
  createdAt: string;
};

type CreateRoundInput = {
  label: string;
  foodRestaurantId: number;
  drinkRestaurantId?: number;
  deadline: string;
};

export const roundKeys = {
  all: ["rounds"] as const,
  list: () => [...roundKeys.all, "list"] as const,
};

export function useRounds() {
  return useQuery({
    queryKey: roundKeys.list(),
    queryFn: () => api.get<Round[]>("/rounds"),
  });
}

export function useCreateRound() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRoundInput) => api.post<Round>("/rounds", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roundKeys.list() });
      toast.success("Round added");
    },
    onError: (error) => toastApiError(error, "Could not create round."),
  });
}
