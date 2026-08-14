import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type ActiveEmployee = {
  id: number;
  fullName: string;
};

type CreateSubmissionInput = {
  employeeId: number;
  foodRoundMenuItemId: number;
  foodNote?: string;
  drinkRoundMenuItemId?: number;
  drinkNote?: string;
};

type Submission = {
  id: number;
  roundId: number;
  employeeId: number;
  foodRoundMenuItemId: number;
  foodNote: string | null;
  drinkRoundMenuItemId: number | null;
  drinkNote: string | null;
};

export function useActiveEmployees() {
  return useQuery({
    queryKey: ["employees", "active"],
    queryFn: () => api.get<ActiveEmployee[]>("/employees?active=true"),
  });
}

export function useCreateSubmission(roundId: number) {
  return useMutation({
    mutationFn: (input: CreateSubmissionInput) =>
      api.post<Submission>(`/rounds/${roundId}/submissions`, input),
    onSuccess: () => toast.success("Submission recorded"),
    onError: (error) => toastApiError(error, "Could not submit."),
  });
}
