import { PageShell, Section } from "@/components/page/page-shell";
import { probeKaspiToken, getConfig as getKaspiConfig } from "@/lib/kaspi-live";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function SettingsPage() {
  const kaspiConfig = getKaspiConfig();
  const kaspiProbe = kaspiConfig.tokenSet ? await probeKaspiToken() : null;

  return (
    <PageShell title="Настройки" subtitle="Подключение к Kaspi Shop API · переменные окружения · диагностика">
      <Section
        title="Подключение к Kaspi Marketplace"
        hint="Токен и Merchant UID берутся из Kaspi Merchant Cabinet → Настройки → API. X-Merchant-Uid обязателен — без него API отдаёт 0 заказов."
      >
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <Row label="Базовый URL" value={kaspiConfig.apiBase} mono />
          <Row label="Магазин (название)" value={kaspiConfig.merchantName} />
          <Row label="Merchant ID" value={kaspiConfig.merchantId || "не задан"} mono />
          <Row label="X-Auth-Token" value={kaspiConfig.tokenSet ? "✓ задан" : "✗ не задан"} tone={kaspiConfig.tokenSet ? 'ok' : 'err'} />
          {kaspiProbe && (
            <div className="mt-3 border-t border-[var(--border)] pt-3 text-[12px]">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">Проверка токена (live probe)</div>
              {kaspiProbe.ok ? (
                <div className="flex items-center gap-1.5 text-[var(--emerald)]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  HTTP 200 от /orders · merchant авторизуется · заказов в архиве за 14 дней: <span className="font-medium tabular">{kaspiProbe.totalCount}</span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-[var(--red)]">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <div>Ошибка проверки токена</div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-[var(--text-dim)]">{kaspiProbe.error}</div>
                    <div className="mt-1.5 text-[11.5px] text-[var(--text)]">{diagnoseKaspi(kaspiProbe.error || '')}</div>
                  </div>
                </div>
              )}
              {kaspiProbe.ok && kaspiProbe.totalCount === 0 && (
                <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[var(--amber)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    Токен авторизуется, но возвращает 0 заказов за 14 дней. Проверьте: правильный ли KASPI_MERCHANT_ID, есть ли продажи на kaspi.kz/shop у этого магазина, и не Kaspi-Pay ли это (там нет marketplace-заказов).
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Базовая авторизация UI">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[12.5px] text-[var(--text-dim)]">
          Вход в дашборд защищён через переменные <code className="text-[var(--text)]">NICHE_USER</code> и <code className="text-[var(--text)]">NICHE_PASS</code>. Если они не заданы — production-вариант middleware вернёт 500 при первом запросе.
        </div>
      </Section>

      <Section title="Полезные ссылки">
        <ul className="space-y-1 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-[12px] text-[var(--text-dim)]">
          <li>• <a className="underline text-[var(--accent)]" href="https://kaspi.kz/merchantcabinet/" target="_blank" rel="noreferrer">Kaspi Merchant Cabinet</a> — выпустить или ротировать токен</li>
          <li>• <a className="underline text-[var(--accent)]" href="https://guide.kaspi.kz/partner/ru/shop/api/work" target="_blank" rel="noreferrer">Документация Kaspi Shop API v2</a></li>
          <li>• Лимиты: одно окно запроса orders — 14 дней, page[size] — 100. Кеш дашборда — 300 сек.</li>
        </ul>
      </Section>
    </PageShell>
  );
}

function diagnoseKaspi(err: string): string {
  if (/401/.test(err)) return "Токен невалиден или просрочен. Перевыпустите его в Merchant Cabinet → Настройки → API и обновите KASPI_TOKEN в Vercel.";
  if (/403/.test(err)) return "Доступ запрещён. Проверьте, что KASPI_MERCHANT_ID соответствует магазину, к которому привязан токен.";
  if (/404/.test(err)) return "Endpoint не найден. Проверьте KASPI_API_BASE — должен быть https://kaspi.kz/shop/api/v2.";
  if (/таймаут|timeout|abort/i.test(err)) return "Kaspi не ответил вовремя. Обычно временно — попробуйте через минуту.";
  if (/ENOTFOUND|getaddrinfo/i.test(err)) return "DNS не резолвится. Проверьте, что в Vercel есть доступ к kaspi.kz.";
  return "Если ошибка повторяется — проверьте логи деплоя в Vercel и обратитесь в поддержку Kaspi Pay.";
}

function Row({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: 'ok' | 'err' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[var(--border)] last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
      <span className={
        (mono ? "font-mono " : "") +
        "text-[12px] tabular " +
        (tone === 'ok' ? "text-[var(--emerald)]" : tone === 'err' ? "text-[var(--red)]" : "text-[var(--text)]")
      }>{value}</span>
    </div>
  );
}
