/**
 * Kaspi Marketplace live analytics client.
 *
 * Mirrors the pattern of lib/odata.ts:
 *   - Fetches data on every (cached) request, no DB sync needed.
 *   - In-memory aggregations for all dimensions.
 *   - unstable_cache TTL 60s so navigation between sub-pages reuses one fetch.
 *
 * ─── Scoping (важно — выяснено через поддержку Kaspi Pay) ────────────────
 * Kaspi Shop API v2 требует ДВА header'а вместе:
 *   1. `X-Auth-Token` — аутентификация
 *   2. `X-Merchant-Uid` — указывает магазин, по которому отдавать данные
 *
 * БЕЗ X-Merchant-Uid API отвечает HTTP 200 + totalCount: 0 по всем фильтрам —
 * это и было причиной "0 заказов за 98 дней" в первоначальной диагностике.
 * Поддержка Kaspi подсказала про этот header. С ним сразу пришло 1715 заказов
 * за 14 дней по merchant 16974112.
 *
 * ─── API gotchas ───────────────────────────────────────────────────────────
 * - GET /orders REQUIRES filter[orders][creationDate][$ge] and [$le]
 * - The date range cap is **14 days** per single request (server enforces;
 *   tried 15d → 400 error). We chunk into 14-day windows.
 * - Pagination: page[number] starts at 0, page[size] max 100.
 * - All dates are millisecond epoch in Almaty TZ.
 */

import { unstable_cache } from 'next/cache';

// ───────────────────────────── Configuration ──────────────────────────────

/**
 * Defensive env-value cleanup. Снимаем обрамляющие кавычки и пробелы —
 * частая ошибка при `echo "value" | vercel env add` на Windows и при
 * ручной обёртке значений кавычками в .env.local.
 */
function cleanEnv(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed || fallback;
}

const KASPI_API_BASE = cleanEnv(process.env.KASPI_API_BASE, 'https://kaspi.kz/shop/api/v2');
const KASPI_TOKEN = cleanEnv(process.env.KASPI_TOKEN, '');
const KASPI_MERCHANT_ID = cleanEnv(process.env.KASPI_MERCHANT_ID, '');
const KASPI_MERCHANT_NAME = cleanEnv(process.env.KASPI_MERCHANT_NAME, '—');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_RANGE_DAYS = 14;       // Kaspi server-enforced limit per single request
const MAX_PAGE_SIZE = 100;       // Kaspi server-enforced limit

// ─────────────────────────── Russian labels ──────────────────────────────

export const KASPI_STATUS_LABELS: Record<string, string> = {
  APPROVED_BY_BANK: 'Одобрен банком',
  ACCEPTED_BY_MERCHANT: 'Принят',
  COMPLETED: 'Выполнен',
  CANCELLED: 'Отменён',
  CANCELLING: 'В процессе отмены',
  KASPI_DELIVERY_RETURN_REQUESTED: 'Запрос на возврат',
  RETURNED: 'Возврат',
};

export const KASPI_STATUS_COLORS: Record<string, string> = {
  APPROVED_BY_BANK: 'var(--blue)',
  ACCEPTED_BY_MERCHANT: '#6b7280',
  COMPLETED: 'var(--emerald)',
  CANCELLED: 'var(--red)',
  CANCELLING: 'var(--orange)',
  KASPI_DELIVERY_RETURN_REQUESTED: 'var(--amber)',
  RETURNED: 'var(--orange)',
};

export const KASPI_PAYMENT_LABELS: Record<string, string> = {
  PREPAID: 'Предоплата',
  PAY_WITH_CREDIT: 'Kaspi Кредит',
  PAY_WITH_INSTALLMENT: 'Kaspi Рассрочка',
  CARD: 'Картой',
};

export const KASPI_DELIVERY_LABELS: Record<string, string> = {
  PICKUP: 'Самовывоз',
  LOCAL: 'Локальная доставка',
  REGIONAL_TODOOR: 'Региональная (до двери)',
  REGIONAL_PICKUP: 'Региональный пункт выдачи',
  DELIVERY_LOCAL: 'Локальная доставка',
};

