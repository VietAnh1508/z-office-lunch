import { Label } from "@/components/ui/label";
import { useSizePresets } from "./useSizePresets";

// Native select of "None" + every size preset, e.g. "Cups (S / M / L)".
export function SizePresetSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const { data: presets } = useSizePresets();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Size preset</Label>
      <select
        id={id}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">None</option>
        {presets?.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name} ({preset.options.map((o) => o.label).join(" / ")})
          </option>
        ))}
      </select>
    </div>
  );
}
