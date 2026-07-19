import { NextResponse, type NextRequest } from "next/server";
import { fetchKaspiDashboard } from "@/lib/kaspi-live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_DAYS = new Set([1, 7, 14, 28]);

export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get("days");
  const parsed = daysParam ? Number(daysParam) : 14;
  const days = ALLOWED_DAYS.has(parsed) ? parsed : 14;

  try {
    const data = await fetchKaspiDashboard(days);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "kaspi_failed", message }, { status: 502 });
  }
}
