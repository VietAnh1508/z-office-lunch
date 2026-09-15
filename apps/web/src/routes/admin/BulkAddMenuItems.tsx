import { ClipboardPaste } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseMenuItemNames } from "@/lib/parse-menu-item-names";
import { MenuCandidateRow } from "./MenuCandidateRow";
import { useMenuCandidates } from "./useMenuCandidates";
import { useBulkCreateMenuItems } from "./useMenuItems";

export function BulkAddMenuItems({ restaurantId }: { restaurantId: number }) {
  const bulkCreate = useBulkCreateMenuItems(restaurantId);
  const {
    candidates,
    priceErrors,
    seed,
    handleCandidateChange,
    handleCandidateRemove,
    validateAllPrices,
    reset,
  } = useMenuCandidates();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [override, setOverride] = useState(false);

  function resetAll() {
    setStep("paste");
    setText("");
    setTextError(null);
    setOverride(false);
    reset();
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetAll();
  }

  function handleTextChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    setTextError(null);
  }

  function handleParse() {
    const names = parseMenuItemNames(text);
    if (names.length === 0) {
      setTextError("Enter at least one item name.");
      return;
    }
    setTextError(null);
    seed(names);
    setStep("review");
  }

  function handleSave() {
    if (!validateAllPrices()) return;
    bulkCreate.mutate(
      {
        mode: override ? "override" : "append",
        items: candidates.map((c) => ({ name: c.name, price: c.price.trim() })),
      },
      {
        onSuccess: () => {
          setOpen(false);
          resetAll();
        },
      },
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ClipboardPaste />
        Bulk-add menu items
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl">
          {step === "paste" ? (
            <>
              <DialogHeader>
                <DialogTitle>Bulk-add menu items</DialogTitle>
                <DialogDescription>
                  Paste one item name per line, then parse them into a reviewable list.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Textarea
                  aria-label="Paste menu item names"
                  placeholder="Pho Bo&#10;Banh Mi&#10;Com Tam"
                  value={text}
                  onChange={handleTextChange}
                  aria-invalid={textError !== null}
                  className="min-h-40"
                />
                {textError && <p className="text-sm text-destructive">{textError}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bulk-add-menu-items-overwrite"
                  checked={override}
                  onCheckedChange={(checked) => setOverride(checked === true)}
                />
                <Label htmlFor="bulk-add-menu-items-overwrite">
                  Overwrite current menu items
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" onClick={handleParse}>
                  Parse
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Review menu items</DialogTitle>
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
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={candidates.length === 0 || bulkCreate.isPending}
                >
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
