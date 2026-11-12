import type { ReactNode } from "react";
import type { RoundSubmission } from "../shared/useRoundSubmissions";
import { submissionColumns } from "./submissionColumns";
import { useEmployees } from "./useEmployees";

export function SubmissionsTable({
  submissions,
  hasFood,
  hasDrink,
  renderActions,
}: {
  submissions: RoundSubmission[] | undefined;
  hasFood: boolean;
  hasDrink: boolean;
  renderActions?: (submission: RoundSubmission) => ReactNode;
}) {
  const columns = submissionColumns({ hasFood, hasDrink });
  // Every cell gets right padding except the very last one in the row.
  const padding = (index: number) => (index === columns.length - 1 && !renderActions ? "" : "pr-4");
  const { data: employees } = useEmployees();
  const totalActiveEmployees = employees?.filter((employee) => employee.active).length;
  const submittedCount = submissions?.length ?? 0;
  const countLabel =
    totalActiveEmployees !== undefined
      ? `${submittedCount} / ${totalActiveEmployees} submitted`
      : null;

  if (!submissions || submissions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {countLabel && <p className="text-sm text-muted-foreground">{countLabel}</p>}
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {countLabel && <p className="text-sm text-muted-foreground">{countLabel}</p>}
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1.5 pr-4 font-medium">No.</th>
              {columns.map((column, index) => (
                <th key={column.header} className={`py-1.5 font-medium ${padding(index)}`}>
                  {column.header}
                </th>
              ))}
              {renderActions && <th className="py-1.5 font-medium" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {submissions.map((submission, index) => (
              <tr key={submission.id}>
                <td className="py-1.5 pr-4 text-muted-foreground">{index + 1}</td>
                {columns.map((column, columnIndex) => (
                  <td key={column.header} className={`py-1.5 ${padding(columnIndex)}`}>
                    {column.missing?.(submission) ? (
                      <span className="text-destructive">{column.header} missing</span>
                    ) : (
                      column.value(submission)
                    )}
                  </td>
                ))}
                {renderActions && <td className="py-1.5">{renderActions(submission)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
