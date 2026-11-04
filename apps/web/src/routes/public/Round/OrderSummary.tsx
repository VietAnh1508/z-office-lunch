import { cn } from "@/lib/utils";

type Row = { label: string; value: string | null; note?: string };

// Live "your order" card — fills in as the user moves through the steps.
export function OrderSummary({
  rows,
  className,
}: {
  rows: Row[];
  className?: string;
}) {
  return (
    <div
      aria-label="Your order"
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-muted/50 p-4 ring-1 ring-foreground/10",
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Your order
      </p>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{row.label}</span>
          {/* key on the value so a change replays the entrance animation */}
          <span
            key={row.value ?? "empty"}
            className={cn(
              "text-sm",
              row.value
                ? "font-medium animate-in fade-in slide-in-from-bottom-1 duration-300"
                : "text-muted-foreground/60",
            )}
          >
            {row.value ?? "—"}
          </span>
          {row.value && row.note && (
            <span className="text-xs text-muted-foreground">{row.note}</span>
          )}
        </div>
      ))}
    </div>
  );
}
