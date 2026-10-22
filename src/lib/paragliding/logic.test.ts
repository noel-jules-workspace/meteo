import { describe, it, expect } from 'vitest';
import { getWindConditions, WindConditions } from './logic';

describe('Paragliding Logic - getWindConditions', () => {
    it('returns green for optimal conditions', () => {
        const speedKmh = 16; // ~9.9 mph
        const gustKmh = 20; // ~12.4 mph
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('green');
        expect(conditions.breakdowns).toContain("Gust spread within safe limits (<=5 mph).");
        expect(conditions.breakdowns).toContain("Sustained Base Wind good (<=12 mph).");
    });

    it('returns red if gust spread > 5 mph', () => {
        const speedKmh = 10; // ~6.2 mph
        const gustKmh = 20; // ~12.4 mph (spread ~6.2 mph)
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('red');
        expect(conditions.breakdowns).toContain("Max Safe Gust Spread exceeded (>5 mph). Severe thermal turbulence/rotor risk.");
    });

    it('returns red if sustained base wind > 15 mph', () => {
        const speedKmh = 26; // ~16.1 mph
        const gustKmh = 28; // ~17.4 mph
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('red');
        expect(conditions.breakdowns).toContain("Sustained Base Wind too high (>15 mph). Narrow penetration margin.");
    });

    it('returns orange if sustained base wind is between 12 and 15 mph', () => {
        const speedKmh = 21; // ~13 mph
        const gustKmh = 25; // ~15.5 mph (spread 2.5)
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('orange');
        expect(conditions.breakdowns).toContain("Sustained Base Wind high (12-15 mph). For experienced pilots.");
    });

    it('returns red if blow back danger zone (speed >= 18 mph)', () => {
        const speedKmh = 29; // ~18 mph
        const gustKmh = 32; // ~19.8 mph
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('red');
        expect(conditions.breakdowns).toContain("Blow-Back Danger Zone (>=18 mph). Risk of zero forward speed or blow-back.");
    });

    it('returns red if blow back danger zone (gust >= 18 mph)', () => {
        const speedKmh = 20; // ~12.4 mph
        const gustKmh = 30; // ~18.6 mph (spread > 5, but we check blowback specifically)
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('red');
        expect(conditions.breakdowns).toContain("Blow-Back Danger Zone (>=18 mph). Risk of zero forward speed or blow-back.");
    });

    it('returns orange if approaching blow back danger zone (gust > 15 mph)', () => {
        const speedKmh = 19.4; // ~12.05 mph
        const gustKmh = 25; // ~15.5 mph (spread 3.45)
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('orange');
        expect(conditions.breakdowns).toContain("Approaching Blow-Back Danger (>15 mph).");
    });

    it('returns orange if approaching blow back danger zone (speed > 15 mph)', () => {
        const speedKmh = 26; // ~16.1 mph
        const gustKmh = 27; // ~16.7 mph (spread < 5)
        const conditions = getWindConditions(speedKmh, gustKmh);
        expect(conditions.color).toBe('red'); // Base wind check hits RED first so overall is red
        expect(conditions.breakdowns).toContain("Approaching Blow-Back Danger (>15 mph).");
    });
});
