export type BalloonPoint = {
  lat: number;
  lon: number;
  meta?: number; 
};

export type BalloonsPayload = {
  hoursAgo: number;
  source: "upstream" | "cache";
  cacheAgeSeconds?: number;
  points: BalloonPoint[];
};

type ApiWrapper = { data: unknown };

type BalloonsApiResponse = {
  hoursAgo?: number;
  source?: "upstream" | "cache";
  cacheAgeSeconds?: number;
  data?: unknown;
};

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}


function unwrapPayload(raw: unknown): unknown {
  if (isRecord(raw) && "data" in raw) {
    return (raw as ApiWrapper).data;
  }
  return raw;
}

export async function fetchLatestBalloons(hoursAgo: number = 0): Promise<BalloonPoint[]> {
  const res = await fetch(`/api/balloons?hoursAgo=${hoursAgo}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API fetch failed: ${res.status}`);

  const raw: unknown = await res.json(); // may be wrapper {data:...} or direct
  return extractLatestPositions(raw);
}

function normalizePoint(p: unknown): BalloonPoint | null {
  if (!Array.isArray(p) || p.length < 2) return null;

  const a = p[0];
  const b = p[1];
  const meta = p[2];

  if (!isNumber(a) || !isNumber(b)) return null;

  // Detect lon/lat vs lat/lon
  const looksLikeLonLat = Math.abs(a) > 90 && Math.abs(b) <= 90;
  const lat = looksLikeLonLat ? b : a;
  const lon = looksLikeLonLat ? a : b;

  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { lat, lon, meta: isNumber(meta) ? meta : undefined };
}

function isFlatPointsShape(data: unknown): data is unknown[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true; // empty is valid; caller handles
  const first = data[0];
  return Array.isArray(first) && first.length >= 2 && isNumber(first[0]) && isNumber(first[1]);
}

function isTracksShape(data: unknown): data is unknown[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true; // empty is valid
  const firstTrack = data[0];
  if (!Array.isArray(firstTrack) || firstTrack.length === 0) return false;
  const firstPoint = firstTrack[0];
  return Array.isArray(firstPoint) && firstPoint.length >= 2 && isNumber(firstPoint[0]) && isNumber(firstPoint[1]);
}

function extractLatestPositions(raw: unknown): BalloonPoint[] {
  const data = unwrapPayload(raw);

  if (Array.isArray(data) && data.length === 0) return [];

  // Shape A: flat list of points
  if (isFlatPointsShape(data)) {
    return (data as unknown[]).map(normalizePoint).filter((x): x is BalloonPoint => Boolean(x));
  }

  // Shape B: list of tracks -> take last point of each track
  if (isTracksShape(data)) {
    const tracks = data as unknown[];

    return tracks
      .map((track) => (Array.isArray(track) && track.length ? track[track.length - 1] : null))
      .map(normalizePoint)
      .filter((x): x is BalloonPoint => Boolean(x));
  }

  // Give a helpful error with a tiny shape preview
  const preview = (() => {
    try {
      return JSON.stringify(data).slice(0, 200);
    } catch {
      return String(data);
    }
  })();

  throw new Error(`Unexpected balloon data shape. Preview: ${preview}`);
}

export async function fetchLatestBalloonsWithMeta(hoursAgo: number = 0): Promise<BalloonsPayload> {
  const res = await fetch(`/api/balloons?hoursAgo=${hoursAgo}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API fetch failed: ${res.status}`);

  const raw: unknown = await res.json();

  // We allow either:
  // - { hoursAgo, source, cacheAgeSeconds, data } (preferred)
  // - wrapper shapes, etc., and we still extract points via extractLatestPositions(raw)
  const points = extractLatestPositions(raw);

  // Best-effort metadata extraction (without any)
  let meta: BalloonsApiResponse | null = null;
  if (isRecord(raw)) meta = raw as BalloonsApiResponse;

  const resolvedHoursAgo =
    meta?.hoursAgo != null && isNumber(meta.hoursAgo) ? meta.hoursAgo : hoursAgo;

  const resolvedSource =
    meta?.source === "cache" || meta?.source === "upstream" ? meta.source : "upstream";

  const resolvedCacheAgeSeconds =
    meta?.cacheAgeSeconds != null && isNumber(meta.cacheAgeSeconds)
      ? meta.cacheAgeSeconds
      : undefined;

  return {
    hoursAgo: resolvedHoursAgo,
    source: resolvedSource,
    cacheAgeSeconds: resolvedCacheAgeSeconds,
    points,
  };
}
