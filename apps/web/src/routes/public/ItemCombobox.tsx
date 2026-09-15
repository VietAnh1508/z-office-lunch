import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ComboboxItem = {
  id: number;
  name: string;
};

export function ItemCombobox({
  id,
  label,
  required,
  items,
  value,
  onChange,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  required?: boolean;
  items: ComboboxItem[];
  value: number | null;
  onChange: (id: number | null) => void;
  error: string | null;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const selected = sorted.find((item) => item.id === value) ?? null;
  const filtered =
    query.trim() === ""
      ? sorted
      : sorted.filter((item) =>
          item.name.toLowerCase().includes(query.trim().toLowerCase()),
        );

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
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
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-invalid={error !== null}
          autoComplete="off"
          placeholder={placeholder}
          value={selected ? selected.name : query}
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
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  className="w-full px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(item.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {item.name}
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
