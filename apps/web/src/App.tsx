import { Route, Routes } from "react-router";
import { AdminLayout } from "@/routes/admin/AdminLayout";
import { AdminOverview } from "@/routes/admin/AdminOverview";
import { Employees } from "@/routes/admin/Employees";
import { RestaurantDetail } from "@/routes/admin/RestaurantDetail";
import { Restaurants } from "@/routes/admin/Restaurants";
import { RoundDetail } from "@/routes/admin/RoundDetail";
import { Rounds } from "@/routes/admin/Rounds";
import { BrowseRounds } from "@/routes/public/BrowseRounds";
import { PublicLayout } from "@/routes/public/PublicLayout";
import { Round } from "@/routes/public/Round";

function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<BrowseRounds />} />
        <Route path="r/:roundId" element={<Round />} />
      </Route>
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
