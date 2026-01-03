import { NextResponse } from "next/server";

function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type OpenMeteoResponse = {
  hourly?: {
    time?: string[];
    wind_speed_250hPa?: number[];
    wind_direction_250hPa?: number[];
  };
  hourly_units?: Record<string, string>;
  error?: boolean;
  reason?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const lat = toNum(searchParams.get("lat"));
  const lon = toNum(searchParams.get("lon"));

  if (lat == null || lon == null) {
    return NextResponse.json(
      { error: "Missing or invalid lat/lon query params." },
      { status: 400 }
    );
  }

  // Open-Meteo Forecast API
  // We request pressure-level winds at 250 hPa and constrain time range.
  // Docs: /v1/forecast with hourly variables; supports forecast_hours/past_hours. :contentReference[oaicite:1]{index=1}
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("hourly", "wind_speed_250hPa,wind_direction_250hPa");
  url.searchParams.set("past_hours", "3");
  url.searchParams.set("forecast_hours", "3");
  url.searchParams.set("cell_selection", "nearest");

  const res = await fetch(url.toString(), { cache: "no-store" });
  const data = (await res.json()) as OpenMeteoResponse;

  if (!res.ok || data?.error) {
    return NextResponse.json(
      {
        error: "Open-Meteo request failed",
        status: res.status,
        reason: data?.reason ?? "Unknown",
        hint: "If you see an invalid variable error, confirm the pressure-level wind variable names in Open-Meteo docs.",
      },
      { status: 502 }
    );
  }

  const times = data.hourly?.time ?? [];
  const ws = data.hourly?.wind_speed_250hPa ?? [];
  const wd = data.hourly?.wind_direction_250hPa ?? [];

  if (!times.length || ws.length !== times.length) {
    return NextResponse.json(
      { error: "Open-Meteo response missing expected hourly arrays." },
      { status: 502 }
    );
  }

  // Pick the latest timestep <= now (GMT). If none, take the first.
  const now = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (!Number.isFinite(t)) continue;
    if (t <= now) idx = i;
  }

  const windSpeedMs = ws[idx];
  const windDirDeg = wd[idx] ?? null;

  if (typeof windSpeedMs !== "number" || !Number.isFinite(windSpeedMs)) {
    return NextResponse.json(
      { error: "Invalid wind_speed_250hPa value from Open-Meteo." },
      { status: 502 }
    );
  }


  return NextResponse.json(
    {
      requested: { lat, lon, level: "250hPa" },
      validTime: times[idx],
      wind: {
        speed_ms: windSpeedMs,
        direction_deg: windDirDeg,
      },
      units: {
        speed: data.hourly_units?.wind_speed_250hPa ?? "m/s",
        direction: data.hourly_units?.wind_direction_250hPa ?? "°",
      },
    },
    { status: 200 }
  );
}
