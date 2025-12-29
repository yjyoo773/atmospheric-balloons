export type JetBand = "polar" | "subtropical" | "none";

export type JetContext = {
  isJetLike: boolean;
  band: "polar" | "subtropical";
  confidence: "low" | "medium" | "high";
  validTime: string;
  wind: {
    speed_ms: number;
    direction_deg: number | null;
  };
};

export type RarityContext = {
  score: number; // 0..100
  label: string;
  resDeg: number;
  surfaceStationsInCell: number;
  upperAirStationsInCell: number;
};

export type ContextResponse = {
  jet: JetContext;
  rarity: RarityContext;
};