export const KASPI_STATE_LABELS: Record<string, string> = {
  NEW: 'Новый',
  SIGN_REQUIRED: 'Требует подписи',
  PICKUP: 'На самовывоз',
  DELIVERY: 'На доставке',
  KASPI_DELIVERY: 'Kaspi Доставка',
  ARCHIVE: 'Архив',
};

// ─────────────────────────── Type shapes ─────────────────────────────────

export interface KaspiConfig {
  configured: boolean;
  merchantId: string;
  merchantName: string;
  apiBase: string;
  tokenSet: boolean;
}

export interface KaspiOrderAttrs {
  code?: string;
  creationDate?: number;
  approvedByBankDate?: number;
  totalPrice?: number;
  deliveryCost?: number;
  deliveryCostForSeller?: number;
  status?: string;
  state?: string;
  cancellationReason?: string;
  paymentMode?: string;
  creditTerm?: number;
  deliveryMode?: string;
  isKaspiDelivery?: boolean;
  customer?: { firstName?: string; lastName?: string; cellPhone?: string };
  deliveryAddress?: { town?: string; formattedAddress?: string };
}

export interface KaspiOrder {
  id: string;
  code: string;
  date: string;             // ISO
  total: number;
  deliveryCost: number;
  deliveryCostForSeller: number;
  status: string;
  state: string;
  cancellationReason: string | null;
  paymentMode: string | null;
  creditTerm: number | null;
  deliveryMode: string | null;
  isKaspiDelivery: boolean;
  customerName: string | null;
  customerPhone: string | null;
  deliveryCity: string | null;
}

export interface KaspiPeriodKPI {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  revenue: number;            // sum total over COMPLETED
  avgCheck: number;
  cancellationRate: number;   // 0..1
  returnRate: number;
  kaspiDeliveryShare: number; // share of COMPLETED with isKaspiDelivery
}

export interface KaspiDailyPoint {
  date: string;
  orders: number;
  completed: number;
  revenue: number;
  cancellations: number;
}

export interface KaspiTopCustomer {
  name: string;
  orders: number;
  revenue: number;
  avgCheck: number;
  lastOrderDate: string;
  city: string | null;
}

export interface KaspiCancellationReason {
  reason: string;
  count: number;
  share: number;
}

export interface KaspiCityRow {
  city: string;
  orders: number;
  revenue: number;
  share: number;
}

export interface KaspiStatusBreakdown {
  status: string;
  label: string;
  color: string;
  count: number;
  share: number;
  revenue: number;
}

export interface KaspiPaymentBreakdown {
  paymentMode: string;
  label: string;
  count: number;
  revenue: number;
  share: number;
  avgCheck: number;
}

export interface KaspiDeliveryBreakdown {
  deliveryMode: string;
  label: string;
  count: number;
  revenue: number;
  share: number;
}

export interface KaspiCreditTerm {
  term: number | null;
  orders: number;
  revenue: number;
  avgCheck: number;
}

export interface KaspiOperationalTile {
  count: number;
  amount: number;
}

export interface KaspiDashboardData {
  fetchedAt: string;
  config: KaspiConfig;
  period: {
    days: number;
    startDate: string;
    endDate: string;
    label: string;
  };

  // KPI
  today: KaspiPeriodKPI;
  yesterday: KaspiPeriodKPI;
  periodKpi: KaspiPeriodKPI;
  prevPeriodKpi: KaspiPeriodKPI;

  // Operational «right now» tiles
  acceptedToday: KaspiOperationalTile;     // created today, not yet awaiting bank
  issuedToday: KaspiOperationalTile;       // COMPLETED today
  inWorkNow: KaspiOperationalTile;         // currently in DELIVERY/PICKUP/KASPI_DELIVERY state, not finalized

  // Trends
  dailyTrend: KaspiDailyPoint[];

  // Status / payment / delivery breakdowns (over period)
  byStatus: KaspiStatusBreakdown[];
  byPayment: KaspiPaymentBreakdown[];
  byDelivery: KaspiDeliveryBreakdown[];

