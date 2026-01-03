import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { Grid, ContextValue } from "@/types/types";

function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// type Grid = {
//   resDeg: number;
//   cells: Record<string, { surface: number; upper: number; density: number; rarity: number }>;
// };

// type ContextValue = {
//   requested: { lat: number; lon: number };
//   jet: {
//     validTime: string;
//     wind: { speed_ms: number; direction_deg: number | null };
//   };
//   rarity: {
//     score: number;
//     label: string;
//     surfaceStationsInCell: number;
//     upperAirStationsInCell: number;
//     resDeg: number;
//   };
//   cache: { hit: boolean };
// };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

function clampLon(lon: number) {
  let x = lon;
  while (x < -180) x += 360;
  while (x >= 180) x -= 360;
  return x;
}

function cellKey(lat: number, lon: number, resDeg: number) {
  const latIdx = Math.floor((lat + 90) / resDeg);
  const lonIdx = Math.floor((clampLon(lon) + 180) / resDeg);
  return `${latIdx},${lonIdx}`;
}

function rarityLabel(score: number) {
  if (score >= 90) return "very rare";
  if (score >= 70) return "rare";
  if (score >= 40) return "uncommon";
  return "common";
}

async function loadGrid(): Promise<Grid> {
  if (globalThis.__rarityGrid) return globalThis.__rarityGrid;

  const filePath = path.join(process.cwd(), "public", "rarity-grid.json");
  const txt = await fs.readFile(filePath, "utf-8");
  const grid = JSON.parse(txt) as Grid;

  globalThis.__rarityGrid = grid;
  return grid;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = toNum(searchParams.get("lat"));
  const lon = toNum(searchParams.get("lon"));

  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Missing/invalid lat/lon" }, { status: 400 });
  }

  // Simple in-memory cache (10 minutes) keyed by rounded lat/lon
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const now = Date.now();
  if (!globalThis.__contextCache) globalThis.__contextCache = new Map();

  const cached = globalThis.__contextCache.get(key);
  if (cached && now - cached.ts < 10 * 60_000) {
    return NextResponse.json({ ...cached.value, cache: { hit: true } }, { status: 200 });
  }

  // Jet: Open-Meteo
  const om = new URL("https://api.open-meteo.com/v1/forecast");
  om.searchParams.set("latitude", String(lat));
  om.searchParams.set("longitude", String(lon));
  om.searchParams.set("timezone", "GMT");
  om.searchParams.set("wind_speed_unit", "ms");
  om.searchParams.set("hourly", "wind_speed_250hPa,wind_direction_250hPa");
  om.searchParams.set("past_hours", "3");
  om.searchParams.set("forecast_hours", "3");
  om.searchParams.set("cell_selection", "nearest");

  const omRes = await fetch(om.toString(), { cache: "no-store" });
  const omJson: unknown = await omRes.json();

  // Handle Open-Meteo error responses safely (no `any`)
  if (!omRes.ok) {
    const reason =
      isRecord(omJson) && typeof omJson.reason === "string" ? omJson.reason : "Unknown";
    return NextResponse.json(
      { error: "Open-Meteo failed", status: omRes.status, reason },
      { status: 502 }
    );
  }

  if (!isRecord(omJson)) {
    return NextResponse.json({ error: "Open-Meteo invalid JSON shape" }, { status: 502 });
  }

  if (omJson.error === true) {
    const reason = typeof omJson.reason === "string" ? omJson.reason : "Unknown";
    return NextResponse.json({ error: "Open-Meteo failed", status: 502, reason }, { status: 502 });
  }

  const hourly = omJson.hourly;
  if (!isRecord(hourly)) {
    return NextResponse.json({ error: "Open-Meteo missing hourly" }, { status: 502 });
  }

  const times = hourly.time;
  const ws = hourly.wind_speed_250hPa;
  const wd = hourly.wind_direction_250hPa;

  if (!isStringArray(times) || !isNumberArray(ws)) {
    return NextResponse.json({ error: "Open-Meteo missing arrays" }, { status: 502 });
  }

  // wind_direction may be missing; handle gracefully
  const wdArr = isNumberArray(wd) ? wd : [];

  if (!times.length || ws.length !== times.length) {
    return NextResponse.json({ error: "Open-Meteo missing arrays" }, { status: 502 });
  }

  const nowMs = Date.now();
  let idx = 0;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (Number.isFinite(t) && t <= nowMs) idx = i;
  }

  const windSpeed = ws[idx];
  const windDir = Number.isFinite(wdArr[idx]) ? wdArr[idx] : null;

  // Rarity: grid lookup
  const grid = await loadGrid();
  const k = cellKey(lat, lon, grid.resDeg);
  const cell = grid.cells[k];

  const rarityScore = cell?.rarity ?? 100;
  const rarity = {
    score: rarityScore,
    label: rarityLabel(rarityScore),
    surfaceStationsInCell: cell?.surface ?? 0,
    upperAirStationsInCell: cell?.upper ?? 0,
    resDeg: grid.resDeg,
  };

  const value: ContextValue = {
    requested: { lat, lon },
    jet: {
      validTime: times[idx],
      wind: { speed_ms: windSpeed, direction_deg: windDir },
    },
    rarity,
    cache: { hit: false },
  };

  globalThis.__contextCache.set(key, { ts: now, value });
  return NextResponse.json(value, { status: 200 });
}
