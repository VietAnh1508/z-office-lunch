import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type RoundSubmission = {
  id: number;
  employeeName: string;
  foodName: string | null;
  foodNote: string | null;
  drinkName: string | null;
  drinkNote: string | null;
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