  // Cancellations
  cancellationReasons: KaspiCancellationReason[];

  // Geography (by destination city)
  topCities: KaspiCityRow[];

  // Customers (named, by total revenue)
  topCustomers: KaspiTopCustomer[];
  totalCustomers: number;
  repeatCustomers: number;

  // Credit
  creditByTerm: KaspiCreditTerm[];
  creditRevenue: number;
  creditShare: number;

  // Raw recent orders (for the orders table)
  recentOrders: KaspiOrder[]; // up to 100 most recent
  completedOrders: KaspiOrder[]; // all COMPLETED in period — for reconciliation with 1С
  totalOrdersInPeriod: number;
}

// ──────────────────────────── HTTP helpers ───────────────────────────────

function authHeaders(): HeadersInit {
  // `X-Merchant-Uid` is REQUIRED по подсказке поддержки Kaspi Pay. Без него API
  // отвечает HTTP 200 + totalCount: 0 по всем фильтрам (что мы и видели за 98 дней
  // диагностики). С header'ом сразу пришло 1715 заказов за 14 дней по merchant 16974112.
  const headers: Record<string, string> = {
    'X-Auth-Token': KASPI_TOKEN,
    Accept: 'application/vnd.api+json;charset=UTF-8',
    'User-Agent': USER_AGENT,
  };
  if (KASPI_MERCHANT_ID) {
    headers['X-Merchant-Uid'] = KASPI_MERCHANT_ID;
  }
  return headers;
}

interface KaspiOrdersPage {
  data?: { id?: string; attributes?: KaspiOrderAttrs }[];
  meta?: { totalCount?: number; pageCount?: number };
  errors?: { title?: string }[];
}

