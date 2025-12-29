"use client";

import { useState } from "react";

type Props = {
  freshnessText: string | null;
  lastUpdatedIso: string | null;
  loading: boolean;
  onRefresh: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export default function DataStatusCard({ freshnessText, lastUpdatedIso, loading, onRefresh, onCollapsedChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // If there's no data yet, you can still render a minimal card
  const updatedLabel = lastUpdatedIso
    ? `Updated: ${new Date(lastUpdatedIso).toLocaleTimeString()}`
    : "Updated: —";

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 12,
        background: "white",
        padding: "10px 12px",
        borderRadius: 10,
        boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
        width: 320,
      }}
    >
      {/* Header row (always visible) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button
          onClick={() => {
            setCollapsed((v) => {
              const next = !v;
              onCollapsedChange?.(next);
              return next;
            });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontWeight: 800,
          }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand data status" : "Collapse data status"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <span style={{ fontSize: 12, opacity: 0.75 }}>{collapsed ? "▶" : "▼"}</span>
          <span>Data status</span>
        </button>

        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            border: "1px solid #d1d5db",
            background: loading ? "#e5e7eb" : "#ffffff",
            padding: "6px 10px",
            borderRadius: 10,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
          title="Fetch the latest balloon snapshot"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Collapsible content */}
      {!collapsed && (
        <>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
            {freshnessText ?? "—"}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>{updatedLabel}</div>
        </>
      )}
    </div>
  );
}
