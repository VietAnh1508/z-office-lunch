import type { ReactNode } from "react";
import type { RoundSubmission } from "./useRoundSubmissions";

export const SUBMISSION_COLUMNS = ["Employee", "Food", "Food note", "Drink", "Drink note"];

export function SubmissionsTable({
  submissions,
  renderActions,
}: {
  submissions: RoundSubmission[] | undefined;
  renderActions?: (submission: RoundSubmission) => ReactNode;
}) {
  if (!submissions || submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No submissions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {SUBMISSION_COLUMNS.map((column, index) => (
              <th
                key={column}
                className={
                  index === SUBMISSION_COLUMNS.length - 1 && !renderActions
                    ? "py-1.5 font-medium"
                    : "py-1.5 pr-4 font-medium"
                }
              >
                {column}
              </th>
            ))}
            {renderActions && <th className="py-1.5 font-medium" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {submissions.map((submission) => (
            <tr key={submission.id}>
              <td className="py-1.5 pr-4">{submission.employeeName}</td>
              <td className="py-1.5 pr-4">{submission.foodName}</td>
              <td className="py-1.5 pr-4">{submission.foodNote}</td>
              <td className="py-1.5 pr-4">{submission.drinkName}</td>
              <td className={renderActions ? "py-1.5 pr-4" : "py-1.5"}>{submission.drinkNote}</td>
              {renderActions && <td className="py-1.5">{renderActions(submission)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
