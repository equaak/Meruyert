import { fetchProductsABC, type ProductABC, type ProductsABCData } from "@/lib/kaspi/products-abc";
import { PageShell, Section } from "@/components/page/page-shell";
import { KpiStrip, type KpiItem } from "@/components/page/kpi-strip";
import { RefreshButton } from "@/components/page/refresh-button";
import { formatCompactMoney, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_DAYS = new Set([1, 7, 14, 30, 730]);

export default async function KaspiTovaryPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const parsed = sp.days ? Number(sp.days) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;

  let data: ProductsABCData;
  try {
    data = await fetchProductsABC(days);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <PageShell title="Kaspi · Товары" subtitle="Ошибка загрузки">
        <div className="rounded-lg border border-[var(--red)]/30 bg-[var(--red-soft)] p-4 text-sm">
          <div className="mb-2 font-medium text-[var(--red)]">Не удалось загрузить данные</div>
          <div className="break-all font-mono text-[12px] text-[var(--text-dim)]">{msg}</div>
        </div>
      </PageShell>
    );
  }

  const isEmpty = data.totalProducts === 0;

  return (
    <PageShell
      title="Kaspi · Товары"
      subtitle={`ABC-анализ · ${data.period.label} · обновлено ${new Date(data.fetchedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`}
      headline={buildHeadline(data)}
    >
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11.5px] text-[var(--text-dim)]">
          Период: <span className="font-medium text-[var(--text)] tabular">{data.period.label}</span>
          {data.ordersCapped && (
            <span className="ml-2 text-[var(--amber)]">
              · проанализировано {data.ordersAnalyzed} из всех заказов
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={days} />
          <RefreshButton />
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip items={buildKpis(data)} />

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {/* ABC summary bar */}
          <Section title="Распределение выручки по классам">
            <AbcBar data={data} />
          </Section>

          {/* Products table */}
          <Section
            title="Товары"
            hint={`${data.totalProducts} уникальных позиций · отсортировано по выручке`}
          >
            <ProductsTable products={data.products} />
          </Section>
        </>
      )}

      <footer className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[10.5px] text-[var(--text-subtle)]">
        <span>Kaspi Shop API v2 · /entries · кеш 10 мин.</span>
        <span className="tabular">обновлено {new Date(data.fetchedAt).toLocaleString("ru-RU")}</span>
      </footer>
    </PageShell>
  );
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function buildHeadline(d: ProductsABCData): string {
  if (d.totalProducts === 0) return "Нет данных по позициям заказов за выбранный период.";
  return (
    `${d.totalProducts} уникальных товаров · выручка ${formatCompactMoney(d.totalRevenue)}. ` +
    `Класс A: ${d.countA} тов. (${formatCompactMoney(d.revenueA)}), ` +
    `B: ${d.countB} тов., C: ${d.countC} тов.`
  );
}

function buildKpis(d: ProductsABCData): KpiItem[] {
  return [
    {
      label: "Всего товаров",
      value: formatNumber(d.totalProducts),
      hint: `за ${d.period.days} дней`,
    },
    {
      label: "Класс A",
      value: formatNumber(d.countA),
      hint: `${formatPercent((d.revenueA / (d.totalRevenue || 1)) * 100)} выручки`,
      tone: "success",
    },
    {
      label: "Класс B",
      value: formatNumber(d.countB),
      hint: `${formatPercent((d.revenueB / (d.totalRevenue || 1)) * 100)} выручки`,
      tone: "info",
    },
    {
      label: "Класс C",
      value: formatNumber(d.countC),
      hint: `${formatPercent((d.revenueC / (d.totalRevenue || 1)) * 100)} выручки`,
    },
    {
      label: "Выручка итого",
      value: formatCompactMoney(d.totalRevenue),
      hint: `из ${d.ordersAnalyzed} заказов`,
    },
  ];
}

// ─────────────────────────── Components ───────────────────────────────────

