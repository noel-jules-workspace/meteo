import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('Observations API Route', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    const createRequest = (url: string) => {
        return new NextRequest(new URL(url, 'http://localhost'));
    };

    it('returns 400 if station is not provided', async () => {
        const req = createRequest('/api/observations');
        const res = await GET(req);

        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toBe('Station ID is required');
    });

    it('returns 404 for unknown station', async () => {
        const req = createRequest('/api/observations?station=unknown:station');
        const res = await GET(req);

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error).toBe('Unknown station ID');
    });

    it('fetches and parses NWS data for us:fps', async () => {
        const mockNWSResponse = {
            features: [
                {
                    properties: {
                        timestamp: '2023-10-01T12:00:00Z',
                        windSpeed: { value: 15 },
                        windGust: { value: 20 },
                        windDirection: { value: 180 },
                        temperature: { value: 25 },
                        dewpoint: { value: 10 }
                    }
                },
                {
                    properties: {
                        timestamp: '2023-10-01T13:00:00Z',
                        windSpeed: { value: null }, // Should be skipped
                    }
                }
            ]
        };

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockNWSResponse)
        }));

        const req = createRequest('/api/observations?station=us:fps&days=1');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.metadata.id).toBe('us:fps');
        expect(data.observations).toHaveLength(1);
        expect(data.observations[0].windSpeedKmh).toBe(15);
        expect(data.observations[0].windGustKmh).toBe(20);

        const fetchArgs = vi.mocked(fetch).mock.calls[0][0] as string;
        expect(fetchArgs).toContain('api.weather.gov/stations/FPS/observations');
    });

    it('fetches and parses Holfuy data', async () => {
        const mockHolfuyResponse = {
            measurements: [
                {
                    time: '2023-10-01T12:00:00Z',
                    wind: { speed: 5, gust: 8, direction: 180 },
                    temperature: 20
                }
            ]
        };

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockHolfuyResponse)
        }));

        const req = createRequest('/api/observations?station=de:holfuy:263');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.metadata.id).toBe('de:holfuy:263');
        expect(data.observations).toHaveLength(1);
        expect(data.observations[0].windSpeedKmh).toBeCloseTo(18); // 5 * 3.6
        expect(data.observations[0].windGustKmh).toBeCloseTo(28.8); // 8 * 3.6
    });

    it('fetches and parses Wunderground data', async () => {
        const mockWundergroundResponse = {
            observations: [
                {
                    obsTimeUtc: '2023-10-01T12:00:00Z',
                    winddir: 180,
                    metric: {
                        windspeed: 10,
                        windgust: 15,
                        temp: 20,
                        dewpt: 10,
                        precipTotal: 0
                    }
                }
            ]
        };

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockWundergroundResponse)
        }));

        const req = createRequest('/api/observations?station=de:IKOBER13');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.metadata.id).toBe('de:IKOBER13');
        expect(data.observations).toHaveLength(1);
        expect(data.observations[0].windSpeedKmh).toBe(10);
    });

    it('handles fetch errors gracefully', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const req = createRequest('/api/observations?station=us:fps');
        const res = await GET(req);

        expect(res.status).toBe(500);
        const data = await res.json();
        expect(data.error).toBe('Failed to fetch observations');
    });

    it('fetches and parses DWD/BrightSky data', async () => {
        const mockDWDResponse = {
            weather: [
                {
                    timestamp: '2023-10-01T12:00:00Z',
                    wind_speed: 12,
                    wind_gust_speed: 18,
                    wind_direction: 180,
                    temperature: 20,
                    dew_point: 10,
                    precipitation: 0
                },
                {
                    timestamp: '2023-10-01T13:00:00Z',
                    wind_speed: null, // should be skipped
                }
            ]
        };

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue(mockDWDResponse)
        }));

        const req = createRequest('/api/observations?station=de:dwd:1001');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.metadata.id).toBe('de:dwd:1001');
        expect(data.observations).toHaveLength(1);
        expect(data.observations[0].windSpeedKmh).toBe(12);
    });

    it('handles !res.ok for all sources', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false
        }));

        const req1 = createRequest('/api/observations?station=us:fps');
        const res1 = await GET(req1);
        expect(res1.status).toBe(200);

        const req2 = createRequest('/api/observations?station=de:holfuy:263');
        const res2 = await GET(req2);
        expect(res2.status).toBe(200);

        const req3 = createRequest('/api/observations?station=de:IKOBER13');
        const res3 = await GET(req3);
        expect(res3.status).toBe(200);

        const req4 = createRequest('/api/observations?station=de:dwd:1001');
        const res4 = await GET(req4);
        expect(res4.status).toBe(200);
    });

    it('handles falsy data paths in sources', async () => {
        // NWS
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                features: []
            })
        }));
        await GET(createRequest('/api/observations?station=us:fps'));

        // Holfuy
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                measurements: null // trigger if (data.measurements)
            })
        }));
        await GET(createRequest('/api/observations?station=de:holfuy:263'));

        // Wunderground
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                observations: null // trigger if(data.observations)
            })
        }));
        await GET(createRequest('/api/observations?station=de:IKOBER13'));
    });

    it('handles falsy data paths in DWD', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                weather: []
            })
        }));
        await GET(createRequest('/api/observations?station=de:dwd:1001'));
    });

    it('covers optional values missing', async () => {
        // NWS
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                features: [{
                    properties: {
                        timestamp: '2023-10-01T12:00:00Z',
                        windSpeed: { value: 10 },
                        windGust: { value: null }, // no gust
                        windDirection: { value: null }, // no dir
                        temperature: { value: null },
                        dewpoint: { value: null }
                    }
                }]
            })
        }));
        await GET(createRequest('/api/observations?station=us:fps'));

        // DWD
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                weather: [{
                    timestamp: '2023-10-01T12:00:00Z',
                    wind_speed: 10,
                    wind_gust_speed: null,
                    wind_direction: null,
                    temperature: 20,
                    dew_point: 10,
                    precipitation: 0
                }]
            })
        }));
        await GET(createRequest('/api/observations?station=de:dwd:1001'));
    });

});