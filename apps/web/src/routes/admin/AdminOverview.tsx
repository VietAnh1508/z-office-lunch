import { ClipboardList, Store, Users } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// These share their accessible name with the nav bar's links to the same
// sections (both say "Restaurants", "Employees", "Rounds"). Tests that query
// nav links by role+name must scope to the nav landmark rather than the
// whole page — see AdminLayout.test.tsx and e2e/admin-nav.spec.ts.
const SECTIONS = [
  {
    to: "/admin/restaurants",
    label: "Restaurants",
    description: "Add restaurants and curate the menu items they offer.",
    icon: Store,
  },
  {
    to: "/admin/employees",
    label: "Employees",
    description: "Keep the list of people who can order lunch up to date.",
    icon: Users,
  },
  {
    to: "/admin/rounds",
    label: "Rounds",
    description: "Start a round, pick its menu, then open it for orders.",
    icon: ClipboardList,
  },
];

export function AdminOverview() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the restaurants, employees, and lunch rounds behind office lunch orders.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link key={section.to} to={section.to} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:ring-primary/20">
              <CardHeader>
                <section.icon className="size-5 text-primary" aria-hidden="true" />
                <CardTitle className="mt-2">{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
