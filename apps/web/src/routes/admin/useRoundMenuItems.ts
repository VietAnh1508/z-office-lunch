import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type RoundMenuItem = {
  id: number;
  roundId: number;
  menuItemId: number;
};

export const roundMenuItemKeys = {
  all: (roundId: number) => ["rounds", roundId, "menu-items"] as const,
  list: (roundId: number) => [...roundMenuItemKeys.all(roundId), "list"] as const,
};

export function useRoundMenuItems(roundId: number) {
  return useQuery({
    queryKey: roundMenuItemKeys.list(roundId),
    queryFn: () => api.get<RoundMenuItem[]>(`/rounds/${roundId}/menu-items`),
  });
}

export function useAddRoundMenuItem(roundId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (menuItemId: number) =>
      api.post<RoundMenuItem>(`/rounds/${roundId}/menu-items`, { menuItemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roundMenuItemKeys.list(roundId) });
      toast.success("Menu item added to round");
    },
    onError: (error) => toastApiError(error, "Could not add menu item to round."),
  });
}

export function useRemoveRoundMenuItem(roundId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roundMenuItemId: number) =>
      api.delete(`/rounds/${roundId}/menu-items/${roundMenuItemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roundMenuItemKeys.list(roundId) });
      toast.success("Menu item removed from round");
    },
    onError: (error) => toastApiError(error, "Could not remove menu item from round."),
  });
}