/** One paginated request — single 14-day window, single page. */
async function fetchOrdersPage(params: {
  pageNumber: number;
  fromMs: number;
  toMs: number;
  state?: string;
}): Promise<KaspiOrdersPage> {
  const { pageNumber, fromMs, toMs, state } = params;

  const url = new URL(`${KASPI_API_BASE}/orders`);
  url.searchParams.set('page[number]', String(pageNumber));
  url.searchParams.set('page[size]', String(MAX_PAGE_SIZE));
  url.searchParams.set('filter[orders][creationDate][$ge]', String(fromMs));
  url.searchParams.set('filter[orders][creationDate][$le]', String(toMs));
  if (state) url.searchParams.set('filter[orders][state]', state);

  // Scope осуществляется через header X-Merchant-Uid (см. authHeaders),
  // а не через query-параметр — это устаревшая попытка, теперь не нужна.

  const res = await fetch(url.toString(), { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Kaspi ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetch all orders in a single 14-day window (across all states), paginated. */
async function fetchWindowAllStates(fromMs: number, toMs: number): Promise<KaspiOrder[]> {
  // We need orders across all states. The API REQUIRES filter[orders][state].
  // Strategy: iterate every state value, dedupe by order id.
  const STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];
  const byId = new Map<string, KaspiOrder>();

  for (const state of STATES) {
    let pageNumber = 0;
    while (true) {
      const data = await fetchOrdersPage({ pageNumber, fromMs, toMs, state });
      const items = data.data ?? [];
      for (const raw of items) {
        const id = raw.id ?? '';
        const a = raw.attributes ?? {};
        if (!id || !a.code || a.creationDate == null) continue;
        const fullName = [a.customer?.firstName, a.customer?.lastName].filter(Boolean).join(' ').trim();
        byId.set(id, {
          id,
          code: a.code,
          date: new Date(a.creationDate).toISOString(),
          total: a.totalPrice ?? 0,
          deliveryCost: a.deliveryCost ?? 0,
          deliveryCostForSeller: a.deliveryCostForSeller ?? 0,
          status: a.status ?? 'UNKNOWN',
          state: a.state ?? state,
          cancellationReason: a.cancellationReason ?? null,
          paymentMode: a.paymentMode ?? null,
          creditTerm: a.creditTerm ?? null,
          deliveryMode: a.deliveryMode ?? null,
          isKaspiDelivery: !!a.isKaspiDelivery,
          customerName: fullName || null,
          customerPhone: a.customer?.cellPhone ?? null,
          deliveryCity: a.deliveryAddress?.town ?? null,
        });
      }
      const pageCount = data.meta?.pageCount ?? 1;
      pageNumber++;
      if (pageNumber >= pageCount) break;
    }
  }

  return Array.from(byId.values());
}

/** Fetch orders across an arbitrary date range, chunked into 14-day windows. */
async function fetchOrdersInRange(fromMs: number, toMs: number): Promise<KaspiOrder[]> {
  const out: KaspiOrder[] = [];
  let cursor = fromMs;
  const stepMs = MAX_RANGE_DAYS * 86400_000 - 60_000; // leave 1m safety margin
  while (cursor < toMs) {
    const chunkEnd = Math.min(cursor + stepMs, toMs);
    const chunkOrders = await fetchWindowAllStates(cursor, chunkEnd);
    out.push(...chunkOrders);
    cursor = chunkEnd + 1;
  }
  return out;
}

// ─────────────────────────── Aggregation core ────────────────────────────

const COMPLETED_STATUSES = new Set(['COMPLETED']);
const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELLING']);
const RETURNED_STATUSES = new Set(['RETURNED', 'KASPI_DELIVERY_RETURN_REQUESTED']);

function kpiOf(orders: KaspiOrder[]): KaspiPeriodKPI {
  const total = orders.length;
  let completed = 0;
  let cancelled = 0;
  let returned = 0;
  let revenue = 0;
  let kaspiDel = 0;
  for (const o of orders) {
    if (COMPLETED_STATUSES.has(o.status)) {
      completed++;
      revenue += o.total;
      if (o.isKaspiDelivery) kaspiDel++;
    } else if (CANCELLED_STATUSES.has(o.status)) cancelled++;
    else if (RETURNED_STATUSES.has(o.status)) returned++;
  }
  return {
    totalOrders: total,
    completedOrders: completed,
    cancelledOrders: cancelled,
    returnedOrders: returned,
    revenue,
    avgCheck: completed > 0 ? revenue / completed : 0,
    cancellationRate: total > 0 ? cancelled / total : 0,
    returnRate: total > 0 ? returned / total : 0,
    kaspiDeliveryShare: completed > 0 ? kaspiDel / completed : 0,
  };
}

function ymdInAlmaty(d: Date): string {
  // Almaty is UTC+5 (no DST). API timestamps are ms epoch in Almaty TZ semantics,
  // but `new Date(ms)` interprets them as UTC. We add 5h to get Almaty-local day.
  const shifted = new Date(d.getTime() + 5 * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, dd] = ymd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, dd + deltaDays));
  return d.toISOString().slice(0, 10);
}

function getAstanaTodayYmd(): string {
  return ymdInAlmaty(new Date());
}

function formatRu(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

function dateDiffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400_000);
}

// ─────────────────────────── Main aggregator ─────────────────────────────

