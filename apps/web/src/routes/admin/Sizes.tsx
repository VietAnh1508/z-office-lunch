import { Pencil } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRequiredField } from "@/hooks/useRequiredField";
import {
  type SizeOption,
  type SizePreset,
  useCreateSizePreset,
  useDeleteSizePreset,
  useSizePresets,
  useUpdateSizePreset,
} from "./useSizePresets";

// One option per line (commas also split), blanks dropped.
function parseOptionLabels(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((label) => label.trim())
    .filter((label) => label !== "");
}

// Decides which existing option each edited line is, since the API only keeps
// an option if it is sent back with its id (anything else is deleted/re-added,
// which wipes its item ticks and submission sizes).
// 1. A line whose label matches an existing option keeps that option's id.
// 2. A line that matches nothing, sitting at the same position as an existing
//    option that no line matched, is a rename (e.g. a typo fix): keep that id.
//    Otherwise it is a new option.
function matchOptionIds(
  labels: string[],
  existing: SizeOption[],
): { id?: number; label: string }[] {
  const byLabel = new Map(existing.map((o) => [o.label, o.id]));
  const matchedIds = new Set(labels.flatMap((l) => (byLabel.has(l) ? [byLabel.get(l)!] : [])));
  return labels.map((label, index) => {
    const id = byLabel.get(label);
    if (id !== undefined) return { id, label };
    const sameSpot = existing[index];
    return sameSpot && !matchedIds.has(sameSpot.id) ? { id: sameSpot.id, label } : { label };
  });
}

function SizePresetRow({ preset }: { preset: SizePreset }) {
  const [isEditing, setIsEditing] = useState(false);
  const updatePreset = useUpdateSizePreset();
  const deletePreset = useDeleteSizePreset();
  const name = useRequiredField("Preset name is required.", preset.name);
  const options = useRequiredField(
    "Options are required.",
    preset.options.map((o) => o.label).join("\n"),
  );

  function handleSave() {
    const nameOk = name.validate();
    const optionsOk = options.validate();
    if (!nameOk || !optionsOk) return;
    updatePreset.mutate(
      {
        id: preset.id,
        name: name.value.trim(),
        options: matchOptionIds(parseOptionLabels(options.value), preset.options),
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleCancel() {
    name.reset();
    options.reset();
    setIsEditing(false);
  }

  return (
    <li className="flex items-start justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
      {isEditing ? (
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Input {...name.inputProps} aria-label="Preset name" />
            {name.error && <p className="text-sm text-destructive">{name.error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Textarea {...options.inputProps} aria-label="Options" rows={4} />
            {options.error && <p className="text-sm text-destructive">{options.error}</p>}
            <p className="text-xs text-muted-foreground">
              One option per line. Removing an option clears it from submissions in open rounds that
              use it.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{preset.name}</span>
          <span className="text-muted-foreground">
            {preset.options.map((o) => o.label).join(" / ")}
          </span>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {isEditing ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={updatePreset.isPending}
            >
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Edit preset"
              onClick={() => setIsEditing(true)}
            >
              <Pencil />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deletePreset.isPending}
                >
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this size preset?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cannot be undone. A preset that a restaurant uses cannot be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deletePreset.mutate(preset.id)}>
                    Delete preset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </li>
  );
}

export function Sizes() {
  const { data: presets, isPending, isError } = useSizePresets();
  const createPreset = useCreateSizePreset();

  const name = useRequiredField("Preset name is required.");
  const options = useRequiredField("Options are required.");

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const nameOk = name.validate();
    const optionsOk = options.validate();
    if (!nameOk || !optionsOk) return;
    createPreset.mutate(
      { name: name.value.trim(), options: parseOptionLabels(options.value) },
      {
        onSuccess: () => {
          name.reset();
          options.reset();
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sizes</h1>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Add size preset</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="size-preset-name">
                  Preset name <span className="text-destructive">*</span>
                </Label>
                <Input id="size-preset-name" {...name.inputProps} />
                {name.error && <p className="text-sm text-destructive">{name.error}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="size-preset-options">
                  Options <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="size-preset-options"
                  rows={4}
                  placeholder={"S\nM\nL"}
                  {...options.inputProps}
                />
                {options.error && <p className="text-sm text-destructive">{options.error}</p>}
                <p className="text-xs text-muted-foreground">One option per line.</p>
              </div>
              <Button type="submit" disabled={createPreset.isPending}>
                Add preset
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Size presets</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading size presets…</p>
            ) : isError && !presets ? (
              <p className="text-sm text-destructive">Could not load size presets.</p>
            ) : (
              <>
                {isError && (
                  <p className="mb-2 text-sm text-destructive">Could not refresh size presets.</p>
                )}
                {presets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No size presets yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {presets.map((preset) => (
                      <SizePresetRow key={preset.id} preset={preset} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
