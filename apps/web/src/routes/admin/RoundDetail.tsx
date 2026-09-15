import { ArrowLeft, ChevronDown, Pencil, Share } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRequiredField } from "@/hooks/useRequiredField";
import { toCsv } from "@/lib/csv";
import { downloadCsv } from "@/lib/download";
import { copyRoundShareLink } from "@/lib/share-link";
import { cn } from "@/lib/utils";
import { RoundStatusBadge } from "./RoundStatusBadge";
import { SUBMISSION_COLUMNS, SubmissionsTable } from "./SubmissionsTable";
import type { MenuItem } from "./useMenuItems";
import { useMenuItems } from "./useMenuItems";
import type { Restaurant } from "./useRestaurants";
import { useRestaurants } from "./useRestaurants";
import {
  useAddRoundMenuItem,
  useRemoveRoundMenuItem,
  useRoundMenuItems,
} from "./useRoundMenuItems";
import { useDeleteRound, useRound, useUpdateRound, useUpdateRoundStatus } from "./useRounds";
import type { Round } from "./useRounds";
import type { RoundSubmission } from "../shared/useRoundSubmissions";
import { useRoundSubmissions, useUpdateRoundSubmission } from "../shared/useRoundSubmissions";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

type SubmissionOption = { id: number; name: string };

