import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNWPForecast } from './openmeteo';

describe('OpenMeteo API', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches and formats NWP forecast correctly', async () => {
        const mockResponses = new Array(9).fill(null).map((_, i) => ({
            latitude: 50.3 + i * 0.01,
            longitude: 7.4 + i * 0.01,
            elevation: 100 + i,
            hourly: {
                time: ['2023-10-01T12:00'],
                temperature_2m: [15],
                dew_point_2m: [10],
                wind_speed_10m: [20],
                wind_direction_10m: [180],
                wind_gusts_10m: [30],
                precipitation_probability: [0],
                precipitation: [0],
                cape: [100],
                lifted_index: [-2],
                boundary_layer_height: [1000],
                cloud_cover: [50],
            }
        }));

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockResponses)
        }));

        const grids = await fetchNWPForecast(50.3, 7.4, 90, 0, 3);

        expect(grids).toHaveLength(9);
        expect(grids[0].metadata.lat).toBe(50.3);
        expect(grids[0].metadata.grid_elevation).toBe(100);
        expect(grids[0].metadata.elevation_diff).toBe(10); // 100 - 90
        expect(grids[0].hourly.time[0]).toBe('2023-10-01T12:00');

        // Assert on the URL called
        const fetchArgs = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(fetchArgs).toContain('https://api.open-meteo.com/v1/forecast');
        expect(fetchArgs).toContain('past_days=0');
        expect(fetchArgs).toContain('forecast_days=3');
    });

    it('uses historical endpoint if pastDays > 0', async () => {
         vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue([])
        }));

        await fetchNWPForecast(50.3, 7.4, 90, 5, 3);
        const fetchArgs = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(fetchArgs).toContain('https://historical-forecast-api.open-meteo.com/v1/forecast');
        expect(fetchArgs).toContain('past_days=5');
    });

    it('throws an error if fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false
        }));

        await expect(fetchNWPForecast(50.3, 7.4, 90)).rejects.toThrow('Failed to fetch NWP data');
    });
});
