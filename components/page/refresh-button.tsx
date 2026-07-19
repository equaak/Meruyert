"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--text-dim)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text)]",
        pending && "opacity-60",
      )}
    >
      <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
      Обновить
    </button>
  );
}
