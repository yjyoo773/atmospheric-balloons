import { NextResponse } from "next/server";

type CacheEntry = {
  timestampMs: number;
  hoursAgo: number;
  data: unknown;
};

// Persist across requests in dev/prod as long as the server process stays alive
declare global {
  var __balloonCache: CacheEntry | undefined;
}

function clampHoursAgo(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(23, Math.floor(v)));
}

async function fetchUpstream(hoursAgo: number): Promise<unknown> {
  const hh = String(hoursAgo).padStart(2, "0");
  const upstreamUrl = `https://a.windbornesystems.com/treasure/${hh}.json`;

  const res = await fetch(upstreamUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "windborne-balloons-nextjs",
    },
  });

  if (!res.ok) {
    // Surface status so caller can decide whether to fallback
    throw new Error(`Upstream ${hh}.json failed: ${res.status}`);
  }

  return res.json();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requestedHoursAgo = clampHoursAgo(Number(searchParams.get("hoursAgo") ?? "0"));

  // Build fallback chain: requested -> requested+1 -> ... -> 23
  const candidates: number[] = [];
  for (let h = requestedHoursAgo; h <= 23; h++) candidates.push(h);

  let lastError: unknown = null;

  // 1) Try upstream candidates in order
  for (const h of candidates) {
    try {
      const data = await fetchUpstream(h);

      // Cache last known good
      globalThis.__balloonCache = {
        timestampMs: Date.now(),
        hoursAgo: h,
        data,
      };

      // Tell the client what it received
      return NextResponse.json({ hoursAgo: h, source: "upstream", data }, { status: 200 });
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  // 2) If all upstream attempts failed, serve last-known-good cache if present
  if (globalThis.__balloonCache?.data) {
    const ageMs = Date.now() - globalThis.__balloonCache.timestampMs;

    return NextResponse.json(
      {
        hoursAgo: globalThis.__balloonCache.hoursAgo,
        source: "cache",
        cacheAgeSeconds: Math.round(ageMs / 1000),
        data: globalThis.__balloonCache.data,
      },
      { status: 200 }
    );
  }

  // 3) No cache available: fail hard (first run + upstream down)
  return NextResponse.json(
    {
      error: "No upstream data available and no cached fallback present.",
      details: lastError instanceof Error ? lastError.message : String(lastError),
    },
    { status: 502 }
  );
}
