import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";
import { MenuImage, menuImageSrc } from "./MenuImage";
import type { PublicRoundRestaurant } from "../usePublicRound";

export function MenuPanelCard({
  restaurant,
}: {
  restaurant: PublicRoundRestaurant;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu {restaurant.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <MenuImage restaurant={restaurant} />
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="View full size"
                className="absolute top-2 right-2 bg-background/80"
              >
                <Maximize2 />
              </Button>
            </DialogTrigger>
            <DialogContent className="w-auto max-w-none border-none bg-transparent p-0 shadow-none ring-0">
              <DialogTitle className="sr-only">
                {restaurant.name} menu
              </DialogTitle>
              <img
                src={menuImageSrc(restaurant)}
                alt={`${restaurant.name} menu`}
                className="h-[90vh] w-[90vw] rounded-lg object-contain"
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
