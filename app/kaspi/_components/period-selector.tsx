"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: 1,  label: "Сегодня" },
  { value: 7,  label: "7 дн" },
  { value: 14, label: "14 дн" },
  { value: 30, label: "Месяц" },
  { value: 60, label: "60 дн" },
  { value: 90, label: "90 дн" },
  { value: 730, label: "Всё время" },
];

export function KaspiPeriodSelector({
  value,
  from = "",
  to = "",
}: {
  value: number;
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  const setDays = (days: number) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("days", String(days));
    sp.delete("from");
    sp.delete("to");
    start(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  };

  const applyRange = () => {
    if (!fromDate || !toDate || fromDate > toDate) return;
    const sp = new URLSearchParams();
    sp.set("from", fromDate);
    sp.set("to", toDate);
    start(() => router.replace(`?${sp.toString()}`, { scroll: false }));
  };

  // Max date = today (Kazakhstan time approximated as UTC+5)
  const maxDate = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-60")}>
      {/* Quick buttons */}
      <div className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            disabled={pending}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-[11.5px] font-medium tabular transition-colors",
              value === opt.value
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-dim)] hover:bg-white/[0.04] hover:text-[var(--text)]",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Date range picker */}
      <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
        <input
          type="date"
          value={fromDate}
          max={maxDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="bg-transparent text-[11.5px] text-[var(--text)] outline-none tabular"
        />
        <span className="text-[11px] text-[var(--text-subtle)]">—</span>
        <input
          type="date"
          value={toDate}
          max={maxDate}
          onChange={(e) => setToDate(e.target.value)}
          className="bg-transparent text-[11.5px] text-[var(--text)] outline-none tabular"
        />
        <button
          onClick={applyRange}
          disabled={pending || !fromDate || !toDate || fromDate > toDate}
          className={cn(
            "ml-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            fromDate && toDate && fromDate <= toDate
              ? "bg-[var(--accent)] text-white hover:opacity-90"
              : "cursor-not-allowed text-[var(--text-subtle)]",
          )}
        >
          →
        </button>
      </div>
    </div>
  );
}
