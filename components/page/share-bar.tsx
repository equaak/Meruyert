import { cn } from "@/lib/utils";

/**
 * Horizontal progress bar showing 0..1 share inline next to numbers.
 * Used in tables (cashier share, product share, etc.) to give the eye a
 * visual ranking on top of the tabular data.
 */
export function ShareBar({
  value,
  color = "var(--accent)",
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-white/[0.06]", className)}>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
