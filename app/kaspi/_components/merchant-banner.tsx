import { Building2, ShieldCheck } from "lucide-react";
import type { KaspiConfig } from "@/lib/kaspi-live";

/**
 * Always-visible banner across Kaspi pages. Makes it obvious WHICH merchant
 * we're querying, so the user can verify scoping without poking around.
 */
export function MerchantBanner({ config }: { config: KaspiConfig }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11.5px]">
      <div className="flex items-center gap-2 text-[var(--text-dim)]">
        <Building2 className="h-3.5 w-3.5 text-[var(--text-subtle)]" />
        <span>Магазин:</span>
        <span className="font-medium text-[var(--text)]">{config.merchantName || "—"}</span>
        <span className="text-[var(--text-subtle)]">·</span>
        <span>ID:</span>
        <code className="font-mono text-[var(--text)]">{config.merchantId || "не задан"}</code>
      </div>
      <div className="flex items-center gap-1.5 text-[var(--text-dim)]">
        <ShieldCheck className="h-3 w-3 text-[var(--emerald)]" />
        <span>Скоуп: X-Auth-Token + X-Merchant-Uid header</span>
      </div>
    </div>
  );
}
