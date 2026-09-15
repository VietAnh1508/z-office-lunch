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
import type { RoundSubmission } from "../../shared/useRoundSubmissions";

export function OverwriteSubmissionDialog({
  open,
  existing,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  existing: RoundSubmission | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You already have a submission for this round</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-1">
              <span>
                Food: {existing?.foodName ?? "No food selected"}
                {existing?.foodNote ? ` (${existing.foodNote})` : ""}
              </span>
              {existing?.drinkName && (
                <span>
                  Drink: {existing.drinkName}
                  {existing.drinkNote ? ` (${existing.drinkNote})` : ""}
                </span>
              )}
              <span className="mt-1 font-medium text-foreground">
                Submitting again will replace this.
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            Submit anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
