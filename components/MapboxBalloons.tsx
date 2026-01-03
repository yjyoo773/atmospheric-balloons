"use client";

import mapboxgl from "mapbox-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLatestBalloonsWithMeta, type BalloonPoint } from "@/lib/balloons";
import { COLORS, WindBin } from "@/lib/colors";
import DataStatusCard from "@/components/overlays/DataStatusCard";
import WindLegend from "@/components/overlays/WindLegend";
import BalloonPanel, { windBin250 } from "@/components/overlays/BalloonPanel";
import type { ContextResponse } from "@/types/types";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type Selected = {
  id: string;
  lat: number;
  lon: number;
  meta?: number;
};
type FeatureProps = { id: string; meta: number | null; windSpeedMs: number | null; windBin: WindBin };


function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const q = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
}

// Spatial hash bin size in degrees. Larger = faster, less precise.
const BIN_DEG = 1;

function binKey(lat: number, lon: number) {
  const x = Math.floor((lon + 180) / BIN_DEG);
  const y = Math.floor((lat + 90) / BIN_DEG);
  return `${y},${x}`;
}

function neighborBinKeys(lat: number, lon: number) {
  const x0 = Math.floor((lon + 180) / BIN_DEG);
  const y0 = Math.floor((lat + 90) / BIN_DEG);
  const keys: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      keys.push(`${y0 + dy},${x0 + dx}`);
    }
  }
  return keys;
}

