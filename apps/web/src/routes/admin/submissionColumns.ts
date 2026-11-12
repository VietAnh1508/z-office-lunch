import type { RoundSubmission } from "../shared/useRoundSubmissions";

export type SubmissionColumn = {
  header: string;
  /** Plain value, used for the CSV and as the table cell's default content. */
  value: (submission: RoundSubmission) => string | null;
  /** Table-only: flag the cell as "<header> missing" instead of leaving it blank. */
  missing?: (submission: RoundSubmission) => boolean;
};

// The one column list both the submissions table and the CSV export read, so
// their headers and cells can't drift apart.
export function submissionColumns({
  hasFood,
  hasDrink,
}: {
  hasFood: boolean;
  hasDrink: boolean;
}): SubmissionColumn[] {
  return [
    { header: "Employee", value: (s) => s.employeeName },
    ...(hasFood
      ? [
          { header: "Food", value: (s: RoundSubmission) => s.foodName },
          { header: "Food note", value: (s: RoundSubmission) => s.foodNote },
        ]
      : []),
    ...(hasDrink
      ? [
          { header: "Drink", value: (s: RoundSubmission) => s.drinkName },
          {
            header: "Size",
            value: (s: RoundSubmission) => s.drinkSize,
            // The item has sizes but the order has none (e.g. after a preset reset).
            missing: (s: RoundSubmission) =>
              s.drinkRoundMenuItemId !== null &&
              s.drinkItemHasSizes &&
              s.drinkSizeOptionId === null,
          },
          { header: "Drink note", value: (s: RoundSubmission) => s.drinkNote },
        ]
      : []),
  ];
}
