export type JetContext = {
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

export type Grid = {
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

export type ContextValue = {
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
