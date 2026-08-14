import { Outlet } from "react-router";
import { AppHeader } from "@/components/AppHeader";

// Public pages have no nav menu (no auth, nothing employee-facing to link to) —
// AppHeader without a `nav` slot still renders at the same height as AdminLayout's.
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
