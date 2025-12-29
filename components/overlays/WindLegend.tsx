"use client";

import { useState } from "react";
import type { WindBin } from "@/lib/colors";
import { COLORS } from "@/lib/colors";

type Props = {
  top?: number;
  left?: number;
  width?: number;
  zIndex?: number;
};

const ITEMS: { bin: WindBin; label: string }[] = [
  { bin: "w0", label: "< 20 m/s" },
  { bin: "w1", label: "20–30 m/s" },
  { bin: "w2", label: "30–45 m/s" },
  { bin: "w3", label: "≥ 45 m/s" },
];

function binColor(bin: WindBin) {
  switch (bin) {
    case "w0":
      return COLORS.w0;
    case "w1":
      return COLORS.w1;
    case "w2":
      return COLORS.w2;
    case "w3":
      return COLORS.w3;
  }
}

export default function WindLegend({ top = 120, left = 12, width = 240, zIndex = 10 }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        zIndex,
        background: "white",
        padding: "10px 12px",
        borderRadius: 10,
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
        fontSize: 13,
        width,
      }}
    >
      {/* Header row (always visible) */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontWeight: 800,
          width: "100%",
          textAlign: "left",
        }}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand wind legend" : "Collapse wind legend"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <span style={{ fontSize: 12, opacity: 0.75 }}>{collapsed ? "▶" : "▼"}</span>
        <span>Upper-level wind (250 hPa)</span>
      </button>

      {!collapsed && (
        <>
          <div style={{ marginTop: 8 }}>
            {ITEMS.map((it) => (
              <div
                key={it.bin}
                style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: binColor(it.bin),
                    display: "inline-block",
                  }}
                />
                <span>{it.label}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
            Click a balloon to fetch local winds.
          </div>
        </>
      )}
    </div>
  );
}
