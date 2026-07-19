import { fetchKaspiDashboard, type KaspiTopCustomer } from "@/lib/kaspi-live";
import { PageShell, Section } from "@/components/page/page-shell";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import { KaspiPeriodSelector } from "@/app/kaspi/_components/period-selector";
import { RefreshButton } from "@/components/page/refresh-button";
import { MerchantBanner } from "@/app/kaspi/_components/merchant-banner";
import { KaspiEmptyState } from "@/app/kaspi/_components/empty-state";
import { ShareBar } from "@/components/page/share-bar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ALLOWED_DAYS = new Set([1, 7, 14, 30, 60, 90]);

export default async function KaspiCustomersPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const parsed = sp.days ? Number(sp.days) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;
  const data = await fetchKaspiDashboard(days);
  const repeatRate = data.totalCustomers > 0 ? data.repeatCustomers / data.totalCustomers : 0;

  return (
    <PageShell
      title="Kaspi · Клиенты"
      subtitle={`${data.totalCustomers} уникальных клиентов · ${data.period.label}`}
    >
      <div className="flex items-center justify-end gap-2">
        <KaspiPeriodSelector value={days} />
        <RefreshButton />
      </div>
      <MerchantBanner config={data.config} />

      {data.totalOrdersInPeriod === 0 ? (
        <KaspiEmptyState days={days} config={data.config} />
      ) : (
        <>
          <Section title="Сводка по клиентам">
            <div className="grid gap-3 md:grid-cols-3">
              <Tile label="Уникальных клиентов" value={formatNumber(data.totalCustomers)} hint="по имени" />
              <Tile label="С повторными заказами" value={formatNumber(data.repeatCustomers)} hint={`≥ 2 заказа`} />
              <Tile label="Доля повторных" value={formatPercent(repeatRate * 100)} hint="индикатор лояльности" />
            </div>
          </Section>

          <Section title={`Топ клиентов по выручке · ${data.topCustomers.length}`}>
            <TopCustomersTable rows={data.topCustomers} />
          </Section>
        </>
      )}
    </PageShell>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular leading-tight">{value}</div>
      <div className="mt-1 text-[11px] text-[var(--text-dim)]">{hint}</div>
    </div>
  );
}

function TopCustomersTable({ rows }: { rows: KaspiTopCustomer[] }) {
  if (rows.length === 0) return <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[12px] text-[var(--text-dim)]">Нет клиентов</div>;
  const maxRev = Math.max(...rows.map(r => r.revenue), 1);
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-10">#</th>
            <th className="px-3 py-2 text-left font-medium">Клиент</th>
            <th className="px-3 py-2 text-left font-medium">Город</th>
            <th className="px-3 py-2 text-right font-medium">Заказов</th>
            <th className="px-3 py-2 text-right font-medium">Выручка</th>
            <th className="px-3 py-2 text-left font-medium w-[20%]">Доля</th>
            <th className="px-3 py-2 text-right font-medium">Средний чек</th>
            <th className="px-3 py-2 text-right font-medium">Последний заказ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.name + i} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2 text-[var(--text-subtle)]">{i + 1}</td>
              <td className="px-3 py-2 max-w-[240px] truncate font-medium">{c.name}</td>
              <td className="px-3 py-2 text-[var(--text-dim)]">{c.city || '—'}</td>
              <td className="px-3 py-2 text-right">{c.orders}</td>
              <td className="px-3 py-2 text-right font-medium">{formatCompactMoney(c.revenue)}</td>
              <td className="px-3 py-2"><ShareBar value={c.revenue / maxRev} /></td>
              <td className="px-3 py-2 text-right">{formatCompactMoney(c.avgCheck)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-dim)]">{new Date(c.lastOrderDate).toLocaleDateString("ru-RU")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
