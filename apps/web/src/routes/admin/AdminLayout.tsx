import { NavLink, Outlet } from "react-router";
import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/admin/restaurants", label: "Restaurants" },
  { to: "/admin/employees", label: "Employees" },
  { to: "/admin/rounds", label: "Rounds" },
];

export function AdminLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader
        nav={
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
        }
      />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
