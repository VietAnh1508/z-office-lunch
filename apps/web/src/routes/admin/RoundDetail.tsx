import { ArrowLeft } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RoundStatusBadge } from "./RoundStatusBadge";
import type { MenuItem } from "./useMenuItems";
import { useMenuItems } from "./useMenuItems";
import { useRestaurants } from "./useRestaurants";
import {
  useAddRoundMenuItem,
  useRemoveRoundMenuItem,
  useRoundMenuItems,
} from "./useRoundMenuItems";
import { useDeleteRound, useRound, useUpdateRoundStatus } from "./useRounds";

export function RoundDetail() {
  const { id } = useParams<{ id: string }>();
  const roundId = Number(id);
  const navigate = useNavigate();

  const { data: round, isPending: roundPending } = useRound(roundId);
  const { data: restaurants } = useRestaurants();
  const { data: curated } = useRoundMenuItems(roundId);
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

  if (roundPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading round…</p>;
  }

  if (!round) {
    return <p className="p-6 text-sm text-destructive">Round not found.</p>;
  }

  const restaurantName = (id: number) =>
    restaurants?.find((restaurant) => restaurant.id === id)?.name ?? `#${id}`;

  const curatedByMenuItemId = new Map((curated ?? []).map((item) => [item.menuItemId, item]));

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
              onChange={(e) => toggleItem(item.id, e.target.checked)}
            />
            <Label htmlFor={`round-menu-item-${item.id}`}>{item.name}</Label>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
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

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className={round.drinkRestaurantId == null ? "sm:col-span-2" : undefined}>
          <CardHeader>
            <CardTitle>Food items — {restaurantName(round.foodRestaurantId)}</CardTitle>
          </CardHeader>
          <CardContent>{renderMenuItemList(foodItems, foodPending)}</CardContent>
        </Card>

        {round.drinkRestaurantId != null && (
          <Card>
            <CardHeader>
              <CardTitle>Drink items — {restaurantName(round.drinkRestaurantId)}</CardTitle>
            </CardHeader>
            <CardContent>{renderMenuItemList(drinkItems, drinkPending)}</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
