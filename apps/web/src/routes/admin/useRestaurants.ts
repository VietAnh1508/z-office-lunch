import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type Restaurant = {
  id: number;
  name: string;
  type: "food" | "drink";
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
};

type CreateRestaurantInput = {
  name: string;
  type: "food" | "drink";
  contactInfo?: string;
  note?: string;
  menuUrl?: string;
};

type UpdateRestaurantInput = {
  name: string;
  contactInfo: string | null;
  note: string | null;
  menuUrl: string | null;
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
    mutationFn: (input: UpdateRestaurantInput) => api.patch<Restaurant>(`/restaurants/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restaurantKeys.list() });
      toast.success("Restaurant updated");
    },
    onError: (error) => toastApiError(error, "Could not update restaurant."),
  });
}
