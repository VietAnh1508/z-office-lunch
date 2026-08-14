import { UtensilsCrossed } from "lucide-react";
import { Link, Outlet } from "react-router";

// Public pages have no nav menu (no auth, nothing employee-facing to link to) —
// this header exists purely so the app's identity is visible, matching AdminLayout's
// brand mark without its section links.
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-heading text-sm font-semibold tracking-tight text-foreground"
          >
            <UtensilsCrossed className="size-4 text-primary" aria-hidden="true" />
            Office Lunch
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
