import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

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
      toast.success("Menu item added");
    },
    onError: (error) => toastApiError(error, "Could not create menu item."),
  });
}

export function useToggleMenuItemActive(restaurantId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) =>
      api.patch<MenuItem>(`/restaurants/${restaurantId}/menu-items/${itemId}`),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: menuItemKeys.list(restaurantId) });
      toast.success(item.active ? "Menu item activated" : "Menu item deactivated");
    },
    onError: (error) => toastApiError(error, "Could not update menu item."),
  });
}
