/**
 * ABC-анализ товаров по данным Kaspi Shop API.
 *
 * Алгоритм:
 *   1. Берём завершённые заказы из fetchKaspiDashboard (кешировано 300s).
 *   2. Для каждого заказа запрашиваем /entries (позиции), с конкурентностью 10.
 *   3. Агрегируем по offer.code → выручка, кол-во, заказы.
 *   4. Сортируем по выручке убыванием, считаем нарастающий %.
 *   5. A ≤ 80%, B ≤ 95%, C > 95%.
 *
 * Лимиты:
 *   - Анализируем не более MAX_ORDERS_TO_ANALYZE завершённых заказов
 *     (самые свежие идут первыми).
 *   - Конкурентность requests: CONCURRENCY.
 *   - Кеш результата: 600s (10 мин).
 */

import { unstable_cache } from "next/cache";
import { fetchKaspiDashboard } from "../kaspi-live";
import { fetchOrderEntries } from "./entries-client";

function cleanEnv(raw: string | undefined, fallback = ""): string {
  if (!raw) return fallback;
  const t = raw.trim();
  if (t.length >= 2) {
    const f = t[0], l = t[t.length - 1];
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) return t.slice(1, -1);
  }
  return t || fallback;
}

const TOKEN = cleanEnv(process.env.KASPI_TOKEN);
const MERCHANT_ID = cleanEnv(process.env.KASPI_MERCHANT_ID);

const MAX_ORDERS_TO_ANALYZE = 100;
const CONCURRENCY = 20;

// ─────────────────────────── Types ────────────────────────────────────────

export interface ProductABC {
  rank: number;
  offerCode: string;
  name: string;
  categoryTitle: string;
  revenue: number;
  quantity: number;
  orders: number;
  avgPrice: number;
  revenueShare: number;    // 0..1
  cumulativeShare: number; // 0..1
  abcClass: "A" | "B" | "C";
}

export interface ProductsABCData {
  fetchedAt: string;
  period: { days: number; label: string };
  totalRevenue: number;
  totalProducts: number;
  countA: number;
  countB: number;
  countC: number;
  revenueA: number;
  revenueB: number;
  revenueC: number;
  products: ProductABC[];
  ordersAnalyzed: number;
  ordersCapped: boolean;
}

// ─────────────────────────── Fetch helpers ─────────────────────────────────

async function fetchEntriesConcurrent(
  orderIds: string[],
): Promise<Map<string, Awaited<ReturnType<typeof fetchOrderEntries>>>> {
  const result = new Map<string, Awaited<ReturnType<typeof fetchOrderEntries>>>();
  for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
    const batch = orderIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) =>
        fetchOrderEntries(TOKEN, id, MERCHANT_ID).then((entries) => ({ id, entries })),
      ),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") result.set(r.value.id, r.value.entries);
    }
  }
  return result;
}

// ─────────────────────────── Core aggregation ──────────────────────────────

async function _fetchProductsABC(days: number): Promise<ProductsABCData> {
  const dash = await fetchKaspiDashboard(days);
  const allCompleted = [...dash.completedOrders].sort((a, b) => b.date.localeCompare(a.date));

  const ordersCapped = allCompleted.length > MAX_ORDERS_TO_ANALYZE;
  const toAnalyze = ordersCapped
    ? allCompleted.slice(0, MAX_ORDERS_TO_ANALYZE)
    : allCompleted;

  const entriesMap = await fetchEntriesConcurrent(toAnalyze.map((o) => o.id));

  // Aggregate by offer code
  const byCode = new Map<
    string,
    { name: string; category: string; revenue: number; qty: number; orderIds: Set<string> }
  >();

  for (const order of toAnalyze) {
    const entries = entriesMap.get(order.id) ?? [];
    for (const entry of entries) {
      const a = entry.attributes;
      if (!a) continue;
      const code = a.offer?.code ?? "__unknown__";
      const name = a.offer?.name ?? "Без названия";
      const category = a.category?.title ?? "—";
      const revenue = a.totalPrice ?? 0;
      const qty = a.quantity ?? 1;

      const existing = byCode.get(code);
      if (existing) {
        existing.revenue += revenue;
        existing.qty += qty;
        existing.orderIds.add(order.id);
      } else {
        byCode.set(code, { name, category, revenue, qty, orderIds: new Set([order.id]) });
      }
    }
  }

  // Sort by revenue desc
  const sorted = Array.from(byCode.entries())
    .map(([offerCode, v]) => ({
      offerCode,
      name: v.name,
      categoryTitle: v.category,
      revenue: v.revenue,
      quantity: v.qty,
      orders: v.orderIds.size,
      avgPrice: v.qty > 0 ? v.revenue / v.qty : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = sorted.reduce((s, p) => s + p.revenue, 0) || 1;

  let cumulative = 0;
  let countA = 0, countB = 0, countC = 0;
  let revenueA = 0, revenueB = 0, revenueC = 0;

  const products: ProductABC[] = sorted.map((p, i) => {
    cumulative += p.revenue;
    const cumulativeShare = cumulative / totalRevenue;
    const abcClass: "A" | "B" | "C" =
      cumulativeShare <= 0.80 ? "A" : cumulativeShare <= 0.95 ? "B" : "C";

    if (abcClass === "A") { countA++; revenueA += p.revenue; }
    else if (abcClass === "B") { countB++; revenueB += p.revenue; }
    else { countC++; revenueC += p.revenue; }

    return { rank: i + 1, ...p, revenueShare: p.revenue / totalRevenue, cumulativeShare, abcClass };
  });

  return {
    fetchedAt: new Date().toISOString(),
    period: { days, label: dash.period.label },
    totalRevenue,
    totalProducts: products.length,
    countA,
    countB,
    countC,
    revenueA,
    revenueB,
    revenueC,
    products,
    ordersAnalyzed: toAnalyze.length,
    ordersCapped,
  };
}

export const fetchProductsABC = unstable_cache(
  _fetchProductsABC,
  ["kaspi-products-abc"],
  { revalidate: 600, tags: ["kaspi"] },
);
