import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type RoundSubmission = {
  id: number;
  employeeName: string;
  foodName: string | null;
  foodNote: string | null;
  drinkName: string | null;
  drinkNote: string | null;
  foodRoundMenuItemId: number | null;
  drinkRoundMenuItemId: number | null;
};

type UpdateRoundSubmissionInput = {
  submissionId: number;
  foodRoundMenuItemId: number;
  foodNote?: string;
  drinkRoundMenuItemId?: number;
  drinkNote?: string;
};

export const roundSubmissionKeys = {
  all: (roundId: number) => ["rounds", roundId, "submissions"] as const,
  list: (roundId: number) => [...roundSubmissionKeys.all(roundId), "list"] as const,
};

export function useRoundSubmissions(roundId: number) {
  return useQuery({
    queryKey: roundSubmissionKeys.list(roundId),
    queryFn: () => api.get<RoundSubmission[]>(`/rounds/${roundId}/submissions`),
  });
}

export function useSubmissionForEmployee(roundId: number, employeeId: number | null) {
  return useQuery({
    queryKey: [...roundSubmissionKeys.list(roundId), "employee", employeeId],
    queryFn: () => api.get<RoundSubmission[]>(`/rounds/${roundId}/submissions?employeeId=${employeeId}`),
    enabled: employeeId !== null,
  });
}

export function useUpdateRoundSubmission(roundId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ submissionId, ...input }: UpdateRoundSubmissionInput) =>
      api.patch(`/rounds/${roundId}/submissions/${submissionId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roundSubmissionKeys.all(roundId) });
      toast.success("Submission updated");
    },
    onError: (error) => toastApiError(error, "Could not update submission."),
  });
}
