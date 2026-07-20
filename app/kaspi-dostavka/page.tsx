import { fetchKaspiDashboard, type KaspiDashboardData } from "@/lib/kaspi-live";
import { PageShell, Section } from "@/components/page/page-shell";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import { KaspiPeriodSelector } from "@/app/kaspi/_components/period-selector";
import { RefreshButton } from "@/components/page/refresh-button";
import { MerchantBanner } from "@/app/kaspi/_components/merchant-banner";
import { KaspiEmptyState } from "@/app/kaspi/_components/empty-state";
import { ShareBar } from "@/components/page/share-bar";
import { MapPin, Truck } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ALLOWED_DAYS = new Set([1, 7, 14, 30, 60, 90, 730]);

export default async function KaspiDeliveryPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const parsed = sp.days ? Number(sp.days) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;
  const data = await fetchKaspiDashboard(days);

  return (
    <PageShell
      title="Kaspi · Доставка"
      subtitle={`Способы доставки и города · ${data.period.label}`}
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
          <Section title="Типы доставки" hint="По выручке (только выполненные заказы)">
            <DeliveryTable data={data.byDelivery} />
          </Section>

          <Section title="Kaspi Доставка vs самостоятельная">
            <KaspiDeliveryShare data={data} />
          </Section>

          <Section title={`Города назначения · ${data.topCities.length}`} hint="Куда едут заказы (по выручке)">
            <CitiesTable data={data.topCities} />
          </Section>
        </>
      )}
    </PageShell>
  );
}

function DeliveryTable({ data }: { data: KaspiDashboardData['byDelivery'] }) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Тип доставки</th>
            <th className="px-3 py-2 text-right font-medium">Заказов</th>
            <th className="px-3 py-2 text-right font-medium">Выручка</th>
            <th className="px-3 py-2 text-left font-medium w-[40%]">Доля</th>
          </tr>
        </thead>
        <tbody>
          {data.map(d => (
            <tr key={d.deliveryMode} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2"><Truck className="mr-1 inline h-3 w-3 text-[var(--text-subtle)]" /><span className="font-medium">{d.label}</span> <span className="ml-1 text-[10px] text-[var(--text-subtle)] font-mono">{d.deliveryMode}</span></td>
              <td className="px-3 py-2 text-right">{formatNumber(d.count)}</td>
              <td className="px-3 py-2 text-right font-medium">{formatCompactMoney(d.revenue)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <ShareBar value={d.revenue / max} />
                  <span className="shrink-0 text-[11px] text-[var(--text-dim)]">{formatPercent(d.share * 100)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KaspiDeliveryShare({ data }: { data: KaspiDashboardData }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">Kaspi Доставка</div>
          <div className="mt-1 text-[28px] font-semibold tabular leading-none">{formatPercent(data.periodKpi.kaspiDeliveryShare * 100)}</div>
          <div className="mt-1 text-[11px] text-[var(--text-dim)]">от выполненных заказов</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">Самостоятельно</div>
          <div className="mt-1 text-[28px] font-semibold tabular leading-none text-[var(--text-dim)]">{formatPercent((1 - data.periodKpi.kaspiDeliveryShare) * 100)}</div>
          <div className="mt-1 text-[11px] text-[var(--text-dim)]">магазин везёт сам или самовывоз</div>
        </div>
      </div>
      <div className="mt-3"><ShareBar value={data.periodKpi.kaspiDeliveryShare} /></div>
    </div>
  );
}

function CitiesTable({ data }: { data: KaspiDashboardData['topCities'] }) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(...data.map(c => c.revenue), 1);
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-10">#</th>
            <th className="px-3 py-2 text-left font-medium">Город</th>
            <th className="px-3 py-2 text-right font-medium">Заказов</th>
            <th className="px-3 py-2 text-right font-medium">Выручка</th>
            <th className="px-3 py-2 text-left font-medium w-[35%]">Доля</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c, i) => (
            <tr key={c.city} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2 text-[var(--text-subtle)]">{i + 1}</td>
              <td className="px-3 py-2"><MapPin className="mr-1 inline h-3 w-3 text-[var(--text-subtle)]" />{c.city}</td>
              <td className="px-3 py-2 text-right">{formatNumber(c.orders)}</td>
              <td className="px-3 py-2 text-right font-medium">{formatCompactMoney(c.revenue)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <ShareBar value={c.revenue / max} />
                  <span className="shrink-0 text-[11px] text-[var(--text-dim)]">{formatPercent(c.share * 100)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[12px] text-[var(--text-dim)]">Нет данных</div>;
}
