import { CircleCheck, CircleX, Pencil } from "lucide-react";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRequiredField } from "@/hooks/useRequiredField";
import {
  type Employee,
  useCreateEmployee,
  useEmployees,
  useToggleEmployeeActive,
  useUpdateEmployeeName,
} from "./useEmployees";

function EmployeeRow({ employee }: { employee: Employee }) {
  const [isEditing, setIsEditing] = useState(false);
  const toggleActive = useToggleEmployeeActive();
  const updateName = useUpdateEmployeeName();
  const fullName = useRequiredField("Full name is required.", employee.fullName);

  function handleSave() {
    if (!fullName.validate()) return;
    updateName.mutate(
      { id: employee.id, fullName: fullName.value },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleCancel() {
    fullName.reset();
    setIsEditing(false);
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
      {isEditing ? (
        <div className="flex flex-1 flex-col gap-1.5">
          <Input {...fullName.inputProps} aria-label="Full name" />
          {fullName.error && <p className="text-sm text-destructive">{fullName.error}</p>}
        </div>
      ) : (
        <span className={!employee.active ? "text-muted-foreground line-through" : undefined}>
          {employee.fullName}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {isEditing ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={updateName.isPending}
            >
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit name"
            onClick={() => setIsEditing(true)}
          >
            <Pencil />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={employee.active ? "Deactivate" : "Activate"}
          onClick={() => toggleActive.mutate(employee.id)}
          disabled={toggleActive.isPending}
          className={
            employee.active
              ? "text-emerald-600 hover:opacity-80 dark:text-emerald-400"
              : "text-muted-foreground hover:opacity-80"
          }
        >
          {employee.active ? <CircleCheck /> : <CircleX />}
        </Button>
      </div>
    </li>
  );
}

export function Employees() {
  const { data: employees, isPending, isError } = useEmployees();
  const createEmployee = useCreateEmployee();

  const fullName = useRequiredField("Full name is required.");

  function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fullName.validate()) return;
    createEmployee.mutate(
      { fullName: fullName.value },
      {
        onSuccess: () => {
          fullName.reset();
        },
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Add employee</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="employee-full-name">
                  Full name <span className="text-destructive">*</span>
                </Label>
                <Input id="employee-full-name" {...fullName.inputProps} />
                {fullName.error && <p className="text-sm text-destructive">{fullName.error}</p>}
              </div>
              <Button type="submit" disabled={createEmployee.isPending}>
                Add employee
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading employees…</p>
            ) : isError && !employees ? (
              <p className="text-sm text-destructive">Could not load employees.</p>
            ) : (
              <>
                {isError && (
                  <p className="mb-2 text-sm text-destructive">Could not refresh employees.</p>
                )}
                {employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No employees yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {employees.map((employee) => (
                      <EmployeeRow key={employee.id} employee={employee} />
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
