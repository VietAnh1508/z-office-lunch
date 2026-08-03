import { Route, Routes } from "react-router";
import { Button } from "@/components/ui/button";
import { AdminLayout } from "@/routes/admin/AdminLayout";
import { AdminOverview } from "@/routes/admin/AdminOverview";
import { Employees } from "@/routes/admin/Employees";
import { Restaurants } from "@/routes/admin/Restaurants";
import { Rounds } from "@/routes/admin/Rounds";

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
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminOverview />} />
        <Route path="restaurants" element={<Restaurants />} />
        <Route path="employees" element={<Employees />} />
        <Route path="rounds" element={<Rounds />} />
      </Route>
    </Routes>
  );
}

export default App;
