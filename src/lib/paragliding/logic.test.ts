import { describe, it, expect } from 'vitest';
import { calculateSoaringScore, SiteProfile, PRESET_PROFILES } from './logic';

describe('Paragliding Logic - calculateSoaringScore', () => {
  const testProfile: SiteProfile = {
    id: 'test',
    name: 'Test Site',
    idealWindDirMin: 180,
    idealWindDirMax: 220,
    idealSpeedMinKmh: 15,
    idealSpeedMaxKmh: 25,
    maxGustVarianceKmh: 10,
  };

  const northProfile: SiteProfile = {
    ...testProfile,
    id: 'north',
    name: 'North Site',
    idealWindDirMin: 340,
    idealWindDirMax: 20, // Crosses north
  };

  it('calculates optimal score', () => {
    const result = calculateSoaringScore(testProfile, 20, 25, 200, 0, 800);
    expect(result.score).toBe(100);
    expect(result.breakdown).toContain('Wind direction optimal (+0)');
    expect(result.breakdown).toContain('Wind speed optimal (+0)');
  });

  it('penalizes out of sector wind direction', () => {
    const result = calculateSoaringScore(testProfile, 20, 25, 90, 0, 800);
    expect(result.score).toBe(60); // 100 - 40
    expect(result.breakdown).toContain('Wind direction out of optimal sector (-40)');
  });

  it('handles crossing north sector correctly (optimal)', () => {
    const result = calculateSoaringScore(northProfile, 20, 25, 10, 0, 800);
    expect(result.score).toBe(100);
  });

  it('handles crossing north sector correctly (out of sector)', () => {
    const result = calculateSoaringScore(northProfile, 20, 25, 180, 0, 800);
    expect(result.score).toBe(60);
  });

  it('penalizes wind speed too light', () => {
    const result = calculateSoaringScore(testProfile, 10, 15, 200, 0, 800);
    // diff = 15 - 10 = 5. penalty = 5 * 5 = 25
    expect(result.score).toBe(75);
    expect(result.breakdown).toContain('Wind speed too light (-25)');
  });

  it('caps wind speed too light penalty at 30', () => {
    const result = calculateSoaringScore(testProfile, 5, 10, 200, 0, 800);
    // diff = 15 - 5 = 10. penalty = 10 * 5 = 50 -> capped at 30
    expect(result.score).toBe(70);
  });

  it('penalizes wind speed too strong', () => {
    const result = calculateSoaringScore(testProfile, 28, 30, 200, 0, 800);
    // diff = 28 - 25 = 3. penalty = 3 * 10 = 30
    expect(result.score).toBe(70);
    expect(result.breakdown).toContain('Wind speed too strong (-30)');
  });

  it('caps wind speed too strong penalty at 60', () => {
    const result = calculateSoaringScore(testProfile, 35, 40, 200, 0, 800);
    // diff = 35 - 25 = 10. penalty = 10 * 10 = 100 -> capped at 60
    expect(result.score).toBe(40);
  });

  it('penalizes gust variance too high', () => {
    const result = calculateSoaringScore(testProfile, 20, 32, 200, 0, 800);
    // variance = 32 - 20 = 12. max = 10. diff = 2. penalty = 2 * 8 = 16
    expect(result.score).toBe(84);
    expect(result.breakdown).toContain('Gust variance too high (-16)');
  });

  it('caps gust variance penalty at 40', () => {
    const result = calculateSoaringScore(testProfile, 20, 40, 200, 0, 800);
    // variance = 40 - 20 = 20. max = 10. diff = 10. penalty = 10 * 8 = 80 -> capped at 40
    expect(result.score).toBe(60);
  });

  it('penalizes rain probability', () => {
    const result = calculateSoaringScore(testProfile, 20, 25, 200, 20, 800);
    expect(result.score).toBe(80); // 100 - 20
    expect(result.breakdown).toContain('Rain probability penalty (-20)');
  });

  it('caps rain penalty at 80', () => {
    const result = calculateSoaringScore(testProfile, 20, 25, 200, 90, 800);
    expect(result.score).toBe(20);
  });

  it('bonuses high thermal boundary layer', () => {
    const result = calculateSoaringScore(testProfile, 20, 25, 200, 0, 1500);
    // bonus = (1500 - 1000) / 100 = 5
    expect(result.score).toBe(100); // Max score is 100
    expect(result.breakdown).toContain('Good thermal boundary layer (+5)');
  });

  it('ensures score does not drop below 0', () => {
    // Bad direction (-40), bad speed (-60), bad gust (-40)
    const result = calculateSoaringScore(testProfile, 40, 60, 90, 90, 800);
    expect(result.score).toBe(0);
  });
});

describe('Paragliding Logic - PRESET_PROFILES', () => {
    it('should export preset profiles', () => {
        expect(PRESET_PROFILES).toHaveProperty('fps-south');
        expect(PRESET_PROFILES['fps-south'].id).toBe('fps-south');
    });
});
