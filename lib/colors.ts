export const COLORS = {
  cluster: "#dc2626",
  polar: "#2563eb", // blue-600
  subtropical: "#f97316",
  none: "#9ca3af",

  w0: "#9ca3af", // < 20
  w1: "#60a5fa", // 20–30
  w2: "#f97316", // 30–45
  w3: "#7c3aed", // >= 45
} as const;
export type WindBin = "w0" | "w1" | "w2" | "w3";

export type JetBand = "polar" | "subtropical" | "none";
