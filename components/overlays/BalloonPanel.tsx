"use client";

import type { ContextResponse } from "@/types/types";
import type { WindBin } from "@/lib/colors";

type Selected = {
  id: string;
  lat: number;
  lon: number;
  meta?: number;
};

type Props = {
  selected: Selected | null;
  context: ContextResponse | { error: string } | null;
  loading: boolean;
  onClose: () => void;
};

export function windBin250(speedMs: number): WindBin {
  if (speedMs >= 45) return "w3";
  if (speedMs >= 30) return "w2";
  if (speedMs >= 20) return "w1";
  return "w0";
}

function isErrorContext(x: Props["context"]): x is { error: string } {
  return !!x && typeof (x as any).error === "string";
}
function isDataContext(x: Props["context"]): x is ContextResponse {
  return !!x && !("error" in x);
}

export default function BalloonPanel({ selected, context, loading, onClose }: Props) {
  if (!selected) return null;

  const hasError = isErrorContext(context);
  const hasData = isDataContext(context);

  const windSpeed = hasData ? context.jet.wind.speed_ms : null;
  const windDir = hasData ? context.jet.wind.direction_deg : null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 380,
        height: "100%",
        zIndex: 10,
        background: "white",
        padding: 16,
        boxShadow: "-2px 0 12px rgba(0,0,0,0.18)",
        overflowY: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Balloon {selected.id}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Lat {selected.lat.toFixed(3)} • Lon {selected.lon.toFixed(3)}
          </div>

          {/* Optional: show meta if later identify units */}
          {/* {selected.meta != null && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Meta: {selected.meta} (units unknown)</div>
          )} */}
        </div>

        <button onClick={onClose}>Close</button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* Upper-level winds */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Upper-level wind (250 hPa)</div>

        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading…</div>
        ) : hasError ? (
          <div style={{ opacity: 0.75 }}>Error: {(context as { error: string }).error}</div>
        ) : hasData ? (
          <div style={{ lineHeight: 1.45 }}>
            <div style={{ marginTop: 4 }}>
              <strong>Wind:</strong> {windSpeed!.toFixed(1)} m/s
              {windDir != null ? ` • ${Math.round(windDir)}°` : ""}
            </div>

            <div style={{ marginTop: 6 }}>
              <strong>Wind:</strong> {windSpeed != null ? windSpeed.toFixed(1) : "—"} m/s
            </div>

            <div style={{ opacity: 0.7, marginTop: 6 }}>
              Valid: {context.jet.validTime}
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.75 }}>—</div>
        )}
      </div>

      {/* Rarity */}
      <div>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Data Rarity</div>

        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading…</div>
        ) : hasError ? (
          <div style={{ opacity: 0.75 }}>—</div>
        ) : hasData ? (
          <div style={{ lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700 }}>
              Rarity: {context.rarity.score}/100 ({context.rarity.label})
            </div>

            <div style={{ marginTop: 8 }}>
              <strong>Surface stations:</strong> {context.rarity.surfaceStationsInCell}
            </div>

            <div>
              <strong>Upper-air sites:</strong> {context.rarity.upperAirStationsInCell}
            </div>

            <div style={{ opacity: 0.7, marginTop: 6 }}>
              Grid: {context.rarity.resDeg}° cells
            </div>

            <div style={{ opacity: 0.65, marginTop: 8, fontSize: 12 }}>
              Meaning: conventional observations are sparse in this area.
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.75 }}>—</div>
        )}
      </div>
    </div>
  );
}
