import { UtensilsCrossed } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

// Shared by AdminLayout and PublicLayout so both routes render the exact same
// header height/padding regardless of whether a `nav` slot is passed in —
// don't fork this per-layout, it's how the two stay visually in sync.
export function AppHeader({ nav }: { nav?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-9 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-heading text-sm font-semibold tracking-tight text-foreground"
        >
          <UtensilsCrossed className="size-4 text-primary" aria-hidden="true" />
          Office Lunch
        </Link>
        {nav}
      </div>
    </header>
  );
}
