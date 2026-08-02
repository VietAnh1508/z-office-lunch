import { Route, Routes } from "react-router";
import { Button } from "@/components/ui/button";
import { Restaurants } from "@/routes/admin/Restaurants";

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
      <Route path="/admin" element={<Restaurants />} />
    </Routes>
  );
}

export default App;
