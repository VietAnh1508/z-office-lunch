export function submissionColumns({ hasFood, hasDrink }: { hasFood: boolean; hasDrink: boolean }) {
  return [
    "Employee",
    ...(hasFood ? ["Food", "Food note"] : []),
    ...(hasDrink ? ["Drink", "Drink note"] : []),
  ];
}
