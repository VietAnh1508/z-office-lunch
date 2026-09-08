import { Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MenuCandidateRow, type MenuCandidate } from "./MenuCandidateRow";
import { useBulkCreateMenuItems, useGenerateMenuFromImage, useMenuItems } from "./useMenuItems";

function validatePrice(price: string): string | null {
  const trimmed = price.trim();
  if (trimmed !== "" && !(Number.isFinite(Number(trimmed)) && Number(trimmed) >= 0)) {
    return "Price must be a valid non-negative number.";
  }
  return null;
}

export function GenerateMenuFromImage({ restaurantId }: { restaurantId: number }) {
  const { data: menuItems } = useMenuItems(restaurantId);
  const bulkCreate = useBulkCreateMenuItems(restaurantId);
  const generateMenu = useGenerateMenuFromImage(restaurantId);
  const [candidates, setCandidates] = useState<MenuCandidate[]>([]);
  const [priceErrors, setPriceErrors] = useState<Record<string, string | null>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  const hasExistingItems = (menuItems?.length ?? 0) > 0;

  function handleGenerate() {
    generateMenu.mutate(undefined, {
      onSuccess: ({ items }) => {
        if (items.length === 0) {
          toast.error("No menu items found in the image.");
          return;
        }
        setCandidates(
          items.map((item) => ({ rowId: crypto.randomUUID(), name: item.name, price: "" })),
        );
        setPriceErrors({});
        setReviewOpen(true);
      },
    });
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

  function save(mode: "override" | "append") {
    bulkCreate.mutate(
      { mode, items: candidates.map((c) => ({ name: c.name, price: c.price.trim() })) },
      {
        onSuccess: () => {
          setReviewOpen(false);
          setConfirmReplaceOpen(false);
          setCandidates([]);
          setPriceErrors({});
        },
      },
    );
  }

  function handleAddClick() {
    if (!validateAllPrices()) return;
    save("append");
  }

  function handleReplaceClick() {
    if (!validateAllPrices()) return;
    setConfirmReplaceOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={generateMenu.isPending}
        onClick={handleGenerate}
        className="border border-violet-600/30 bg-violet-600/10 text-violet-700 hover:bg-violet-600/20 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300 dark:hover:bg-violet-400/20"
      >
        <Sparkles />
        {generateMenu.isPending ? "Generating menu…" : "Generate menu from image"}
      </Button>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review generated menu items</DialogTitle>
            <DialogDescription>
              Edit or remove items before saving them to the menu.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
            {candidates.map((candidate) => (
              <MenuCandidateRow
                key={candidate.rowId}
                candidate={candidate}
                priceError={priceErrors[candidate.rowId] ?? null}
                onChange={handleCandidateChange}
                onRemove={handleCandidateRemove}
              />
            ))}
          </ul>
          <DialogFooter>
            {hasExistingItems ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddClick}
                  disabled={candidates.length === 0 || bulkCreate.isPending}
                >
                  Add to current menu
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReplaceClick}
                  disabled={candidates.length === 0 || bulkCreate.isPending}
                >
                  <TriangleAlert className="text-amber-600 dark:text-amber-400" />
                  Replace current menu
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={handleAddClick}
                disabled={candidates.length === 0 || bulkCreate.isPending}
              >
                Save
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current menu?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates the restaurant's current menu items and replaces them with the
              generated ones. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => save("override")}>
              Yes, replace menu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
