import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

type Grid = {
  resDeg: number;
  weights: { surface: number; upperAir: number };
  cells: Record<string, { surface: number; upper: number; density: number; rarity: number }>;
};

declare global {
  var __rarityGrid: Grid | undefined;
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

async function loadGrid(): Promise<Grid> {
  if (globalThis.__rarityGrid) return globalThis.__rarityGrid;

  const filePath = path.join(process.cwd(), "public", "rarity-grid.json");
  const txt = await fs.readFile(filePath, "utf-8");
  const grid = JSON.parse(txt) as Grid;

  globalThis.__rarityGrid = grid;
  return grid;
}

function label(score: number) {
  if (score >= 90) return "very rare";
  if (score >= 70) return "rare";
  if (score >= 40) return "uncommon";
  return "common";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Missing/invalid lat/lon" }, { status: 400 });
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "lat/lon out of range" }, { status: 400 });
  }

  const grid = await loadGrid();
  const k = cellKey(lat, lon, grid.resDeg);
  const cell = grid.cells[k];

  // If a cell has no stations at all, treat as maximally rare
  const rarityScore = cell?.rarity ?? 100;
  const surface = cell?.surface ?? 0;
  const upper = cell?.upper ?? 0;

  return NextResponse.json({
    requested: { lat, lon },
    resDeg: grid.resDeg,
    rarity: {
      score: rarityScore,
      label: label(rarityScore),
      surfaceStationsInCell: surface,
      upperAirStationsInCell: upper,
    },
  });
}
