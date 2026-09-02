import { X } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MenuCandidate = { rowId: string; name: string; price: string };

export function MenuCandidateRow({
  candidate,
  priceError,
  onChange,
  onRemove,
}: {
  candidate: MenuCandidate;
  priceError: string | null;
  onChange: (rowId: string, patch: Partial<Pick<MenuCandidate, "name" | "price">>) => void;
  onRemove: (rowId: string) => void;
}) {
  function handleNameChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(candidate.rowId, { name: e.target.value });
  }

  function handlePriceChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(candidate.rowId, { price: e.target.value });
  }

  return (
    <li className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-1 flex-col gap-1.5">
        <Input
          aria-label="Candidate name"
          placeholder="Name"
          value={candidate.name}
          onChange={handleNameChange}
        />
        <Input
          aria-label="Candidate price"
          placeholder="Price"
          value={candidate.price}
          onChange={handlePriceChange}
          aria-invalid={priceError !== null}
        />
        {priceError && <p className="text-sm text-destructive">{priceError}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove candidate"
        onClick={() => onRemove(candidate.rowId)}
        className="shrink-0"
      >
        <X />
      </Button>
    </li>
  );
}
