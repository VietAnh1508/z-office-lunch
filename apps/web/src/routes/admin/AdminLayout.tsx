import { type SubmitEvent } from "react";
import { toast } from "sonner";
import { NavLink, Outlet } from "react-router";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminGate } from "@/hooks/useAdminGate";
import { useRequiredField } from "@/hooks/useRequiredField";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { to: "/admin/restaurants", label: "Restaurants" },
  { to: "/admin/employees", label: "Employees" },
  { to: "/admin/rounds", label: "Rounds" },
];

function AdminPasswordGate({ onSubmit }: { onSubmit: (password: string) => boolean }) {
  const password = useRequiredField("Password is required.");

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password.validate()) return;
    if (!onSubmit(password.value)) {
      toast.error("Incorrect password.");
      return;
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-xs flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-gate-password">Password</Label>
          <Input
            id="admin-gate-password"
            type="password"
            autoFocus
            {...password.inputProps}
          />
          {password.error && (
            <p className="text-sm text-destructive">{password.error}</p>
          )}
        </div>
        <Button type="submit">Unlock</Button>
      </form>
    </div>
  );
}

export function AdminLayout() {
  const { unlocked, tryUnlock } = useAdminGate();

  if (!unlocked) {
    return <AdminPasswordGate onSubmit={tryUnlock} />;
  }

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
