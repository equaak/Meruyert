import { fetchKaspiDashboard, fetchKaspiDashboardByRange, type KaspiDashboardData } from "@/lib/kaspi-live";
import { PageShell, Section } from "@/components/page/page-shell";
import { KpiStrip, type KpiItem } from "@/components/page/kpi-strip";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import { KaspiPeriodSelector } from "./_components/period-selector";
import { RefreshButton } from "@/components/page/refresh-button";
import { MerchantBanner } from "./_components/merchant-banner";
import { KaspiEmptyState } from "./_components/empty-state";
import { ShareBar } from "@/components/page/share-bar";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_DAYS = new Set([1, 7, 14, 30, 60, 90, 730]);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function pct(curr: number, prev: number): number {
  if (prev <= 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

export default async function KaspiOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;

  // Explicit date range takes priority over "days"
  const from = sp.from && YMD_RE.test(sp.from) ? sp.from : null;
  const to   = sp.to   && YMD_RE.test(sp.to)   ? sp.to   : null;
  const useRange = from && to && from <= to;

  const parsed = sp.days ? Number(sp.days) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;

  let data: KaspiDashboardData;
  try {
    data = useRange
      ? await fetchKaspiDashboardByRange(from!, to!)
      : await fetchKaspiDashboard(days);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <PageShell title="Kaspi · Обзор" subtitle="Ошибка подключения к Kaspi API">
        <div className="rounded-lg border border-[var(--red)]/30 bg-[var(--red-soft)] p-4 text-sm">
          <div className="mb-2 font-medium text-[var(--red)]">Не удалось загрузить данные Kaspi</div>
          <div className="text-[var(--text-dim)] break-all text-[12px] font-mono">{msg}</div>
        </div>
      </PageShell>
    );
  }

  const isEmpty = data.totalOrdersInPeriod === 0;

  return (
    <PageShell
      title="Kaspi · Обзор"
      subtitle={`Kaspi Marketplace · обновлено ${new Date(data.fetchedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}
      headline={buildHeadline(data)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11.5px] text-[var(--text-dim)]">
          Период: <span className="font-medium text-[var(--text)] tabular">{data.period.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <KaspiPeriodSelector value={useRange ? 0 : days} from={from ?? ""} to={to ?? ""} />
          <RefreshButton />
        </div>
      </div>

      <MerchantBanner config={data.config} />

      <KpiStrip items={buildKpis(data)} />

      <Section title="Прямо сейчас" hint="Сегодняшние принятые/выданные заказы и сколько сейчас на доставке">
        <OperationalTiles data={data} />
      </Section>

      {isEmpty ? (
        <KaspiEmptyState days={days} config={data.config} />
      ) : (
        <>
          <Section title="Заказы и выручка по дням">
            <DailyChart data={data.dailyTrend} />
          </Section>

          <Section title="Статусы заказов" hint="Из всех заказов за период, по состоянию обработки">
            <StatusBlock data={data.byStatus} totalCount={data.totalOrdersInPeriod} />
            <div className="mt-3"><DeepLink href={`/kaspi-otmeny?days=${days}`} label="Подробно по отменам и причинам" /></div>
          </Section>

          <Section title="Способы оплаты" hint="По выручке (только выполненные заказы)">
            <PaymentBlock data={data.byPayment} />
          </Section>

          <Section title="Доставка и география" hint="Топ-5 городов по выручке">
            <DeliverySummary data={data} />
            <div className="mt-3"><DeepLink href={`/kaspi-dostavka?days=${days}`} label="Все города · типы доставки · стоимость" /></div>
          </Section>

          <Section title="Клиенты" hint={`${data.totalCustomers} уникальных за период · ${data.repeatCustomers} с повторными заказами`}>
            <CustomersSummary data={data} />
            <div className="mt-3"><DeepLink href={`/kaspi-klienty?days=${days}`} label="Все клиенты · топ по выручке" /></div>
          </Section>

          <Section title="Заказы" hint={`${data.totalOrdersInPeriod} заказов в периоде`}>
            <RecentOrdersPreview rows={data.recentOrders.slice(0, 10)} />
            <div className="mt-3"><DeepLink href={`/kaspi-zakazy?days=${days}`} label={`Все ${data.totalOrdersInPeriod} заказов · фильтры по статусу`} /></div>
          </Section>
        </>
      )}

      <footer className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[10.5px] text-[var(--text-subtle)]">
        <span>Kaspi Shop API v2 · кеш 60 сек.</span>
        <span className="tabular">обновлено {new Date(data.fetchedAt).toLocaleString("ru-RU")}</span>
      </footer>
    </PageShell>
  );
}

function buildHeadline(d: KaspiDashboardData): string {
  if (d.totalOrdersInPeriod === 0) {
    return `0 заказов на Kaspi Marketplace за ${d.period.days} дней. Token подключён, merchant ${d.config.merchantId} ответил, но в /orders по нему пусто.`;
  }
  const periodDelta = pct(d.periodKpi.revenue, d.prevPeriodKpi.revenue);
  const parts: string[] = [];
  parts.push(`${formatCompactMoney(d.periodKpi.revenue)} выручки на ${d.periodKpi.completedOrders} выполненных заказах.`);
  if (Math.abs(periodDelta) >= 3) parts.push(` ${periodDelta > 0 ? '+' : ''}${periodDelta.toFixed(0)}% к прошлому периоду.`);
  if (d.periodKpi.cancellationRate > 0.05) {
    parts.push(` Отмен: ${formatPercent(d.periodKpi.cancellationRate * 100)} — выше нормы.`);
  }
  return parts.join("");
}

function buildKpis(d: KaspiDashboardData): KpiItem[] {
  const periodRevDelta = pct(d.periodKpi.revenue, d.prevPeriodKpi.revenue);
  const aovDelta = pct(d.periodKpi.avgCheck, d.prevPeriodKpi.avgCheck);
  const ordersDelta = pct(d.periodKpi.totalOrders, d.prevPeriodKpi.totalOrders);
  return [
    { label: "Выручка", value: formatCompactMoney(d.periodKpi.revenue), hint: `vs прошл.: ${formatCompactMoney(d.prevPeriodKpi.revenue)}`, delta: { value: periodRevDelta }, tone: periodRevDelta < -5 ? "warning" : periodRevDelta > 5 ? "success" : "default" },
    { label: "Заказов", value: formatNumber(d.periodKpi.totalOrders), hint: `выполнено: ${d.periodKpi.completedOrders}`, delta: { value: ordersDelta } },
    { label: "Средний чек", value: formatCompactMoney(d.periodKpi.avgCheck), hint: "только выполненные", delta: { value: aovDelta } },
    { label: "Отмены, %", value: formatPercent(d.periodKpi.cancellationRate * 100), hint: `${d.periodKpi.cancelledOrders} шт.`, tone: d.periodKpi.cancellationRate > 0.05 ? "warning" : "default" },
    { label: "Возвраты, %", value: formatPercent(d.periodKpi.returnRate * 100), hint: `${d.periodKpi.returnedOrders} шт.`, tone: d.periodKpi.returnRate > 0.03 ? "warning" : "default" },
    { label: "Kaspi Доставка", value: formatPercent(d.periodKpi.kaspiDeliveryShare * 100), hint: "от выполненных", tone: "info" },
    { label: "Клиентов", value: formatNumber(d.totalCustomers), hint: `${d.repeatCustomers} с повтором`, tone: "info" },
  ];
}

function OperationalTiles({ data }: { data: KaspiDashboardData }) {
  const tiles: { label: string; hint: string; tile: KaspiDashboardData['acceptedToday']; tone: 'blue' | 'emerald' | 'amber' }[] = [
    { label: "Принято сегодня", hint: "Заказы, созданные сегодня и прошедшие одобрение банка", tile: data.acceptedToday, tone: 'blue' },
    { label: "Выдано сегодня", hint: "Заказы со статусом «Выполнен» сегодня", tile: data.issuedToday, tone: 'emerald' },
    { label: "Сейчас в работе", hint: "На доставке / в пункте выдачи, не завершены и не отменены", tile: data.inWorkNow, tone: 'amber' },
  ];
  const toneColor: Record<string, string> = {
    blue: 'var(--blue)',
    emerald: 'var(--emerald)',
    amber: 'var(--amber)',
  };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {tiles.map(t => (
        <div key={t.label} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: toneColor[t.tone] }} />
            <span className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">{t.label}</span>
          </div>
          <div className="mt-1 text-[22px] font-semibold tabular leading-tight">{formatNumber(t.tile.count)}</div>
          <div className="mt-1 text-[12px] tabular text-[var(--text-dim)]">{formatCompactMoney(t.tile.amount)}</div>
          <div className="mt-2 text-[11px] leading-relaxed text-[var(--text-dim)]">{t.hint}</div>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ data }: { data: KaspiDashboardData['dailyTrend'] }) {
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-end gap-1 h-[140px]">
        {data.map(d => {
          const intensity = d.revenue / max;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-sm bg-[var(--accent)]"
                style={{ height: `${Math.max(intensity * 100, 1)}%`, opacity: intensity > 0 ? 0.3 + intensity * 0.7 : 0.1 }}
                title={`${d.date} · ${formatCompactMoney(d.revenue)} · ${d.completed}/${d.orders} заказов`}
              />
              <div className="text-[8px] text-[var(--text-subtle)] tabular">{d.date.slice(8, 10)}.{d.date.slice(5, 7)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBlock({ data, totalCount }: { data: KaspiDashboardData['byStatus']; totalCount: number }) {
  if (data.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Статус</th>
            <th className="px-3 py-2 text-right font-medium">Заказов</th>
            <th className="px-3 py-2 text-left font-medium w-[40%]">Доля</th>
            <th className="px-3 py-2 text-right font-medium">Выручка</th>
          </tr>
        </thead>
        <tbody>
          {data.map(r => (
            <tr key={r.status} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2">
                <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: r.color }} />
                <span className="font-medium">{r.label}</span>
                <span className="ml-2 text-[10px] text-[var(--text-subtle)] font-mono">{r.status}</span>
              </td>
              <td className="px-3 py-2 text-right">{formatNumber(r.count)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <ShareBar value={r.count / (totalCount || 1)} color={r.color} />
                  <span className="shrink-0 text-[11px] text-[var(--text-dim)]">{formatPercent(r.share * 100)}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-right font-medium">{formatCompactMoney(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentBlock({ data }: { data: KaspiDashboardData['byPayment'] }) {
  if (data.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {data.map(r => (
        <div key={r.paymentMode} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">{r.label}</span>
            <span className="text-[10px] text-[var(--text-dim)] tabular">{r.count} заказов</span>
          </div>
          <div className="mt-1 text-[20px] font-semibold tabular leading-tight">{formatCompactMoney(r.revenue)}</div>
          <div className="mt-1 text-[11px] text-[var(--text-dim)] tabular">
            {formatPercent(r.share * 100)} выручки · средний чек {formatCompactMoney(r.avgCheck)}
          </div>
          <div className="mt-2"><ShareBar value={r.share} /></div>
        </div>
      ))}
    </div>
  );
}

function DeliverySummary({ data }: { data: KaspiDashboardData }) {
  const topCities = data.topCities.slice(0, 5);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">По типам доставки</div>
        <div className="space-y-1.5 text-[12px] tabular">
          {data.byDelivery.map(d => (
            <div key={d.deliveryMode} className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--text-dim)] truncate">{d.label}</span>
              <span className="shrink-0"><span className="font-medium text-[var(--text)]">{formatCompactMoney(d.revenue)}</span> <span className="text-[10px] text-[var(--text-subtle)]">({formatPercent(d.share * 100)})</span></span>
            </div>
          ))}
          {data.byDelivery.length === 0 && <span className="text-[var(--text-subtle)]">—</span>}
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Топ-5 городов</div>
        <div className="space-y-1.5 text-[12px] tabular">
          {topCities.map(c => (
            <div key={c.city} className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--text-dim)] truncate">{c.city}</span>
              <span className="shrink-0"><span className="font-medium text-[var(--text)]">{formatCompactMoney(c.revenue)}</span> <span className="text-[10px] text-[var(--text-subtle)]">({c.orders} зак.)</span></span>
            </div>
          ))}
          {topCities.length === 0 && <span className="text-[var(--text-subtle)]">—</span>}
        </div>
      </div>
    </div>
  );
}

function CustomersSummary({ data }: { data: KaspiDashboardData }) {
  const top5 = data.topCustomers.slice(0, 5);
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Сводка</div>
        <div className="space-y-2 text-[12px] tabular">
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--text-dim)]">Уникальных клиентов</span>
            <span className="font-medium">{formatNumber(data.totalCustomers)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--text-dim)]">С повторными заказами</span>
            <span className="font-medium">{formatNumber(data.repeatCustomers)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--text-dim)]">Доля повторных</span>
            <span className="font-medium">{data.totalCustomers > 0 ? formatPercent((data.repeatCustomers / data.totalCustomers) * 100) : "—"}</span>
          </div>
        </div>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Топ-5 по выручке</div>
        <div className="space-y-1.5 text-[12px] tabular">
          {top5.map(c => (
            <div key={c.name} className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--text-dim)] truncate">{c.name}</span>
              <span className="shrink-0"><span className="font-medium text-[var(--text)]">{formatCompactMoney(c.revenue)}</span> <span className="text-[10px] text-[var(--text-subtle)]">({c.orders} зак.)</span></span>
            </div>
          ))}
          {top5.length === 0 && <span className="text-[var(--text-subtle)]">—</span>}
        </div>
      </div>
    </div>
  );
}

function RecentOrdersPreview({ rows }: { rows: KaspiDashboardData['recentOrders'] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Код заказа</th>
            <th className="px-3 py-2 text-left font-medium">Дата</th>
            <th className="px-3 py-2 text-left font-medium">Статус</th>
            <th className="px-3 py-2 text-left font-medium">Город</th>
            <th className="px-3 py-2 text-right font-medium">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id} className="border-b border-[var(--border)] last:border-b-0">
              <td className="px-3 py-2 font-mono text-[11px]">{o.code}</td>
              <td className="px-3 py-2 text-[var(--text-dim)]">{new Date(o.date).toLocaleDateString("ru-RU")}</td>
              <td className="px-3 py-2"><StatusBadge status={o.status} /></td>
              <td className="px-3 py-2 text-[var(--text-dim)]">{o.deliveryCity || "—"}</td>
              <td className="px-3 py-2 text-right font-medium">{formatCompactMoney(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = ({
    APPROVED_BY_BANK: 'Одобрен банком',
    ACCEPTED_BY_MERCHANT: 'Принят',
    COMPLETED: 'Выполнен',
    CANCELLED: 'Отменён',
    CANCELLING: 'Отмена',
    KASPI_DELIVERY_RETURN_REQUESTED: 'Запрос на возврат',
    RETURNED: 'Возврат',
  } as Record<string, string>)[status] ?? status;
  const cls = ({
    COMPLETED: 'bg-[var(--emerald-soft)] text-[var(--emerald)]',
    CANCELLED: 'bg-[var(--red-soft)] text-[var(--red)]',
    CANCELLING: 'bg-[var(--orange-soft)] text-[var(--orange)]',
    RETURNED: 'bg-[var(--orange-soft)] text-[var(--orange)]',
    APPROVED_BY_BANK: 'bg-[var(--blue-soft)] text-[var(--blue)]',
  } as Record<string, string>)[status] ?? 'bg-white/[0.06] text-[var(--text-dim)]';
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", cls)}>{label}</span>;
}

function DeepLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[11.5px] font-medium text-[var(--text-dim)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
    >
      {label}
      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
