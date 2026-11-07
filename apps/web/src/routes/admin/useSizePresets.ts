import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type SizeOption = {
  id: number;
  label: string;
  sortOrder: number;
};

export type SizePreset = {
  id: number;
  name: string;
  options: SizeOption[];
};

type CreateSizePresetInput = {
  name: string;
  options: string[];
};

type UpdateSizePresetInput = {
  id: number;
  name: string;
  // An entry with an `id` keeps that existing option; one without is added.
  options: { id?: number; label: string }[];
};

export const sizePresetKeys = {
  all: ["size-presets"] as const,
  list: () => [...sizePresetKeys.all, "list"] as const,
};

export function useSizePresets({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: sizePresetKeys.list(),
    queryFn: () => api.get<SizePreset[]>("/size-presets"),
  });
}

export function useCreateSizePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSizePresetInput) => api.post<SizePreset>("/size-presets", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sizePresetKeys.list() });
      toast.success("Size preset added");
    },
    onError: (error) => toastApiError(error, "Could not create size preset."),
  });
}

export function useUpdateSizePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: UpdateSizePresetInput) =>
      api.patch<SizePreset>(`/size-presets/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sizePresetKeys.list() });
      toast.success("Size preset updated");
    },
    onError: (error) => toastApiError(error, "Could not update size preset."),
  });
}

export function useDeleteSizePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete<{ id: number }>(`/size-presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sizePresetKeys.list() });
      toast.success("Size preset deleted");
    },
    onError: (error) => toastApiError(error, "Could not delete size preset."),
  });
}
