import { toast } from "sonner";
import { ApiError } from "@/lib/api";

export function toastApiError(error: unknown, fallback: string) {
  toast.error(error instanceof ApiError ? error.message : fallback);
}