function PeriodSelector({ value }: { value: number }) {
  const opts = [
    { v: 1, label: "Сегодня" },
    { v: 7, label: "7 дней" },
    { v: 14, label: "14 дней" },
    { v: 30, label: "30 дней" },
    { v: 730, label: "Всё время" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5">
      {opts.map((o) => (
        <a
          key={o.v}
          href={`?days=${o.v}`}
          className={cn(
            "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === o.v
              ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
              : "text-[var(--text-dim)] hover:bg-[var(--sidebar-accent)]/60",
          )}
        >
          {o.label}
        </a>
      ))}
    </div>
  );
}

function AbcBar({ data }: { data: ProductsABCData }) {
  const total = data.totalRevenue || 1;
  const shareA = (data.revenueA / total) * 100;
  const shareB = (data.revenueB / total) * 100;
  const shareC = (data.revenueC / total) * 100;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      {/* Bar */}
      <div className="flex h-8 overflow-hidden rounded-md">
        {shareA > 0 && (
          <div
            className="flex items-center justify-center bg-[var(--emerald)] text-[10px] font-bold text-white"
            style={{ width: `${shareA}%` }}
            title={`A: ${formatPercent(shareA)}`}
          >
            {shareA > 8 ? "A" : ""}
          </div>
        )}
        {shareB > 0 && (
          <div
            className="flex items-center justify-center bg-[var(--blue)] text-[10px] font-bold text-white"
            style={{ width: `${shareB}%` }}
            title={`B: ${formatPercent(shareB)}`}
          >
            {shareB > 5 ? "B" : ""}
          </div>
        )}
        {shareC > 0 && (
          <div
            className="flex items-center justify-center bg-[var(--border-strong)] text-[10px] font-bold text-[var(--text-dim)]"
            style={{ width: `${shareC}%` }}
            title={`C: ${formatPercent(shareC)}`}
          >
            {shareC > 5 ? "C" : ""}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
        {(
          [
            { cls: "A", count: data.countA, rev: data.revenueA, color: "var(--emerald)" },
            { cls: "B", count: data.countB, rev: data.revenueB, color: "var(--blue)" },
            { cls: "C", count: data.countC, rev: data.revenueC, color: "var(--border-strong)" },
          ] as const
        ).map((r) => (
          <div key={r.cls} className="flex items-start gap-2">
            <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: r.color }} />
            <div>
              <div className="font-semibold">
                Класс {r.cls} · {r.count} тов.
              </div>
              <div className="text-[11px] text-[var(--text-dim)] tabular">
                {formatCompactMoney(r.rev)} ·{" "}
                {formatPercent((r.rev / total) * 100)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ABC_BADGE: Record<"A" | "B" | "C", string> = {
  A: "bg-[var(--emerald-soft)] text-[var(--emerald)]",
  B: "bg-[var(--blue-soft)] text-[var(--blue)]",
  C: "bg-white/[0.06] text-[var(--text-dim)]",
};

function ProductsTable({ products }: { products: ProductABC[] }) {
  return (
    <div className="overflow-x-auto overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
      <table className="w-full text-[12px] tabular">
        <thead className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
          <tr>
            <th className="px-3 py-2 text-right font-medium w-8">#</th>
            <th className="px-3 py-2 text-left font-medium">Товар</th>
            <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Категория</th>
            <th className="px-3 py-2 text-right font-medium">Выручка</th>
            <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Доля</th>
            <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Накопл.</th>
            <th className="px-3 py-2 text-right font-medium hidden md:table-cell">Кол-во</th>
            <th className="px-3 py-2 text-right font-medium hidden md:table-cell">Заказов</th>
            <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">Ср. цена</th>
            <th className="px-3 py-2 text-center font-medium">ABC</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr
              key={p.offerCode}
              className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--sidebar-accent)]/30 transition-colors"
            >
              <td className="px-3 py-2 text-right text-[var(--text-subtle)]">{p.rank}</td>
              <td className="px-3 py-2 max-w-[200px]">
                <div className="truncate font-medium" title={p.name}>
                  {p.name}
                </div>
                <div className="truncate text-[10px] text-[var(--text-subtle)] font-mono">
                  {p.offerCode}
                </div>
              </td>
              <td className="px-3 py-2 text-[var(--text-dim)] hidden md:table-cell max-w-[140px]">
                <div className="truncate" title={p.categoryTitle}>{p.categoryTitle}</div>
              </td>
              <td className="px-3 py-2 text-right font-medium">
                {formatCompactMoney(p.revenue)}
              </td>
              <td className="px-3 py-2 text-right text-[var(--text-dim)] hidden sm:table-cell">
                {formatPercent(p.revenueShare * 100)}
              </td>
              <td className="px-3 py-2 text-right text-[var(--text-dim)] hidden sm:table-cell">
                {formatPercent(p.cumulativeShare * 100)}
              </td>
              <td className="px-3 py-2 text-right hidden md:table-cell">
                {formatNumber(p.quantity)}
              </td>
              <td className="px-3 py-2 text-right hidden md:table-cell">
                {formatNumber(p.orders)}
              </td>
              <td className="px-3 py-2 text-right hidden lg:table-cell text-[var(--text-dim)]">
                {formatCompactMoney(p.avgPrice)}
              </td>
              <td className="px-3 py-2 text-center">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    ABC_BADGE[p.abcClass],
                  )}
                >
                  {p.abcClass}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
      <div className="text-[13px] font-medium text-[var(--text-dim)]">
        Нет данных по позициям заказов
      </div>
      <div className="mt-1 text-[12px] text-[var(--text-subtle)]">
        API /entries не вернул позиции для заказов за выбранный период
      </div>
    </div>
  );
}
