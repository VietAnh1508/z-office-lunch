import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

export type Employee = {
  id: number;
  fullName: string;
  active: boolean;
};

type CreateEmployeeInput = {
  fullName: string;
};

export const employeeKeys = {
  all: ["employees"] as const,
  list: () => [...employeeKeys.all, "list"] as const,
};

export function useEmployees() {
  return useQuery({
    queryKey: employeeKeys.list(),
    queryFn: () => api.get<Employee[]>("/employees"),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => api.post<Employee>("/employees", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.list() });
      toast.success("Employee added");
    },
    onError: (error) => toastApiError(error, "Could not create employee."),
  });
}

export function useToggleEmployeeActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.patch<Employee>(`/employees/${id}`),
    onSuccess: (employee) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.list() });
      toast.success(employee.active ? "Employee activated" : "Employee deactivated");
    },
    onError: (error) => toastApiError(error, "Could not update employee."),
  });
}

export function useUpdateEmployeeName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: number; fullName: string }) =>
      api.patch<Employee>(`/employees/${input.id}/name`, { fullName: input.fullName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.list() });
      toast.success("Employee updated");
    },
    onError: (error) => toastApiError(error, "Could not update employee."),
  });
}