async function _buildDashboard(startYmd: string, endYmd: string): Promise<KaspiDashboardData> {
  const days = dateDiffDays(startYmd, endYmd) + 1;
  const prevEndYmd = shiftYmd(startYmd, -1);
  const prevStartYmd = shiftYmd(prevEndYmd, -(days - 1));
  const todayYmd = getAstanaTodayYmd();
  const yesterdayYmd = shiftYmd(todayYmd, -1);

  // Convert YMDs to ms in Almaty (start of day → ms at UTC-5h)
  const ymdToMs = (ymd: string, endOfDay = false): number => {
    const [y, m, d] = ymd.split('-').map(Number);
    const ts = Date.UTC(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
    // Almaty (UTC+5): a "midnight in Almaty" is 5h BEFORE UTC midnight.
    return ts - 5 * 3600_000;
  };

  const fromMs = ymdToMs(startYmd);
  const toMs = ymdToMs(endYmd, true);
  const prevFromMs = ymdToMs(prevStartYmd);
  const prevToMs = ymdToMs(prevEndYmd, true);

  const [periodOrders, prevPeriodOrders] = await Promise.all([
    fetchOrdersInRange(fromMs, toMs),
    fetchOrdersInRange(prevFromMs, prevToMs),
  ]);

  const todayOrders = periodOrders.filter(o => o.date.slice(0, 10) === todayYmd);
  const yesterdayOrders = periodOrders.filter(o => o.date.slice(0, 10) === yesterdayYmd);

  const today = kpiOf(todayOrders);
  const yesterday = kpiOf(yesterdayOrders);
  const periodKpi = kpiOf(periodOrders);
  const prevPeriodKpi = kpiOf(prevPeriodOrders);

  // ─── Operational «right now» tiles ───
  // Принято сегодня = создан сегодня, прошёл этап банка (т.е. статус не APPROVED_BY_BANK).
  const acceptedTodayOrders = todayOrders.filter(o => o.status !== 'APPROVED_BY_BANK');
  const acceptedToday: KaspiOperationalTile = {
    count: acceptedTodayOrders.length,
    amount: acceptedTodayOrders.reduce((s, o) => s + o.total, 0),
  };
  // Выдано сегодня = COMPLETED сегодня (по дате создания, см. К.1.2 — точнее по дате
  // завершения, для этого нужен attributes.lastModifiedDate, добавим позже).
  const issuedTodayOrders = todayOrders.filter(o => COMPLETED_STATUSES.has(o.status));
  const issuedToday: KaspiOperationalTile = {
    count: issuedTodayOrders.length,
    amount: issuedTodayOrders.reduce((s, o) => s + o.total, 0),
  };
  // Сейчас в работе = на доставке/пункте выдачи и не завершён/отменён/возвращён.
  const IN_WORK_STATES = new Set(['DELIVERY', 'PICKUP', 'KASPI_DELIVERY', 'SIGN_REQUIRED']);
  const inWorkOrders = periodOrders.filter(o =>
    IN_WORK_STATES.has(o.state) &&
    !COMPLETED_STATUSES.has(o.status) &&
    !CANCELLED_STATUSES.has(o.status) &&
    !RETURNED_STATUSES.has(o.status),
  );
  const inWorkNow: KaspiOperationalTile = {
    count: inWorkOrders.length,
    amount: inWorkOrders.reduce((s, o) => s + o.total, 0),
  };

  // ─── Daily trend ───
  const dailyMap: Record<string, KaspiDailyPoint> = {};
  for (let i = 0; i < days; i++) {
    const d = shiftYmd(startYmd, i);
    dailyMap[d] = { date: d, orders: 0, completed: 0, revenue: 0, cancellations: 0 };
  }
  for (const o of periodOrders) {
    const d = o.date.slice(0, 10);
    const pt = dailyMap[d];
    if (!pt) continue;
    pt.orders++;
    if (COMPLETED_STATUSES.has(o.status)) {
      pt.completed++;
      pt.revenue += o.total;
    } else if (CANCELLED_STATUSES.has(o.status)) {
      pt.cancellations++;
    }
  }
  const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // ─── Status breakdown (all orders) ───
  const statusAccum: Record<string, { count: number; revenue: number }> = {};
  for (const o of periodOrders) {
    if (!statusAccum[o.status]) statusAccum[o.status] = { count: 0, revenue: 0 };
    statusAccum[o.status].count++;
    if (COMPLETED_STATUSES.has(o.status)) statusAccum[o.status].revenue += o.total;
  }
  const totalCount = periodOrders.length || 1;
  const byStatus: KaspiStatusBreakdown[] = Object.entries(statusAccum)
    .map(([status, v]) => ({
      status,
      label: KASPI_STATUS_LABELS[status] ?? status,
      color: KASPI_STATUS_COLORS[status] ?? '#6b7280',
      count: v.count,
      share: v.count / totalCount,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.count - a.count);

  // ─── Payment breakdown (only COMPLETED) ───
  const completed = periodOrders.filter(o => COMPLETED_STATUSES.has(o.status));
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0) || 1;
  const payAccum: Record<string, { count: number; revenue: number }> = {};
  for (const o of completed) {
    const k = o.paymentMode ?? 'UNKNOWN';
    if (!payAccum[k]) payAccum[k] = { count: 0, revenue: 0 };
    payAccum[k].count++;
    payAccum[k].revenue += o.total;
  }
  const byPayment: KaspiPaymentBreakdown[] = Object.entries(payAccum)
    .map(([m, v]) => ({
      paymentMode: m,
      label: KASPI_PAYMENT_LABELS[m] ?? m,
      count: v.count,
      revenue: v.revenue,
      share: v.revenue / totalRevenue,
      avgCheck: v.count > 0 ? v.revenue / v.count : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Delivery breakdown (only COMPLETED) ───
  const delAccum: Record<string, { count: number; revenue: number }> = {};
  for (const o of completed) {
    const k = o.deliveryMode ?? 'UNKNOWN';
    if (!delAccum[k]) delAccum[k] = { count: 0, revenue: 0 };
    delAccum[k].count++;
    delAccum[k].revenue += o.total;
  }
  const byDelivery: KaspiDeliveryBreakdown[] = Object.entries(delAccum)
    .map(([m, v]) => ({
      deliveryMode: m,
      label: KASPI_DELIVERY_LABELS[m] ?? m,
      count: v.count,
      revenue: v.revenue,
      share: v.revenue / totalRevenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Cancellation reasons ───
  const cancelled = periodOrders.filter(o => CANCELLED_STATUSES.has(o.status));
  const reasonAccum: Record<string, number> = {};
  for (const o of cancelled) {
    const r = o.cancellationReason || 'Не указана';
    reasonAccum[r] = (reasonAccum[r] || 0) + 1;
  }
  const cancellationReasons: KaspiCancellationReason[] = Object.entries(reasonAccum)
    .map(([reason, count]) => ({
      reason,
      count,
      share: cancelled.length > 0 ? count / cancelled.length : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ─── Cities (by destination, only COMPLETED) ───
  const cityAccum: Record<string, { count: number; revenue: number }> = {};
  for (const o of completed) {
    const c = o.deliveryCity || 'Не указан';
    if (!cityAccum[c]) cityAccum[c] = { count: 0, revenue: 0 };
    cityAccum[c].count++;
    cityAccum[c].revenue += o.total;
  }
  const topCities: KaspiCityRow[] = Object.entries(cityAccum)
    .map(([city, v]) => ({
      city,
      orders: v.count,
      revenue: v.revenue,
      share: v.revenue / totalRevenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  // ─── Customers (named) ───
  const custAccum: Record<string, { orders: number; revenue: number; lastDate: string; city: string | null }> = {};
  for (const o of completed) {
    const name = o.customerName;
    if (!name) continue;
    if (!custAccum[name]) custAccum[name] = { orders: 0, revenue: 0, lastDate: o.date, city: o.deliveryCity };
    custAccum[name].orders++;
    custAccum[name].revenue += o.total;
    if (o.date > custAccum[name].lastDate) custAccum[name].lastDate = o.date;
  }
  const allCust = Object.entries(custAccum).map(([name, v]) => ({
    name,
    orders: v.orders,
    revenue: v.revenue,
    avgCheck: v.orders > 0 ? v.revenue / v.orders : 0,
    lastOrderDate: v.lastDate,
    city: v.city,
  }));
  const topCustomers = [...allCust].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
  const totalCustomers = allCust.length;
  const repeatCustomers = allCust.filter(c => c.orders >= 2).length;

  // ─── Credit terms ───
  const creditAccum: Record<string, { orders: number; revenue: number }> = {};
  for (const o of completed) {
    if (o.paymentMode !== 'PAY_WITH_CREDIT') continue;
    const key = o.creditTerm == null ? 'null' : String(o.creditTerm);
    if (!creditAccum[key]) creditAccum[key] = { orders: 0, revenue: 0 };
    creditAccum[key].orders++;
    creditAccum[key].revenue += o.total;
  }
  const creditByTerm: KaspiCreditTerm[] = Object.entries(creditAccum)
    .map(([k, v]) => ({
      term: k === 'null' ? null : Number(k),
      orders: v.orders,
      revenue: v.revenue,
      avgCheck: v.orders > 0 ? v.revenue / v.orders : 0,
    }))
    .sort((a, b) => (a.term ?? 999) - (b.term ?? 999));

  const creditOrders = completed.filter(o => o.paymentMode === 'PAY_WITH_CREDIT' || o.paymentMode === 'PAY_WITH_INSTALLMENT');
  const creditRevenue = creditOrders.reduce((s, o) => s + o.total, 0);
  const creditShare = totalRevenue > 0 ? creditRevenue / totalRevenue : 0;

  // ─── Recent orders (last 100) ───
  const recentOrders = [...periodOrders]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 100);

  return {
    fetchedAt: new Date().toISOString(),
    config: getConfig(),
    period: {
      days,
      startDate: startYmd,
      endDate: todayYmd,
      label: days === 1 ? formatRu(todayYmd) : `${formatRu(startYmd)} — ${formatRu(todayYmd)}`,
    },
    today,
    yesterday,
    periodKpi,
    prevPeriodKpi,
    acceptedToday,
    issuedToday,
    inWorkNow,
    dailyTrend,
    byStatus,
    byPayment,
    byDelivery,
    cancellationReasons,
    topCities,
    topCustomers,
    totalCustomers,
    repeatCustomers,
    creditByTerm,
    creditRevenue,
    creditShare,
    recentOrders,
    completedOrders: periodOrders.filter(o => COMPLETED_STATUSES.has(o.status)),
    totalOrdersInPeriod: periodOrders.length,
  };
}

// ─────────────────────────── Public surface ──────────────────────────────

export function getConfig(): KaspiConfig {
  return {
    configured: !!KASPI_TOKEN,
    merchantId: KASPI_MERCHANT_ID,
    merchantName: KASPI_MERCHANT_NAME,
    apiBase: KASPI_API_BASE,
    tokenSet: !!KASPI_TOKEN,
  };
}

function _fetchKaspiDashboard(days: number = 14): Promise<KaspiDashboardData> {
  const todayYmd = getAstanaTodayYmd();
  const startYmd = shiftYmd(todayYmd, -(days - 1));
  return _buildDashboard(startYmd, todayYmd);
}

function _fetchKaspiDashboardByRange(from: string, to: string): Promise<KaspiDashboardData> {
  return _buildDashboard(from, to);
}

/**
 * Cached dashboard fetch — TTL 300s (5 min). Pages share the same data so
 * navigation между Kaspi-разделами не дёргает API повторно. Холодный fetch
 * Kaspi медленный (chunking по 14d × 6 states), поэтому большой TTL критичен.
 */
export const fetchKaspiDashboard = unstable_cache(
  _fetchKaspiDashboard,
  ['kaspi-marketplace-dashboard'],
  { revalidate: 300, tags: ['kaspi'] },
);

/** Cached fetch for an explicit date range (from/to in YYYY-MM-DD). TTL 300s. */
export const fetchKaspiDashboardByRange = unstable_cache(
  _fetchKaspiDashboardByRange,
  ['kaspi-dashboard-range'],
  { revalidate: 300, tags: ['kaspi'] },
);

/** Lightweight token validity check (used by /settings page). */
export async function probeKaspiToken(): Promise<{
  ok: boolean;
  totalCount: number;
  error: string | null;
}> {
  if (!KASPI_TOKEN) return { ok: false, totalCount: 0, error: 'KASPI_TOKEN not set' };
  try {
    const now = Date.now();
    const data = await fetchOrdersPage({
      pageNumber: 0,
      fromMs: now - 14 * 86400_000,
      toMs: now,
      state: 'ARCHIVE',
    });
    return { ok: true, totalCount: data.meta?.totalCount ?? 0, error: null };
  } catch (err) {
    return { ok: false, totalCount: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
