import { ClipboardList, Store, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Deliberately not links: the nav bar just above already provides navigation
// to each section, and a second set of links with the same names would
// create duplicate, ambiguous accessible names on this page.
const SECTIONS = [
  {
    label: "Restaurants",
    description: "Add restaurants and curate the menu items they offer.",
    icon: Store,
  },
  {
    label: "Employees",
    description: "Keep the list of people who can order lunch up to date.",
    icon: Users,
  },
  {
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
          <Card key={section.label}>
            <CardHeader>
              <section.icon className="size-5 text-primary" aria-hidden="true" />
              <CardTitle className="mt-2">{section.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
