import fs from "node:fs/promises";
import path from "node:path";

const ISD_URL = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.txt";
const IGRA_URL = "https://www.ncei.noaa.gov/pub/data/igra/igra2-station-list.txt";

// Grid resolution in degrees (2° is a good hackathon default)
const RES = 2;

// Weighting: radiosonde sites are rarer / more “in-situ valuable”
const W_SURFACE = 1;
const W_UPPER_AIR = 4;

function clampLon(lon) {
  // map [-180,180) convention
  let x = lon;
  while (x < -180) x += 360;
  while (x >= 180) x -= 360;
  return x;
}

function cellKey(lat, lon) {
  // cell indices
  const latIdx = Math.floor((lat + 90) / RES); // 0..(180/RES - 1)
  const lonIdx = Math.floor((clampLon(lon) + 180) / RES); // 0..(360/RES - 1)
  return `${latIdx},${lonIdx}`;
}

function parseFixedWidthFloat(s) {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

// ISD: fixed-width lines, lat/lon fields exist; skip header lines
function parseISD(text) {
  const lines = text.split("\n");
  const pts = [];
  for (const line of lines) {
    if (!line) continue;
    // Heuristic: data lines generally start with digits for USAF/WBAN
    if (!/^\d/.test(line)) continue;

    // ISD format places LAT/LON as fixed-width fields in many dumps.
    // We’ll use a robust fallback: extract the last 3 numeric floats (lat, lon, elev) if present.
    const floats = line.match(/-?\d+\.\d+/g);
    if (!floats || floats.length < 2) continue;

    // Usually lat/lon appear before elevation; take the last 2–3 floats and interpret.
    // Many lines end with: LAT LON ELEV(M)
    const lat = Number(floats[floats.length - 3] ?? floats[floats.length - 2]);
    const lon = Number(floats[floats.length - 2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    pts.push({ lat, lon });
  }
  return pts;
}

// IGRA2 station list is fixed-width-ish but reliably contains lat/lon floats.
// We extract floats and keep the pair that looks like (lat, lon).
function parseIGRA(text) {
  const lines = text.split("\n");
  const pts = [];
  for (const line of lines) {
    if (!line) continue;
    const floats = line.match(/-?\d+\.\d+/g);
    if (!floats || floats.length < 2) continue;

    // find a pair that matches lat/lon ranges
    for (let i = 0; i < floats.length - 1; i++) {
      const a = Number(floats[i]);
      const b = Number(floats[i + 1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const aLat = Math.abs(a) <= 90 && Math.abs(b) <= 180;
      const bLat = Math.abs(b) <= 90 && Math.abs(a) <= 180;

      // prefer the interpretation where first is lat, second lon
      if (aLat) {
        pts.push({ lat: a, lon: b });
        break;
      }
      // fallback if swapped
      if (bLat) {
        pts.push({ lat: b, lon: a });
        break;
      }
    }
  }
  return pts;
}

function percentileScores(densities) {
  // densities: array of numbers
  const sorted = [...densities].sort((a, b) => a - b);
  const n = sorted.length;

  // map density -> rank (handle ties by first index)
  const firstIndex = new Map();
  for (let i = 0; i < n; i++) {
    if (!firstIndex.has(sorted[i])) firstIndex.set(sorted[i], i);
  }

  return (d) => {
    const r = firstIndex.get(d) ?? 0;
    const p = n <= 1 ? 0 : r / (n - 1); // 0..1
    // rarity = 1 - density percentile
    return Math.round(100 * (1 - p));
  };
}

async function main() {
  console.log("Downloading station lists…");
  const [isdRes, igraRes] = await Promise.all([fetch(ISD_URL), fetch(IGRA_URL)]);
  if (!isdRes.ok) throw new Error(`ISD download failed: ${isdRes.status}`);
  if (!igraRes.ok) throw new Error(`IGRA download failed: ${igraRes.status}`);

  const [isdText, igraText] = await Promise.all([isdRes.text(), igraRes.text()]);

  console.log("Parsing ISD…");
  const isdPts = parseISD(isdText);
  console.log(`ISD points: ${isdPts.length}`);

  console.log("Parsing IGRA…");
  const igraPts = parseIGRA(igraText);
  console.log(`IGRA points: ${igraPts.length}`);

  const cells = new Map(); // key -> {surface, upper}
  for (const p of isdPts) {
    const k = cellKey(p.lat, p.lon);
    const v = cells.get(k) ?? { surface: 0, upper: 0 };
    v.surface += 1;
    cells.set(k, v);
  }
  for (const p of igraPts) {
    const k = cellKey(p.lat, p.lon);
    const v = cells.get(k) ?? { surface: 0, upper: 0 };
    v.upper += 1;
    cells.set(k, v);
  }

  // Build density list
  const entries = [];
  const densities = [];
  for (const [k, v] of cells.entries()) {
    const density = v.surface * W_SURFACE + v.upper * W_UPPER_AIR;
    entries.push([k, { ...v, density }]);
    densities.push(density);
  }

  const rarityOf = percentileScores(densities);

  // Final JSON format: { resDeg, weights, cells: { "latIdx,lonIdx": {surface, upper, density, rarity} } }
  const out = {
    generatedAt: new Date().toISOString(),
    resDeg: RES,
    weights: { surface: W_SURFACE, upperAir: W_UPPER_AIR },
    cellCount: entries.length,
    cells: Object.fromEntries(entries.map(([k, v]) => [k, { ...v, rarity: rarityOf(v.density) }])),
  };

  const outPath = path.join(process.cwd(), "public", "rarity-grid.json");
  await fs.writeFile(outPath, JSON.stringify(out), "utf-8");
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
