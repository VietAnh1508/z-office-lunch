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

type UpdateRoundInput = {
  deadline: string;
  foodRestaurantId: number;
  drinkRestaurantId?: number;
};

export const roundKeys = {
  all: ["rounds"] as const,
  list: () => [...roundKeys.all, "list"] as const,
  detail: (roundId: number) => [...roundKeys.all, "detail", roundId] as const,
};

export function useRounds() {
  return useQuery({
    queryKey: roundKeys.list(),
    queryFn: () => api.get<Round[]>("/rounds"),
  });
}

export function useRound(roundId: number) {
  return useQuery({
    queryKey: roundKeys.detail(roundId),
    queryFn: () => api.get<Round>(`/rounds/${roundId}`),
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

export function useDeleteRound() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roundId: number) => api.delete<Round>(`/rounds/${roundId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roundKeys.all });
      toast.success("Round deleted");
    },
    onError: (error) => toastApiError(error, "Could not delete round."),
  });
}

export function useUpdateRound(roundId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateRoundInput) => api.patch<Round>(`/rounds/${roundId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roundKeys.all });
      toast.success("Round updated");
    },
    onError: (error) => toastApiError(error, "Could not update round."),
  });
}

const ROUND_STATUS_UPDATE_TOASTS: Record<Round["status"], string> = {
  open: "Round opened",
  closed: "Round closed",
  draft: "Round reverted to draft",
};

export function useUpdateRoundStatus(roundId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: "open" | "closed" | "draft") =>
      api.patch<Round>(`/rounds/${roundId}/status`, { status }),
    onSuccess: (round) => {
      queryClient.invalidateQueries({ queryKey: roundKeys.all });
      toast.success(ROUND_STATUS_UPDATE_TOASTS[round.status]);
    },
    onError: (error) => toastApiError(error, "Could not update round status."),
  });
}
