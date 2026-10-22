import { test, expect } from '@playwright/test';
import { calculateSoaringScore, SiteProfile } from '../src/lib/paragliding/logic';

test.describe('Paragliding Logic - calculateSoaringScore', () => {
  const profileStandard: SiteProfile = {
    id: 'test-standard',
    name: 'Test Standard',
    idealWindDirMin: 180,
    idealWindDirMax: 220,
    idealSpeedMinKmh: 10,
    idealSpeedMaxKmh: 20,
    maxGustVarianceKmh: 5,
  };

  const profileNorth: SiteProfile = {
    id: 'test-north',
    name: 'Test North',
    idealWindDirMin: 340,
    idealWindDirMax: 20,
    idealSpeedMinKmh: 10,
    idealSpeedMaxKmh: 20,
    maxGustVarianceKmh: 5,
  };

  test('Optimal conditions should return 100 score', () => {
    const result = calculateSoaringScore(profileStandard, 15, 18, 200, 0, 500);
    expect(result.score).toBe(100);
    expect(result.breakdown).toContain('Wind direction optimal (+0)');
    expect(result.breakdown).toContain('Wind speed optimal (+0)');
  });

  test('Wind direction out of sector should penalize -40', () => {
    const result = calculateSoaringScore(profileStandard, 15, 18, 100, 0, 500);
    expect(result.score).toBe(60);
    expect(result.breakdown).toContain('Wind direction out of optimal sector (-40)');
  });

  test('Wind direction crossing North - optimal', () => {
    const result1 = calculateSoaringScore(profileNorth, 15, 18, 350, 0, 500);
    expect(result1.breakdown).toContain('Wind direction optimal (+0)');

    const result2 = calculateSoaringScore(profileNorth, 15, 18, 10, 0, 500);
    expect(result2.breakdown).toContain('Wind direction optimal (+0)');
  });

  test('Wind direction crossing North - out of sector', () => {
    const result = calculateSoaringScore(profileNorth, 15, 18, 180, 0, 500);
    expect(result.breakdown).toContain('Wind direction out of optimal sector (-40)');
  });

  test('Wind speed too light', () => {
    const result = calculateSoaringScore(profileStandard, 5, 8, 200, 0, 500);
    // diff = 10 - 5 = 5. penalty = 5 * 5 = 25
    expect(result.score).toBe(75);
    expect(result.breakdown).toContain('Wind speed too light (-25)');
  });

  test('Wind speed too strong', () => {
    const result = calculateSoaringScore(profileStandard, 25, 28, 200, 0, 500);
    // diff = 25 - 20 = 5. penalty = 5 * 10 = 50
    expect(result.score).toBe(50);
    expect(result.breakdown).toContain('Wind speed too strong (-50)');
  });

  test('Gust variance too high', () => {
    const result = calculateSoaringScore(profileStandard, 15, 25, 200, 0, 500);
    // variance = 25 - 15 = 10. allowed = 5. diff = 5. penalty = 5 * 8 = 40
    expect(result.score).toBe(60);
    expect(result.breakdown).toContain('Gust variance too high (-40)');
  });

  test('Rain probability penalty', () => {
    const result = calculateSoaringScore(profileStandard, 15, 18, 200, 30, 500);
    // rain > 10. penalty = 30
    expect(result.score).toBe(70);
    expect(result.breakdown).toContain('Rain probability penalty (-30)');
  });

  test('Thermal BLH Bonus', () => {
    const result = calculateSoaringScore(profileStandard, 15, 18, 200, 0, 1500);
    // blh = 1500. bonus = (1500-1000)/100 = 5
    expect(result.score).toBe(100); // capped at 100
    expect(result.breakdown).toContain('Good thermal boundary layer (+5)');

    // Check if it actually increases score if there are penalties
    const penalizedResult = calculateSoaringScore(profileStandard, 5, 8, 200, 0, 1500);
    // penalty 25. score 75 + 5 = 80
    expect(penalizedResult.score).toBe(80);
  });

  test('Score clamped between 0 and 100', () => {
    const result = calculateSoaringScore(profileStandard, 40, 50, 90, 100, 500);
    // speed diff = 20 * 10 = 200 (capped at 60)
    // dir penalty = 40
    // gust variance = 10 - 5 = 5 * 8 = 40
    // rain = 100 (capped at 80)
    // total penalty = 60 + 40 + 40 + 80 = 220 -> score should be 0, not negative
    expect(result.score).toBe(0);
  });
});
