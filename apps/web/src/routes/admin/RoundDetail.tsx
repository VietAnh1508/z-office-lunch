import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { MenuItem } from "./useMenuItems";
import { useMenuItems } from "./useMenuItems";
import { useRestaurants } from "./useRestaurants";
import {
  useAddRoundMenuItem,
  useRemoveRoundMenuItem,
  useRoundMenuItems,
} from "./useRoundMenuItems";
import { useRound, useUpdateRoundStatus } from "./useRounds";

export function RoundDetail() {
  const { id } = useParams<{ id: string }>();
  const roundId = Number(id);

  const { data: round, isPending: roundPending } = useRound(roundId);
  const { data: restaurants } = useRestaurants();
  const { data: curated } = useRoundMenuItems(roundId);
  const addItem = useAddRoundMenuItem(roundId);
  const removeItem = useRemoveRoundMenuItem(roundId);
  const updateStatus = useUpdateRoundStatus(roundId);

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
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id={`round-menu-item-${item.id}`}
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
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <Link to="/admin/rounds" className="text-sm text-muted-foreground underline">
          ← Rounds
        </Link>
        <div className="flex items-baseline gap-1">
          <h1 className="text-2xl font-semibold">{round.label}</h1>
          <span className="text-muted-foreground">({round.status})</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
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
  );
}
