import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";

export type PickerOption = { id: number; label: string };

// Tap-to-select list with a search box on top. Replaces the dropdown
// comboboxes for the stepper flow — the options are always visible.
export function PickerList({
  label,
  options,
  value,
  onSelect,
  placeholder,
  columns = false,
}: {
  label: string;
  options: PickerOption[];
  value: number | null;
  onSelect: (id: number) => void;
  placeholder: string;
  columns?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = (
    q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  )
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <ul
        role="listbox"
        aria-label={label}
        className={cn(
          "grid max-h-80 gap-2 overflow-auto p-0.5",
          columns && "sm:grid-cols-2",
        )}
      >
        {filtered.map((o) => {
          const selected = o.id === value;
          return (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(o.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm ring-1 ring-foreground/10 transition-all duration-200 hover:bg-accent active:scale-[0.98]",
                  selected && "bg-primary/10 font-medium ring-2 ring-primary",
                )}
              >
                <span>{o.label}</span>
                {selected && (
                  <Check className="size-4 shrink-0 text-primary animate-in zoom-in-50 duration-200" />
                )}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-2 py-4 text-sm text-muted-foreground">
            No matches.
          </li>
        )}
      </ul>
    </div>
  );
}
