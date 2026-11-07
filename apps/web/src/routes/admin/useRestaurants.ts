import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";
import { publicRoundKeys } from "../public/usePublicRound";
import { menuItemKeys } from "./useMenuItems";

export type Restaurant = {
  id: number;
  name: string;
  type: "food" | "drink";
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
  menuImage: string | null;
  sizePresetId: number | null;
};

type CreateRestaurantInput = {
  name: string;
  type: "food" | "drink";
  contactInfo?: string;
  note?: string;
  menuUrl?: string;
  sizePresetId?: number;
};

type UpdateRestaurantInput = {
  name: string;
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
  // Omitted leaves the preset unchanged.
  sizePresetId?: number | null;
};

export const restaurantKeys = {
  all: ["restaurants"] as const,
  list: () => [...restaurantKeys.all, "list"] as const,
};

export function useRestaurants() {
  return useQuery({
    queryKey: restaurantKeys.list(),
    queryFn: () => api.get<Restaurant[]>("/restaurants"),
  });
}

export function useCreateRestaurant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRestaurantInput) => api.post<Restaurant>("/restaurants", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restaurantKeys.list() });
      toast.success("Restaurant added");
    },
    onError: (error) => toastApiError(error, "Could not create restaurant."),
  });
}

export function useUpdateRestaurant(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateRestaurantInput) =>
      api.patch<Restaurant>(`/restaurants/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restaurantKeys.list() });
      // A preset change rebuilds item sizes and clears submission sizes.
      queryClient.invalidateQueries({ queryKey: menuItemKeys.all(id) });
      queryClient.invalidateQueries({ queryKey: publicRoundKeys.all });
      toast.success("Restaurant updated");
    },
    onError: (error) => toastApiError(error, "Could not update restaurant."),
  });
}

export function useSizeResetImpact(id: number) {
  return useMutation({
    mutationFn: (sizePresetId: number | null) =>
      api.get<{ affectedSubmissions: number }>(
        `/restaurants/${id}/size-reset-impact?sizePresetId=${sizePresetId ?? "null"}`,
      ),
    onError: (error) => toastApiError(error, "Could not check the impact of changing sizes."),
  });
}

export function useUploadRestaurantMenuImage(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("menuImage", file);
      return api.upload<Restaurant>(`/restaurants/${id}/menu-image`, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restaurantKeys.list() });
      toast.success("Menu image uploaded");
    },
    onError: (error) => toastApiError(error, "Could not upload menu image."),
  });
}

export function useDeleteRestaurantMenuImage(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete<Restaurant>(`/restaurants/${id}/menu-image`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restaurantKeys.list() });
      toast.success("Menu image removed");
    },
    onError: (error) => toastApiError(error, "Could not remove menu image."),
  });
}
