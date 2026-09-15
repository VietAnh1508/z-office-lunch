import { useState } from "react";

const STORAGE_KEY = "admin-unlocked";

export function useAdminGate() {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(STORAGE_KEY) === "true",
  );

  function tryUnlock(password: string): boolean {
    if (password === import.meta.env.VITE_ADMIN_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setUnlocked(true);
      return true;
    }
    return false;
  }

  return { unlocked, tryUnlock };
}
