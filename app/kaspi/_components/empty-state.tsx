import { InboxIcon } from "lucide-react";
import type { KaspiConfig } from "@/lib/kaspi-live";

/**
 * Shown when fetchKaspiDashboard returns 0 orders. Explains the likely
 * reasons + what to do.
 */
export function KaspiEmptyState({ days, config }: { days: number; config: KaspiConfig }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex flex-col items-center text-center">
        <InboxIcon className="h-8 w-8 text-[var(--text-subtle)]" />
        <h3 className="mt-2 text-[14px] font-medium text-[var(--text)]">
          {days === 1 ? "Сегодня" : `За последние ${days} дней`} — нет заказов на Kaspi Marketplace
        </h3>
        <p className="mt-2 max-w-lg text-[12px] text-[var(--text-dim)]">
          Токен API подключён и работает (HTTP 200 от <code className="rounded bg-white/[0.06] px-1">/orders</code>),
          merchant <code className="rounded bg-white/[0.06] px-1">{config.merchantId}</code> успешно
          авторизуется. Но за этот период по нему не зарегистрировано ни одного заказа во всех
          состояниях (NEW / PICKUP / DELIVERY / KASPI_DELIVERY / ARCHIVE).
        </p>
        <div className="mt-4 grid gap-2 text-left text-[11.5px] text-[var(--text-dim)] max-w-lg w-full">
          <div className="rounded-md border border-[var(--border)] bg-white/[0.02] p-3">
            <div className="mb-1 font-medium text-[var(--text)]">Возможные причины</div>
            <ol className="ml-4 list-decimal space-y-1">
              <li>«Касса Kaspi» в 1С — это <b>Kaspi Pay</b> (оплата QR-кодом в физ. магазине), а не Marketplace.
                Эти платежи не попадают в /orders API.</li>
              <li>Merchant действительно не имел маркетплейс-продаж в этом окне.</li>
              <li>Токен от другого подмагазина того же юр.лица (если у клиента несколько Points of Service).</li>
            </ol>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-white/[0.02] p-3">
            <div className="mb-1 font-medium text-[var(--text)]">Что проверить с клиентом</div>
            <ul className="ml-4 list-disc space-y-1">
              <li>Продают ли они на kaspi.kz/shop (онлайн-маркетплейс) или только принимают Kaspi Pay?</li>
              <li>Если продают на маркетплейсе — был ли хотя бы один заказ за последние недели?</li>
              <li>Сходится ли цифра ID <code className="rounded bg-white/[0.06] px-1">{config.merchantId}</code> с тем, что они видят в Merchant Cabinet?</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
