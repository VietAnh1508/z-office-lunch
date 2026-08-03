import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type MenuItem = {
  id: number;
  restaurantId: number;
  name: string;
  price: string | null;
  active: boolean;
};

type CreateMenuItemInput = {
  name: string;
  price?: string;
};

export const menuItemKeys = {
  all: (restaurantId: number) => ["restaurants", restaurantId, "menu-items"] as const,
  list: (restaurantId: number) => [...menuItemKeys.all(restaurantId), "list"] as const,
};

export function useMenuItems(restaurantId: number) {
  return useQuery({
    queryKey: menuItemKeys.list(restaurantId),
    queryFn: () => api.get<MenuItem[]>(`/restaurants/${restaurantId}/menu-items`),
  });
}

export function useCreateMenuItem(restaurantId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMenuItemInput) =>
      api.post<MenuItem>(`/restaurants/${restaurantId}/menu-items`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuItemKeys.list(restaurantId) });
    },
  });
}

export function useToggleMenuItemActive(restaurantId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) =>
      api.patch<MenuItem>(`/restaurants/${restaurantId}/menu-items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menuItemKeys.list(restaurantId) });
    },
  });
}
