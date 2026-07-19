import { fetchKaspiDashboard, type KaspiOrder } from "@/lib/kaspi-live";
import { PageShell, Section } from "@/components/page/page-shell";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import { KaspiPeriodSelector } from "@/app/kaspi/_components/period-selector";
import { RefreshButton } from "@/components/page/refresh-button";
import { MerchantBanner } from "@/app/kaspi/_components/merchant-banner";
import { KaspiEmptyState } from "@/app/kaspi/_components/empty-state";
import { ShareBar } from "@/components/page/share-bar";
import { AlertTriangle, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ALLOWED_DAYS = new Set([1, 7, 14, 30, 60, 90]);

export default async function KaspiCancellationsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const parsed = sp.days ? Number(sp.days) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;
  const data = await fetchKaspiDashboard(days);

  const cancelled = data.recentOrders.filter(o => o.status === 'CANCELLED' || o.status === 'CANCELLING');
  const returned = data.recentOrders.filter(o => o.status === 'RETURNED' || o.status === 'KASPI_DELIVERY_RETURN_REQUESTED');

  return (
    <PageShell
      title="Kaspi · Отмены и возвраты"
      subtitle={`${data.periodKpi.cancelledOrders} отмен · ${data.periodKpi.returnedOrders} возвратов · ${data.period.label}`}
      headline={buildHeadline(data)}
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
          <Section title="Сводка">
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryTile label="Доля отмен" value={formatPercent(data.periodKpi.cancellationRate * 100)} sub={`${data.periodKpi.cancelledOrders} из ${data.periodKpi.totalOrders}`} warn={data.periodKpi.cancellationRate > 0.05} />
              <SummaryTile label="Доля возвратов" value={formatPercent(data.periodKpi.returnRate * 100)} sub={`${data.periodKpi.returnedOrders} из ${data.periodKpi.totalOrders}`} warn={data.periodKpi.returnRate > 0.03} />
              <SummaryTile label="Норма Kaspi" value="≤ 3%" sub="ниже — комиссия 0%, выше — штраф" />
            </div>
          </Section>

          {data.cancellationReasons.length > 0 && (
            <Section title="Причины отмен" hint="Как часто встречается каждая причина">
              <ReasonsTable reasons={data.cancellationReasons} />
            </Section>
          )}

          {cancelled.length > 0 && (
            <Section title={`Отменённые заказы · ${cancelled.length}`}>
              <CancelledTable rows={cancelled} kind="cancelled" />
            </Section>
          )}

          {returned.length > 0 && (
            <Section title={`Возвраты · ${returned.length}`}>
              <CancelledTable rows={returned} kind="returned" />
            </Section>
          )}

          {cancelled.length === 0 && returned.length === 0 && (
            <Section title="Отмены и возвраты">
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-[12px] text-[var(--text-dim)]">
                За период не было отмен и возвратов.
              </div>
            </Section>
          )}
        </>
      )}
    </PageShell>
  );
}

function buildHeadline(d: ReturnType<typeof fakeFetch> | Awaited<ReturnType<typeof fetchKaspiDashboard>>): string {
  if (d.totalOrdersInPeriod === 0) return "За период нет заказов — нет данных по отменам.";
  const parts: string[] = [];
  if (d.periodKpi.cancellationRate > 0.05) {
    parts.push(`Отмен ${formatPercent(d.periodKpi.cancellationRate * 100)} — выше критического порога Kaspi 3%.`);
  } else if (d.periodKpi.cancellationRate > 0) {
    parts.push(`Отмены под контролем: ${formatPercent(d.periodKpi.cancellationRate * 100)} от ${d.periodKpi.totalOrders} заказов.`);
  } else {
    parts.push(`Отмен нет.`);
  }
  if (d.periodKpi.returnedOrders > 0) {
    parts.push(` Возвратов: ${d.periodKpi.returnedOrders}.`);
  }
  return parts.join("");
}
function fakeFetch() { return null as unknown as Awaited<ReturnType<typeof fetchKaspiDashboard>>; }

function SummaryTile({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-lg)] border bg-[var(--surface)] p-4 ${warn ? "border-[var(--amber)]/30" : "border-[var(--border)]"}`}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">{label}</div>
      <div className={`mt-1 text-[22px] font-semibold tabular leading-tight ${warn ? "text-[var(--amber)]" : ""}`}>
        {warn && <AlertTriangle className="mr-1 inline h-4 w-4" />}
        {value}
      </div>
      <div className="mt-1 text-[11px] text-[var(--text-dim)]">{sub}</div>
    </div>
  );
}

function ReasonsTable({ reasons }: { reasons: { reason: string; count: number; share: number }[] }) {
  const maxCount = Math.max(...reasons.map(r => r.count), 1);
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Причина</th>
            <th className="px-3 py-2 text-right font-medium">Отмен</th>
            <th className="px-3 py-2 text-left font-medium w-[40%]">Частота</th>
          </tr>
        </thead>
        <tbody>
          {reasons.map(r => (
            <tr key={r.reason} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2 max-w-[400px] truncate">{r.reason}</td>
              <td className="px-3 py-2 text-right font-medium">{formatNumber(r.count)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <ShareBar value={r.count / maxCount} color="var(--red)" />
                  <span className="shrink-0 text-[11px] text-[var(--text-dim)]">{formatPercent(r.share * 100)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CancelledTable({ rows, kind }: { rows: KaspiOrder[]; kind: 'cancelled' | 'returned' }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Код заказа</th>
            <th className="px-3 py-2 text-left font-medium">Дата</th>
            <th className="px-3 py-2 text-left font-medium">Причина</th>
            <th className="px-3 py-2 text-left font-medium">Клиент</th>
            <th className="px-3 py-2 text-right font-medium">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2 font-mono text-[11px]">{o.code}</td>
              <td className="px-3 py-2 text-[var(--text-dim)]">{new Date(o.date).toLocaleDateString("ru-RU")}</td>
              <td className="px-3 py-2 max-w-[280px] truncate text-[var(--text-dim)]">
                <XCircle className={`mr-1 inline h-3 w-3 ${kind === 'cancelled' ? 'text-[var(--red)]' : 'text-[var(--orange)]'}`} />
                {o.cancellationReason || 'Не указана'}
              </td>
              <td className="px-3 py-2 text-[var(--text-dim)] max-w-[140px] truncate">{o.customerName || '—'}</td>
              <td className="px-3 py-2 text-right">{formatCompactMoney(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
