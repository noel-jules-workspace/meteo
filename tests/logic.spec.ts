import { test, expect } from '@playwright/test';
import { getWindConditions } from '../src/lib/paragliding/logic';

test.describe('Paragliding Logic - getWindConditions', () => {

  test('Gust spread > 5 mph returns red', () => {
    // 10 mph = 16.09 kmh, 16 mph = 25.75 kmh (spread 6 mph)
    const result = getWindConditions(16.0934, 25.7495);
    expect(result.color).toBe('red');
    expect(result.breakdowns).toContain("Max Safe Gust Spread exceeded (>5 mph). Severe thermal turbulence/rotor risk.");
  });

  test('Sustained wind <= 12 mph and spread <= 5 mph returns green', () => {
    // 10 mph = 16.09 kmh, 14 mph = 22.53 kmh (spread 4 mph)
    const result = getWindConditions(16.0934, 22.5308);
    expect(result.color).toBe('green');
    expect(result.breakdowns).toContain("Sustained Base Wind good (<=12 mph).");
    expect(result.breakdowns).toContain("Gust spread within safe limits (<=5 mph).");
  });

  test('Sustained wind 12-15 mph returns orange', () => {
    // 14 mph = 22.53 kmh, 14 mph gust
    const result = getWindConditions(22.5308, 22.5308);
    expect(result.color).toBe('orange');
    expect(result.breakdowns).toContain("Sustained Base Wind high (12-15 mph). For experienced pilots.");
  });

  test('Sustained wind > 15 mph returns red', () => {
    // 16 mph = 25.75 kmh, 16 mph gust
    const result = getWindConditions(25.7495, 25.7495);
    expect(result.color).toBe('red');
    expect(result.breakdowns).toContain("Sustained Base Wind too high (>15 mph). Narrow penetration margin.");
  });

  test('Approaching blow back danger (>15 mph gust but <= 18 mph gust) with low sustained returns orange', () => {
    // 10 mph = 16.09 kmh, 16 mph = 25.75 kmh (gust > 15) -> spread is 6 though so it will be red due to spread.
    // To test ONLY blow back orange: sustained 14 mph (orange anyway), gust 16 mph (orange blowback).
    // Let's use 11 mph sustained (17.7 kmh), 16 mph gust (25.75 kmh). Spread is 5 mph.
    const result = getWindConditions(17.7028, 25.7495);
    expect(result.color).toBe('orange');
    expect(result.breakdowns).toContain("Approaching Blow-Back Danger (>15 mph).");
  });

  test('Blow-Back danger zone (>= 18 mph) returns red', () => {
    // 18 mph = 28.9682 kmh, let's make speed 18.01 mph to be safe above 18
    const speedKmh = 18.01 / 0.621371;
    const result = getWindConditions(speedKmh, speedKmh);
    expect(result.color).toBe('red');
    expect(result.breakdowns).toContain("Blow-Back Danger Zone (>=18 mph). Risk of zero forward speed or blow-back.");
  });

});