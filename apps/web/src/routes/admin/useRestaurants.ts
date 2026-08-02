import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Restaurant = {
  id: number;
  name: string;
  contactInfo: string | null;
  menuSourceNote: string | null;
};

type CreateRestaurantInput = {
  name: string;
  contactInfo?: string;
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
    },
  });
}
