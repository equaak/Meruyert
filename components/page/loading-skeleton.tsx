import { Topbar } from "@/components/topbar";

/**
 * Loading placeholder shown by Next.js while a Server Component
 * is fetching data. Mimics the PageShell + KPI strip + table layout
 * so the layout doesn't jump when content arrives.
 *
 * Animation: subtle pulse on bone-coloured blocks.
 */
export function LoadingSkeleton({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle ?? "Загружаем данные из 1С…"} />
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="mb-6 flex items-center justify-end gap-2">
          <Bar w="w-44" h="h-7" />
          <Bar w="w-24" h="h-7" />
        </div>

        {/* Headline */}
        <div className="mb-6 space-y-1.5">
          <Bar w="w-3/4" h="h-4" />
          <Bar w="w-1/2" h="h-4" />
        </div>

        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <Bar w="w-16" h="h-2.5" />
              <div className="mt-2"><Bar w="w-24" h="h-6" /></div>
              <div className="mt-2"><Bar w="w-20" h="h-3" /></div>
            </div>
          ))}
        </div>

        {/* Chart row */}
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <Bar w="w-32" h="h-3" />
            <div className="mt-4"><Bar w="w-full" h="h-32" /></div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <Bar w="w-32" h="h-3" />
            <div className="mt-4"><Bar w="w-full" h="h-32" /></div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <Bar w="w-40" h="h-3" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bar w="w-32" h="h-3" />
                <Bar w="flex-1" h="h-3" />
                <Bar w="w-20" h="h-3" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[11.5px] text-[var(--text-dim)]">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          <span>Первый запрос загружается до ~20 сек, дальше — мгновенно из кеша</span>
        </div>
      </div>
    </>
  );
}

function Bar({ w, h }: { w: string; h: string }) {
  return <div className={`${w} ${h} animate-pulse rounded bg-white/[0.06]`} />;
}
