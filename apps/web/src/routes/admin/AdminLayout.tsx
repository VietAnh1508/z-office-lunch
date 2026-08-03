import { NavLink, Outlet } from "react-router";

const NAV_LINKS = [
  { to: "/admin/restaurants", label: "Restaurants" },
  { to: "/admin/employees", label: "Employees" },
  { to: "/admin/rounds", label: "Rounds" },
];

export function AdminLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <nav className="flex gap-4 border-b p-4">
        {NAV_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