function SubmissionEditDialog({
  round,
  submission,
  foodOptions,
  drinkOptions,
  updateSubmission,
}: {
  round: Round;
  submission: RoundSubmission;
  foodOptions: SubmissionOption[];
  drinkOptions: SubmissionOption[];
  updateSubmission: ReturnType<typeof useUpdateRoundSubmission>;
}) {
  const [open, setOpen] = useState(false);
  const [foodItemId, setFoodItemId] = useState("");
  const [foodItemError, setFoodItemError] = useState<string | null>(null);
  const [foodNote, setFoodNote] = useState("");
  const [drinkItemId, setDrinkItemId] = useState("");
  const [drinkNote, setDrinkNote] = useState("");

  // Reset fields from the submission's *current* values every time the
  // dialog opens (not just on mount) -- otherwise reopening after a save
  // would show the pre-edit values again.
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setFoodItemId(
        submission.foodRoundMenuItemId != null ? String(submission.foodRoundMenuItemId) : "",
      );
      setFoodItemError(null);
      setFoodNote(submission.foodNote ?? "");
      setDrinkItemId(
        submission.drinkRoundMenuItemId != null ? String(submission.drinkRoundMenuItemId) : "",
      );
      setDrinkNote(submission.drinkNote ?? "");
    }
    setOpen(nextOpen);
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    const foodValid = foodItemId !== "";
    setFoodItemError(foodValid ? null : "Please select a food item.");
    if (!foodValid) return;

    updateSubmission.mutate(
      {
        submissionId: submission.id,
        foodRoundMenuItemId: Number(foodItemId),
        foodNote: foodNote.trim() || undefined,
        drinkRoundMenuItemId: drinkItemId ? Number(drinkItemId) : undefined,
        drinkNote: drinkItemId && drinkNote.trim() ? drinkNote.trim() : undefined,
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit submission">
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit submission</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label>Employee</Label>
            <p className="text-sm">{submission.employeeName}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-submission-food-item">
              Food item <span className="text-destructive">*</span>
            </Label>
            <select
              id="edit-submission-food-item"
              className={selectClassName}
              value={foodItemId}
              onChange={(e) => {
                setFoodItemId(e.target.value);
                setFoodItemError(null);
              }}
              aria-invalid={foodItemError !== null}
            >
              <option value="">Select a food item</option>
              {foodOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {foodItemError && <p className="text-sm text-destructive">{foodItemError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-submission-food-note">Food note</Label>
            <Input
              id="edit-submission-food-note"
              value={foodNote}
              onChange={(e) => setFoodNote(e.target.value)}
            />
          </div>
          {round.drinkRestaurantId != null && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-submission-drink-item">Drink item</Label>
                <select
                  id="edit-submission-drink-item"
                  className={selectClassName}
                  value={drinkItemId}
                  onChange={(e) => setDrinkItemId(e.target.value)}
                >
                  <option value="">None</option>
                  {drinkOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-submission-drink-note">Drink note</Label>
                <Input
                  id="edit-submission-drink-note"
                  value={drinkNote}
                  onChange={(e) => setDrinkNote(e.target.value)}
                  disabled={!drinkItemId}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button type="submit" disabled={updateSubmission.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Round.deadline is a UTC ISO string; a datetime-local input wants the
// equivalent local-time string. Naive slicing of the ISO string would show
// the UTC wall-clock time instead of the browser's local one.
function toDatetimeLocalValue(isoDeadline: string): string {
  const date = new Date(isoDeadline);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EditRoundForm({
  round,
  restaurants,
}: {
  round: Round;
  restaurants: Restaurant[] | undefined;
}) {
  const updateRound = useUpdateRound(round.id);
  const deadline = useRequiredField("Deadline is required.", toDatetimeLocalValue(round.deadline));
  const [foodRestaurantId, setFoodRestaurantId] = useState(String(round.foodRestaurantId));
  const [foodRestaurantError, setFoodRestaurantError] = useState<string | null>(null);
  const [drinkRestaurantId, setDrinkRestaurantId] = useState(
    round.drinkRestaurantId != null ? String(round.drinkRestaurantId) : "",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const foodRestaurants = (restaurants ?? []).filter((restaurant) => restaurant.type === "food");
  const drinkRestaurants = (restaurants ?? []).filter((restaurant) => restaurant.type === "drink");

  function buildInput() {
    return {
      deadline: new Date(deadline.value).toISOString(),
      foodRestaurantId: Number(foodRestaurantId),
      drinkRestaurantId: drinkRestaurantId ? Number(drinkRestaurantId) : undefined,
    };
  }

  function restaurantsChanged() {
    const newDrinkRestaurantId = drinkRestaurantId ? Number(drinkRestaurantId) : null;
    return (
      Number(foodRestaurantId) !== round.foodRestaurantId ||
      newDrinkRestaurantId !== round.drinkRestaurantId
    );
  }

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const deadlineValid = deadline.validate();

    const foodValid = foodRestaurantId !== "";
    setFoodRestaurantError(foodValid ? null : "Food restaurant is required.");

    if (!deadlineValid || !foodValid) return;

    if (restaurantsChanged()) {
      setConfirmOpen(true);
      return;
    }
    updateRound.mutate(buildInput());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit round</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-round-food-restaurant">
              Food restaurant <span className="text-destructive">*</span>
            </Label>
            <select
              id="edit-round-food-restaurant"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
              value={foodRestaurantId}
              onChange={(e) => {
                setFoodRestaurantId(e.target.value);
                setFoodRestaurantError(null);
              }}
              aria-invalid={foodRestaurantError !== null}
            >
              <option value="">Select a food restaurant</option>
              {foodRestaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
            {foodRestaurantError && (
              <p className="text-sm text-destructive">{foodRestaurantError}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-round-drink-restaurant">Drink restaurant</Label>
            <select
              id="edit-round-drink-restaurant"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={drinkRestaurantId}
              onChange={(e) => setDrinkRestaurantId(e.target.value)}
            >
              <option value="">None</option>
              {drinkRestaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-round-deadline">
              Deadline <span className="text-destructive">*</span>
            </Label>
            <Input id="edit-round-deadline" type="datetime-local" {...deadline.inputProps} />
            {deadline.error && <p className="text-sm text-destructive">{deadline.error}</p>}
          </div>
          <Button type="submit" disabled={updateRound.isPending} className="self-start">
            Save changes
          </Button>
        </form>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change restaurant?</AlertDialogTitle>
            <AlertDialogDescription>
              Curated items for the changed side will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                updateRound.mutate(buildInput());
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CollapseToggle({ open, label }: { open: boolean; label: string }) {
  return (
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
      >
        <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} aria-hidden="true" />
      </Button>
    </CollapsibleTrigger>
  );
}

export function RoundDetail() {
  const { id } = useParams<{ id: string }>();
  const roundId = Number(id);
  const navigate = useNavigate();
  const [foodItemsOpen, setFoodItemsOpen] = useState(false);
  const [drinkItemsOpen, setDrinkItemsOpen] = useState(false);

  const { data: round, isPending: roundPending } = useRound(roundId);
  const { data: restaurants } = useRestaurants();
  const { data: curated } = useRoundMenuItems(roundId);
  const { data: submissions } = useRoundSubmissions(roundId);
  const addItem = useAddRoundMenuItem(roundId);
  const removeItem = useRemoveRoundMenuItem(roundId);
  const updateStatus = useUpdateRoundStatus(roundId);
  const deleteRound = useDeleteRound();

  const { data: foodItems, isPending: foodPending } = useMenuItems(
    round?.foodRestaurantId ?? 0,
    true,
  );
  const { data: drinkItems, isPending: drinkPending } = useMenuItems(
    round?.drinkRestaurantId ?? 0,
    true,
  );
  // Separate (activeOnly: false) query-cache entries from the checklist
  // fetches above -- a submission referencing a since-deactivated item still
  // needs to resolve to a name in the edit dialog's options.
  const { data: allFoodItems } = useMenuItems(round?.foodRestaurantId ?? 0, false);
  const { data: allDrinkItems } = useMenuItems(round?.drinkRestaurantId ?? 0, false);
  const updateSubmission = useUpdateRoundSubmission(roundId);

  if (roundPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading round…</p>;
  }

  if (!round) {
    return <p className="p-6 text-sm text-destructive">Round not found.</p>;
  }

  const restaurantName = (id: number) =>
    restaurants?.find((restaurant) => restaurant.id === id)?.name ?? `#${id}`;

  const curatedByMenuItemId = new Map((curated ?? []).map((item) => [item.menuItemId, item]));

  // The round's own curated items, not the full restaurant menu -- an edit
  // can only pick from what the round was actually built from.
  function curatedOptions(items: MenuItem[] | undefined): SubmissionOption[] {
    return (items ?? []).flatMap((item) => {
      const curatedItem = curatedByMenuItemId.get(item.id);
      return curatedItem ? [{ id: curatedItem.id, name: item.name }] : [];
    });
  }
  const foodOptions = curatedOptions(allFoodItems);
  const drinkOptions = curatedOptions(allDrinkItems);

  function toggleItem(menuItemId: number, checked: boolean) {
    if (checked) {
      addItem.mutate(menuItemId);
      return;
    }
    const curatedItem = curatedByMenuItemId.get(menuItemId);
    if (curatedItem) {
      removeItem.mutate(curatedItem.id);
    }
  }

  const isDraft = round.status === "draft";

  function renderMenuItemList(items: MenuItem[] | undefined, isPending: boolean) {
    if (isPending) {
      return <p className="text-sm text-muted-foreground">Loading menu items…</p>;
    }
    if (!items || items.length === 0) {
      return <p className="text-sm text-muted-foreground">No active menu items.</p>;
    }
    return (
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
            <input
              type="checkbox"
              id={`round-menu-item-${item.id}`}
              className="size-4 rounded-sm border-input accent-primary"
              checked={curatedByMenuItemId.has(item.id)}
              disabled={!isDraft}
              onChange={(e) => toggleItem(item.id, e.target.checked)}
            />
            <Label htmlFor={`round-menu-item-${item.id}`}>{item.name}</Label>
          </li>
        ))}
      </ul>
    );
  }

  function handleExportCsv() {
    if (!submissions || submissions.length === 0) return;
    const rows = submissions.map((s) => [
      s.employeeName,
      s.foodName,
      s.foodNote,
      s.drinkName,
      s.drinkNote,
    ]);
    downloadCsv(`round-${roundId}-submissions.csv`, toCsv(SUBMISSION_COLUMNS, rows));
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <Link
          to="/admin/rounds"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          All rounds
        </Link>
        <div className="mt-1 flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{round.label}</h1>
          <RoundStatusBadge status={round.status} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => copyRoundShareLink(round.id)}
              >
                <Share aria-hidden="true" />
                <span className="sr-only">Copy share link</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy share link</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {round.status === "draft" && (
              <Button
                type="button"
                onClick={() => updateStatus.mutate("open")}
                disabled={updateStatus.isPending}
              >
                Open
              </Button>
            )}
            {round.status === "open" && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => updateStatus.mutate("closed")}
                disabled={updateStatus.isPending}
              >
                Close
              </Button>
            )}
            {round.status === "open" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive" disabled={updateStatus.isPending}>
                    Revert to draft
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revert to draft?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This round will disappear from the public page and stop accepting
                      submissions until it's reopened.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => updateStatus.mutate("draft")}
                    >
                      Revert round
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {round.status === "closed" && (
              <p className="text-sm text-muted-foreground">This round is closed.</p>
            )}
            {round.status === "draft" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this round?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() =>
                        deleteRound.mutate(round.id, {
                          onSuccess: () => navigate("/admin/rounds"),
                        })
                      }
                    >
                      Delete round
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      {round.status === "draft" && (
        <EditRoundForm key={round.id} round={round} restaurants={restaurants} />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className={round.drinkRestaurantId == null ? "sm:col-span-2" : undefined}>
          <Collapsible open={foodItemsOpen} onOpenChange={setFoodItemsOpen}>
            <CardHeader>
              <CardTitle>Food items — {restaurantName(round.foodRestaurantId)}</CardTitle>
              <CardAction>
                <CollapseToggle open={foodItemsOpen} label="food items" />
              </CardAction>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>{renderMenuItemList(foodItems, foodPending)}</CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {round.drinkRestaurantId != null && (
          <Card>
            <Collapsible open={drinkItemsOpen} onOpenChange={setDrinkItemsOpen}>
              <CardHeader>
                <CardTitle>Drink items — {restaurantName(round.drinkRestaurantId)}</CardTitle>
                <CardAction>
                  <CollapseToggle open={drinkItemsOpen} label="drink items" />
                </CardAction>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>{renderMenuItemList(drinkItems, drinkPending)}</CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
          {submissions && submissions.length > 0 && (
            <CardAction>
              <Button type="button" variant="outline" onClick={handleExportCsv}>
                Export CSV
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <SubmissionsTable
            submissions={submissions}
            renderActions={(submission) => (
              <SubmissionEditDialog
                round={round}
                submission={submission}
                foodOptions={foodOptions}
                drinkOptions={drinkOptions}
                updateSubmission={updateSubmission}
              />
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
