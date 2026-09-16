import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { toastApiError } from "@/lib/toast";

const STORAGE_KEY = "admin-unlocked";

export function useAdminGate() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === "true",
  );

  const verifyPassword = useMutation({
    mutationFn: (input: { password: string }) =>
      api.post<{ ok: true }>("/admin/verify-password", input),
    onSuccess: () => {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setUnlocked(true);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        toast.error("Incorrect password.");
        return;
      }
      toastApiError(error, "Could not verify password.");
    },
  });

  function tryUnlock(password: string) {
    verifyPassword.mutate({ password });
  }

  return { unlocked, tryUnlock, isUnlocking: verifyPassword.isPending };
}