export default function MapboxBalloons() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const inFlightRef = useRef(false);
  const fcRef = useRef<GeoJSON.FeatureCollection<GeoJSON.Point, FeatureProps> | null>(null);


  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  const [context, setContext] = useState<ContextResponse | { error: string } | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const [balloonsLoading, setBalloonsLoading] = useState(false);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);
  const [statusCollapsed, setStatusCollapsed] = useState(false);


  const [freshness, setFreshness] = useState<null | {
    hoursAgo: number;
    source: "upstream" | "cache";
    cacheAgeSeconds?: number;
    points: number;
    updatedAtIso: string;
  }>(null);

  const tokenPresent = useMemo(() => Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN), []);

  // Stable-ID state
  const nextIdRef = useRef(1);
  const prevByIdRef = useRef<Map<string, { lat: number; lon: number }>>(new Map());

  function assignStableIds(points: BalloonPoint[]) {
    // Build bins for previous points
    const prevById = prevByIdRef.current;
    const bins = new Map<string, { id: string; lat: number; lon: number }[]>();

    for (const [id, p] of prevById.entries()) {
      const k = binKey(p.lat, p.lon);
      const arr = bins.get(k) ?? [];
      arr.push({ id, lat: p.lat, lon: p.lon });
      bins.set(k, arr);
    }

    const usedPrevIds = new Set<string>();
    const out: { id: string; lat: number; lon: number; meta?: number; idx: number }[] = [];

    // Threshold: if the nearest previous point is within this, treat as same balloon
    const MATCH_KM = 150;

    for (let idx = 0; idx < points.length; idx++) {
      const p = points[idx];
      let bestId: string | null = null;
      let bestKm = Infinity;

      for (const nk of neighborBinKeys(p.lat, p.lon)) {
        const candidates = bins.get(nk);
        if (!candidates) continue;
        for (const c of candidates) {
          if (usedPrevIds.has(c.id)) continue;
          const km = haversineKm(p.lat, p.lon, c.lat, c.lon);
          if (km < bestKm) {
            bestKm = km;
            bestId = c.id;
          }
        }
      }

      if (bestId && bestKm <= MATCH_KM) {
        usedPrevIds.add(bestId);
        out.push({ id: bestId, lat: p.lat, lon: p.lon, meta: p.meta, idx });
      } else {
        const newId = `b${nextIdRef.current++}`;
        out.push({ id: newId, lat: p.lat, lon: p.lon, meta: p.meta, idx });
      }
    }

    // Update prev map for next refresh
    const newPrev = new Map<string, { lat: number; lon: number }>();
    for (const p of out) newPrev.set(p.id, { lat: p.lat, lon: p.lon });
    prevByIdRef.current = newPrev;

    return out;
  }

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;
    if (!tokenPresent) {
      setError("Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local");
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [0, 20],
      zoom: 1.6,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      // Source with clustering
      map.addSource("balloons", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 6,
      });

      // Cluster circles
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "balloons",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": COLORS.cluster,
          "circle-opacity": 0.8,
          "circle-radius": 18,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      // Cluster count labels
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "balloons",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Unclustered points
      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "balloons",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "windBin"],
            "w0", COLORS.w0,
            "w1", COLORS.w1,
            "w2", COLORS.w2,
            "w3", COLORS.w3,
            COLORS.w0, // default if missing
          ],
          "circle-opacity": 0.9,
          "circle-radius": 5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });

      // Cursor hints
      map.on("mouseenter", "unclustered", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));

      // Click cluster -> zoom in
      map.on("click", "clusters", async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features?.[0]?.properties?.cluster_id;
        const source = map.getSource("balloons") as mapboxgl.GeoJSONSource | undefined;
        if (clusterId == null || !source) return;

        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          if (zoom == null) return;

          const geom = features[0].geometry as GeoJSON.Point;
          const coords = geom.coordinates as [number, number];
          map.easeTo({ center: coords, zoom });
        });
      });

      // Click point -> open side panel
      map.on("click", "unclustered", (e) => {
        const f = e.features?.[0];
        if (!f) return;

        const geom = f.geometry as GeoJSON.Point;
        const coords = geom.coordinates as [number, number];
        const [lon, lat] = coords;

        // properties is not strongly typed, so treat it as a record and read safely
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const id = typeof props.id === "string" ? props.id : String(props.id ?? "");
        const meta = typeof props.meta === "number" ? props.meta : undefined;

        setSelected({ id, lat, lon, meta });

        setSelected({ id, lat, lon, meta });
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [tokenPresent]);

  const refreshBalloons = useCallback(async () => {
    if (inFlightRef.current) return; // hard lock
    inFlightRef.current = true;

    try {
      setBalloonsLoading(true);
      setError(null);

      const payload = await fetchLatestBalloonsWithMeta(0);
      const stabilized = assignStableIds(payload.points);

      setFreshness({
        hoursAgo: payload.hoursAgo,
        source: payload.source,
        cacheAgeSeconds: payload.cacheAgeSeconds,
        points: stabilized.length,
        updatedAtIso: new Date().toISOString(),
      });
      setLastUpdatedIso(new Date().toISOString());

      const fc: GeoJSON.FeatureCollection<GeoJSON.Point, FeatureProps> = {
        type: "FeatureCollection",
        features: stabilized.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: {
            id: p.id,
            meta: p.meta ?? null,
            windSpeedMs: null,
            windBin: "w0",
          },
        })),
      };

      fcRef.current = fc;

      const map = mapRef.current;
      if (!map) return;

      const source = map.getSource("balloons") as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      source.setData(fc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBalloonsLoading(false);
      inFlightRef.current = false;
    }
  }, []); 


  // Refresh loop (you can set to 60 minutes if you want, but leave at 60s for now)
  useEffect(() => {
    refreshBalloons();
    const id = setInterval(refreshBalloons, 60 * 60_000); // 1 hour
    return () => clearInterval(id);
  }, [refreshBalloons]);

  // Fetch context when selection changes
  useEffect(() => {
    if (!selected) return;

    (async () => {
      try {
        setContextLoading(true);
        setContext(null);

        const res = await fetch(`/api/context?lat=${selected.lat}&lon=${selected.lon}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as ContextResponse | { error?: string };
        if (!res.ok) {
          const errMsg = "error" in data && typeof data.error === "string" ? data.error : "Context API failed";
          throw new Error(errMsg);
        }
        setContext(data as ContextResponse);
        const ctx = data as ContextResponse;
        const speed = ctx.jet.wind.speed_ms;
        const bin = windBin250(speed);

        const fc = fcRef.current;
        const map = mapRef.current;
        if (fc && map) {
          // find the feature for this balloon id and update its properties
          for (const feat of fc.features) {
            const props = (feat.properties ?? {}) as Record<string, unknown>;
            if (props.id === selected.id) {
              (feat.properties).windSpeedMs = speed; // see note below
              (feat.properties).windBin = bin;
              break;
            }
          }

          const source = map.getSource("balloons") as mapboxgl.GeoJSONSource | undefined;
          source?.setData(fc);
        }
      } catch (e) {
        setContext({ error: e instanceof Error ? e.message : "Unknown error" });
      } finally {
        setContextLoading(false);
      }
    })();
  }, [selected]);

  const freshnessText = useMemo(() => {
    if (!freshness) return null;
    const parts: string[] = [];
    parts.push(`${freshness.points.toLocaleString()} balloons`);

    if (freshness.cacheAgeSeconds != null) parts.push(`cache age ${freshness.cacheAgeSeconds}s`);
    return parts.join(" • ");
  }, [freshness]);

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      {/* Freshness banner */}
      <DataStatusCard
        freshnessText={freshnessText}
        lastUpdatedIso={lastUpdatedIso}
        loading={balloonsLoading}
        onRefresh={refreshBalloons}
        onCollapsedChange={setStatusCollapsed}
      />
      <WindLegend top={statusCollapsed ? 68 : 120} left={12} />

      {error && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            zIndex: 10,
            background: "white",
            padding: 10,
            borderRadius: 10,
            boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
          }}
        >
          {error}
        </div>
      )}

      {/* Right-side panel (full height avoids Mapbox control collision) */}
      <BalloonPanel
        selected={selected}
        context={context}
        loading={contextLoading}
        onClose={() => setSelected(null)}
      />
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
