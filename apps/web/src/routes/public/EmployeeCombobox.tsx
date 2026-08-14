import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ComboboxEmployee = {
  id: number;
  fullName: string;
};

export function EmployeeCombobox({
  employees,
  value,
  onChange,
  error,
}: {
  employees: ComboboxEmployee[];
  value: number | null;
  onChange: (id: number | null) => void;
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = employees.find((employee) => employee.id === value) ?? null;
  const filtered =
    query.trim() === ""
      ? employees
      : employees.filter((employee) =>
          employee.fullName.toLowerCase().includes(query.trim().toLowerCase()),
        );

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="submission-employee">
        Your name <span className="text-destructive">*</span>
      </Label>
      <div
        className="relative"
        onBlur={(e) => {
          // Closing on the input's own blur would fire before a click on an
          // option registers — only close once focus actually leaves this
          // whole combobox (wrapper + input + listbox), not when it moves
          // from the input to an option inside it.
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setOpen(false);
          }
        }}
      >
        <Input
          id="submission-employee"
          role="combobox"
          aria-expanded={open}
          aria-invalid={error !== null}
          autoComplete="off"
          placeholder="Search your name…"
          value={selected ? selected.fullName : query}
          onChange={(e) => {
            onChange(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && filtered.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-input bg-popover py-1 shadow-md"
          >
            {filtered.map((employee) => (
              <li key={employee.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={employee.id === value}
                  className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(employee.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {employee.fullName}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
