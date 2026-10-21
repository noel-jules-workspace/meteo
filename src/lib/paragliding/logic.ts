export interface SiteProfile {
  id: string;
  name: string;
  idealWindDirMin: number;
  idealWindDirMax: number;
  idealSpeedMinKmh: number;
  idealSpeedMaxKmh: number;
  maxGustVarianceKmh: number; // e.g. gust should not exceed speed by this amount
}

export const PRESET_PROFILES: Record<string, SiteProfile> = {
  'fps-south': {
    id: 'fps-south',
    name: 'FPS South Side',
    idealWindDirMin: 160,
    idealWindDirMax: 210,
    idealSpeedMinKmh: 12,
    idealSpeedMaxKmh: 28,
    maxGustVarianceKmh: 8,
  },
  'kobern-rosenberg': {
    id: 'kobern-rosenberg',
    name: 'Kobern-Gondorf Rosenberg',
    idealWindDirMin: 160,
    idealWindDirMax: 230,
    idealSpeedMinKmh: 10,
    idealSpeedMaxKmh: 20,
    maxGustVarianceKmh: 6,
  }
};

export interface ScoreResult {
  score: number; // 0-100
  breakdown: string[];
}

export function calculateSoaringScore(
  profile: SiteProfile,
  speedKmh: number,
  gustKmh: number,
  dirDeg: number,
  rainProb: number,
  blh: number
): ScoreResult {
  let score = 100;
  const breakdown: string[] = [];

  // Wind Direction
  // Handle circular math for sectors
  let dirMatch = false;
  if (profile.idealWindDirMin < profile.idealWindDirMax) {
    dirMatch = dirDeg >= profile.idealWindDirMin && dirDeg <= profile.idealWindDirMax;
  } else {
    // Crosses North
    dirMatch = dirDeg >= profile.idealWindDirMin || dirDeg <= profile.idealWindDirMax;
  }

  if (!dirMatch) {
    score -= 40;
    breakdown.push('Wind direction out of optimal sector (-40)');
  } else {
    breakdown.push('Wind direction optimal (+0)');
  }

  // Wind Speed
  if (speedKmh < profile.idealSpeedMinKmh) {
    const diff = profile.idealSpeedMinKmh - speedKmh;
    const pen = Math.min(diff * 5, 30);
    score -= pen;
    breakdown.push(`Wind speed too light (-${Math.round(pen)})`);
  } else if (speedKmh > profile.idealSpeedMaxKmh) {
    const diff = speedKmh - profile.idealSpeedMaxKmh;
    const pen = Math.min(diff * 10, 60);
    score -= pen;
    breakdown.push(`Wind speed too strong (-${Math.round(pen)})`);
  } else {
    breakdown.push('Wind speed optimal (+0)');
  }

  // Gust Variance
  const variance = gustKmh - speedKmh;
  if (variance > profile.maxGustVarianceKmh) {
    const diff = variance - profile.maxGustVarianceKmh;
    const pen = Math.min(diff * 8, 40);
    score -= pen;
    breakdown.push(`Gust variance too high (-${Math.round(pen)})`);
  }

  // Rain
  if (rainProb > 10) {
    const pen = Math.min(rainProb, 80);
    score -= pen;
    breakdown.push(`Rain probability penalty (-${Math.round(pen)})`);
  }

  // Thermal BLH Bonus
  if (blh > 1000) {
    const bonus = Math.min((blh - 1000) / 100, 10);
    score += bonus;
    breakdown.push(`Good thermal boundary layer (+${Math.round(bonus)})`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score: Math.round(score),
    breakdown
  };
}
