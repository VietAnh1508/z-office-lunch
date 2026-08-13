import { UtensilsCrossed } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/admin/restaurants", label: "Restaurants" },
  { to: "/admin/employees", label: "Employees" },
  { to: "/admin/rounds", label: "Rounds" },
];

export function AdminLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2 font-heading text-sm font-semibold tracking-tight text-foreground"
          >
            <UtensilsCrossed className="size-4 text-primary" aria-hidden="true" />
            Office Lunch
          </Link>
          <nav
            aria-label="Admin sections"
            className="-mx-2 flex items-center gap-1 overflow-x-auto text-sm"
          >
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    isActive && "bg-secondary text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
