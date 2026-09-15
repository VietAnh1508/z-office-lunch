import { toast } from "sonner";

export function getRoundShareUrl(roundId: number): string {
  return `${window.location.origin}/r/${roundId}`;
}

export async function copyRoundShareLink(roundId: number): Promise<void> {
  try {
    await navigator.clipboard.writeText(getRoundShareUrl(roundId));
    toast.success("Link copied to clipboard");
  } catch {
    toast.error("Could not copy link");
  }
}
