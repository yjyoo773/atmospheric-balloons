export {};

type Grid = {
  resDeg: number;
  cells: Record<
    string,
    {
      surface: number;
      upper: number;
      density: number;
      rarity: number;
    }
  >;
};

type ContextValue = {
  requested: { lat: number; lon: number };
  jet: {
    validTime: string;
    wind: { speed_ms: number; direction_deg: number | null };
  };
  rarity: {
    score: number;
    label: string;
    surfaceStationsInCell: number;
    upperAirStationsInCell: number;
    resDeg: number;
  };
  cache: { hit: boolean };
};

declare global {
  var __rarityGrid: Grid | undefined;
  var __contextCache: Map<string, { ts: number; value: ContextValue }> | undefined;
  var __balloonCache: CacheEntry | undefined;
}