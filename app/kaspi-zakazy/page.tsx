import { fetchKaspiDashboard, type KaspiOrder, KASPI_STATUS_LABELS, KASPI_STATUS_COLORS } from "@/lib/kaspi-live";
import { PageShell, Section } from "@/components/page/page-shell";
import { formatCompactMoney, formatNumber } from "@/lib/format";
import { KaspiPeriodSelector } from "@/app/kaspi/_components/period-selector";
import { RefreshButton } from "@/components/page/refresh-button";
import { MerchantBanner } from "@/app/kaspi/_components/merchant-banner";
import { KaspiEmptyState } from "@/app/kaspi/_components/empty-state";
import { cn } from "@/lib/utils";
import { Filter as FilterIcon } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_DAYS = new Set([1, 7, 14, 30, 60, 90]);
const ALLOWED_FILTERS = new Set(['all', 'completed', 'cancelled', 'returned', 'in_progress']);

export default async function KaspiOrdersPage({ searchParams }: { searchParams: Promise<{ days?: string; filter?: string }> }) {
  const sp = await searchParams;
  const parsed = sp.days ? Number(sp.days) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;
  const filter = ALLOWED_FILTERS.has(sp.filter || '') ? (sp.filter as string) : 'all';
  const data = await fetchKaspiDashboard(days);
  const orders = applyFilter(data.recentOrders, filter);

  return (
    <PageShell
      title="Kaspi · Заказы"
      subtitle={`${data.totalOrdersInPeriod} заказов за период · ${data.period.label}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterTabs current={filter} counts={getCounts(data.recentOrders)} days={days} />
        <div className="flex items-center gap-2">
          <KaspiPeriodSelector value={days} />
          <RefreshButton />
        </div>
      </div>
      <MerchantBanner config={data.config} />

      {data.totalOrdersInPeriod === 0 ? (
        <KaspiEmptyState days={days} config={data.config} />
      ) : (
        <Section title={`Заказы · ${orders.length}`}>
          <OrdersTable rows={orders} />
        </Section>
      )}
    </PageShell>
  );
}

function getCounts(rows: KaspiOrder[]) {
  return {
    all: rows.length,
    completed: rows.filter(o => o.status === 'COMPLETED').length,
    cancelled: rows.filter(o => o.status === 'CANCELLED' || o.status === 'CANCELLING').length,
    returned: rows.filter(o => o.status === 'RETURNED' || o.status === 'KASPI_DELIVERY_RETURN_REQUESTED').length,
    in_progress: rows.filter(o => o.status === 'APPROVED_BY_BANK' || o.status === 'ACCEPTED_BY_MERCHANT').length,
  };
}

function applyFilter(rows: KaspiOrder[], filter: string): KaspiOrder[] {
  if (filter === 'completed') return rows.filter(o => o.status === 'COMPLETED');
  if (filter === 'cancelled') return rows.filter(o => o.status === 'CANCELLED' || o.status === 'CANCELLING');
  if (filter === 'returned') return rows.filter(o => o.status === 'RETURNED' || o.status === 'KASPI_DELIVERY_RETURN_REQUESTED');
  if (filter === 'in_progress') return rows.filter(o => o.status === 'APPROVED_BY_BANK' || o.status === 'ACCEPTED_BY_MERCHANT');
  return rows;
}

function FilterTabs({ current, counts, days }: { current: string; counts: Record<string, number>; days: number }) {
  const tabs = [
    { value: 'all', label: 'Все', count: counts.all },
    { value: 'completed', label: 'Выполненные', count: counts.completed },
    { value: 'in_progress', label: 'В работе', count: counts.in_progress },
    { value: 'cancelled', label: 'Отменённые', count: counts.cancelled },
    { value: 'returned', label: 'Возвраты', count: counts.returned },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11.5px]">
      <FilterIcon className="h-3 w-3 text-[var(--text-subtle)]" />
      {tabs.map(t => (
        <Link
          key={t.value}
          href={`/kaspi-zakazy?days=${days}&filter=${t.value}`}
          className={cn(
            "rounded-md px-2 py-1 font-medium transition-colors tabular",
            current === t.value
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-dim)] hover:bg-white/[0.04] hover:text-[var(--text)]",
          )}
        >
          {t.label}<span className="ml-1 text-[10px] opacity-70">{formatNumber(t.count)}</span>
        </Link>
      ))}
    </div>
  );
}

function OrdersTable({ rows }: { rows: KaspiOrder[] }) {
  if (rows.length === 0) return <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[12px] text-[var(--text-dim)]">Нет заказов в этом срезе</div>;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full min-w-[860px] text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Код заказа</th>
            <th className="px-3 py-2 text-left font-medium">Дата</th>
            <th className="px-3 py-2 text-left font-medium">Статус</th>
            <th className="px-3 py-2 text-left font-medium">Состояние</th>
            <th className="px-3 py-2 text-left font-medium">Оплата</th>
            <th className="px-3 py-2 text-left font-medium">Доставка</th>
            <th className="px-3 py-2 text-left font-medium">Город</th>
            <th className="px-3 py-2 text-left font-medium">Клиент</th>
            <th className="px-3 py-2 text-right font-medium">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2 font-mono text-[11px]">{o.code}</td>
              <td className="px-3 py-2 text-[var(--text-dim)]">{new Date(o.date).toLocaleString("ru-RU")}</td>
              <td className="px-3 py-2">
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(0,0,0,0.04)', color: KASPI_STATUS_COLORS[o.status] || 'var(--text-dim)' }}>
                  {KASPI_STATUS_LABELS[o.status] || o.status}
                </span>
              </td>
              <td className="px-3 py-2 text-[var(--text-dim)] text-[11px]">{o.state}</td>
              <td className="px-3 py-2 text-[var(--text-dim)] text-[11px]">{o.paymentMode || '—'}</td>
              <td className="px-3 py-2 text-[var(--text-dim)] text-[11px]">{o.deliveryMode || '—'}</td>
              <td className="px-3 py-2 text-[var(--text-dim)]">{o.deliveryCity || '—'}</td>
              <td className="px-3 py-2 text-[var(--text-dim)] max-w-[140px] truncate">{o.customerName || '—'}</td>
              <td className="px-3 py-2 text-right font-medium">{formatCompactMoney(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
