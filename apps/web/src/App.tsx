import { UtensilsCrossed } from "lucide-react";
import { Route, Routes, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { AdminLayout } from "@/routes/admin/AdminLayout";
import { AdminOverview } from "@/routes/admin/AdminOverview";
import { Employees } from "@/routes/admin/Employees";
import { RestaurantDetail } from "@/routes/admin/RestaurantDetail";
import { Restaurants } from "@/routes/admin/Restaurants";
import { RoundDetail } from "@/routes/admin/RoundDetail";
import { Rounds } from "@/routes/admin/Rounds";
import { Round } from "@/routes/public/Round";

function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div
        className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <UtensilsCrossed className="size-7" />
      </div>
      <Button size="lg" className="px-6 text-base" onClick={() => navigate("/admin")}>
        Office Lunch
      </Button>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tap to open the admin dashboard and manage restaurants, employees, and lunch rounds.
      </p>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="r/:roundId" element={<Round />} />
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="restaurants" element={<Restaurants />} />
        <Route path="restaurants/:id" element={<RestaurantDetail />} />
        <Route path="employees" element={<Employees />} />
        <Route path="rounds" element={<Rounds />} />
        <Route path="rounds/:id" element={<RoundDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
