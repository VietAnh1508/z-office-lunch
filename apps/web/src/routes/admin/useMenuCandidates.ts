import { useState } from "react";
import type { MenuCandidate } from "./MenuCandidateRow";

function validatePrice(price: string): string | null {
  const trimmed = price.trim();
  if (trimmed !== "" && !(Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0)) {
    return "Price must be a valid non-negative number.";
  }
  return null;
}

export function useMenuCandidates() {
  const [candidates, setCandidates] = useState<MenuCandidate[]>([]);
  const [priceErrors, setPriceErrors] = useState<Record<string, string | null>>({});

  function seed(names: string[]) {
    setCandidates(names.map((name) => ({ rowId: crypto.randomUUID(), name, price: "" })));
    setPriceErrors({});
  }

  function handleCandidateChange(
    rowId: string,
    patch: Partial<Pick<MenuCandidate, "name" | "price">>,
  ) {
    setCandidates((prev) => prev.map((c) => (c.rowId === rowId ? { ...c, ...patch } : c)));
    if (patch.price !== undefined) {
      setPriceErrors((prev) => ({ ...prev, [rowId]: null }));
    }
  }

  function handleCandidateRemove(rowId: string) {
    setCandidates((prev) => prev.filter((c) => c.rowId !== rowId));
    setPriceErrors((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }

  function validateAllPrices(): boolean {
    const errors: Record<string, string | null> = {};
    let valid = true;
    for (const candidate of candidates) {
      const error = validatePrice(candidate.price);
      errors[candidate.rowId] = error;
      if (error) valid = false;
    }
    setPriceErrors(errors);
    return valid;
  }

  function reset() {
    setCandidates([]);
    setPriceErrors({});
  }

  return {
    candidates,
    priceErrors,
    seed,
    handleCandidateChange,
    handleCandidateRemove,
    validateAllPrices,
    reset,
  };
}
