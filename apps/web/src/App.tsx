import { Route, Routes } from "react-router";
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
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Button>Office Lunch</Button>
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
