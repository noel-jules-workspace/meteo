import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeatures, trainModel } from './engine';
import * as tf from '@tensorflow/tfjs';
import { db, ObservationRecord } from '../db/dexie';
import 'fake-indexeddb/auto';

// Mock dependencies
vi.mock('@tensorflow/tfjs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actual = await importOriginal() as any;
  return {
    ...actual,
    sequential: vi.fn(),
    layers: {
      dense: vi.fn(),
      dropout: vi.fn(),
    },
    tensor2d: vi.fn(),
  };
});

vi.mock('../db/dexie', () => {
    return {
        db: {
            models: {
                put: vi.fn()
            }
        }
    };
});

describe('ML Engine - createFeatures', () => {
  it('creates features correctly from NWP grids', () => {
    const timeIso = '2023-10-01T12:00'; // Note: no Z
    const nwpGrids = new Array(9).fill(null).map((_, i) => ({
      metadata: { grid_elevation: 100 + i, elevation_diff: 10 + i },
      hourly: {
        time: ['2023-10-01T12:00'],
        wind_speed_10m: [20 + i],
        wind_direction_10m: [180 + i],
        wind_gusts_10m: [30 + i],
        temperature_2m: [15 + i],
        cloud_cover: [50 + i],
        cape: [100 + i],
        boundary_layer_height: [1000 + i],
      }
    }));

    const features = createFeatures(nwpGrids, timeIso);

    // 4 time features + 9 * 10 grid features + 5 zero currentObs features = 99 features
    expect(features).toHaveLength(99);

    // Check first time feature (sin hour)
    expect(features[0]).toBeDefined();

    // Check an orthogonal wind calculation for the first grid
    // speed=20, dir=180 -> u = -20*sin(180) = 0, v = -20*cos(180) = 20
    const u = features[4];
    const v = features[5];
    expect(Math.abs(u)).toBeLessThan(0.001); // floating point roughly 0
    expect(v).toBeCloseTo(20, 1);
  });

  it('skips grid points if time is not found', () => {
      const timeIso = '2023-10-01T13:00';
      const nwpGrids = [
        {
          metadata: { grid_elevation: 100, elevation_diff: 10 },
          hourly: {
            time: ['2023-10-01T12:00'], // Different time
            wind_speed_10m: [20],
            wind_direction_10m: [180],
            wind_gusts_10m: [30],
            temperature_2m: [15],
            cloud_cover: [50],
            cape: [100],
            boundary_layer_height: [1000],
          }
        },
        ...new Array(8).fill(null).map((_, i) => ({
          metadata: { grid_elevation: 100 + i, elevation_diff: 10 + i },
          hourly: {
            time: ['2023-10-01T13:00'],
            wind_speed_10m: [20 + i],
            wind_direction_10m: [180 + i],
            wind_gusts_10m: [30 + i],
            temperature_2m: [15 + i],
            cloud_cover: [50 + i],
            cape: [100 + i],
            boundary_layer_height: [1000 + i],
          }
        }))
      ];
      const features = createFeatures(nwpGrids, timeIso);
      // Expected: 4 time features + 8 * 10 grid features + 5 zeros = 89 features
      expect(features).toHaveLength(89);
  });

  it('includes currentObs features when provided', () => {
    const timeIso = '2023-10-01T12:00'; // Note: no Z
    const nwpGrids = new Array(9).fill(null).map((_, i) => ({
      metadata: { grid_elevation: 100 + i, elevation_diff: 10 + i },
      hourly: {
        time: ['2023-10-01T12:00'],
        wind_speed_10m: [20 + i],
        wind_direction_10m: [180 + i],
        wind_gusts_10m: [30 + i],
        temperature_2m: [15 + i],
        cloud_cover: [50 + i],
        cape: [100 + i],
        boundary_layer_height: [1000 + i],
      }
    }));

    const currentObs = { u: 1, v: 2, speed: 3, gust: 4, temp: 5 };
    const features = createFeatures(nwpGrids, timeIso, currentObs);

    // 4 time features + 9 * 10 grid features + 5 currentObs features = 99 features
    expect(features).toHaveLength(99);
    expect(features.slice(-5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('ML Engine - trainModel', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockModel: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup TF mocks
        mockModel = {
            add: vi.fn(),
            compile: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fit: vi.fn().mockImplementation((x: any, y: any, config: any) => {
                if (config?.callbacks?.onEpochEnd) {
                    config.callbacks.onEpochEnd(0, { loss: 0.5 });
                }
                return Promise.resolve();
            }),
            save: vi.fn().mockResolvedValue(true),
            predict: vi.fn().mockReturnValue({
                dataSync: () => new Float32Array(5 * 50).fill(1), // Fake predictions
                dispose: vi.fn()
            }),
            dispose: vi.fn()
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tf.sequential as any).mockReturnValue(mockModel);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tf.tensor2d as any).mockImplementation((data: any) => ({
            dataSync: () => data.flat(),
            dispose: vi.fn()
        }));
    });

    it('returns null if less than 168 rows of valid data', async () => {
        const result = await trainModel('test_station', [], [], vi.fn());
        expect(result).toBeNull();
    });

    it('trains successfully with enough data', async () => {
        // Generate enough data to pass the 168 row requirement
        const nwpGrids = new Array(9).fill(null).map(() => ({
            metadata: { grid_elevation: 100, elevation_diff: 10 },
            hourly: {
                time: Array.from({ length: 200 }, (_, i) => `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
                wind_speed_10m: Array(200).fill(10),
                wind_direction_10m: Array(200).fill(180),
                wind_gusts_10m: Array(200).fill(15),
                temperature_2m: Array(200).fill(20),
                cloud_cover: Array(200).fill(0),
                cape: Array(200).fill(0),
                boundary_layer_height: Array(200).fill(500),
            }
        }));

        const observations: ObservationRecord[] = Array.from({ length: 200 }, (_, i) => ({
            stationId: 'test_station',
            timestampUtc: `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:15:00.000Z`,
            windSpeedKmh: 12,
            windDirDeg: 190,
            windGustKmh: 18,
            tempC: 21,
        }));

        const onProgress = vi.fn();
        const result = await trainModel('test_station', nwpGrids, observations, onProgress);

        expect(result).not.toBeNull();
        expect(result?.cacheId).toContain('test_station_');
        expect(result?.metrics).toBeDefined();

        expect(tf.sequential).toHaveBeenCalled();
        expect(mockModel.compile).toHaveBeenCalled();
        expect(mockModel.fit).toHaveBeenCalled();
        expect(mockModel.save).toHaveBeenCalled();
        expect(db.models.put).toHaveBeenCalled();
        expect(onProgress).toHaveBeenCalledWith(0, 0.5);
    });

    it('trains successfully with enough data (including gust fallback)', async () => {
        // Generate enough data to pass the 168 row requirement
        const nwpGrids = new Array(9).fill(null).map(() => ({
            metadata: { grid_elevation: 100, elevation_diff: 10 },
            hourly: {
                time: Array.from({ length: 200 }, (_, i) => `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
                wind_speed_10m: Array(200).fill(10),
                wind_direction_10m: Array(200).fill(180),
                wind_gusts_10m: Array(200).fill(15),
                temperature_2m: Array(200).fill(20),
                cloud_cover: Array(200).fill(0),
                cape: Array(200).fill(0),
                boundary_layer_height: Array(200).fill(500),
            }
        }));

        const observations: ObservationRecord[] = Array.from({ length: 200 }, (_, i) => ({
            stationId: 'test_station',
            timestampUtc: `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:15:00.000Z`,
            windSpeedKmh: 12,
            windDirDeg: 190,
            tempC: 21,
        }));

        const onProgress = vi.fn();
        const result = await trainModel('test_station', nwpGrids, observations, onProgress);

        expect(result).not.toBeNull();
    });

    it('handles various edge cases in trainModel', async () => {
        // Force the missing properties
        const nwpGrids = new Array(9).fill(null).map(() => ({
            metadata: { grid_elevation: 100, elevation_diff: 10 },
            hourly: {
                time: Array.from({ length: 200 }, (_, i) => `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
                wind_speed_10m: Array(200).fill(10),
                wind_direction_10m: Array(200).fill(180),
                wind_gusts_10m: Array(200).fill(15),
                temperature_2m: Array(200).fill(20),
                cloud_cover: Array(200).fill(0),
                cape: Array(200).fill(0),
                boundary_layer_height: Array(200).fill(500),
            }
        }));

        // Cover !hourlyObs.has(hourKey) branch multiple times
        const observations: ObservationRecord[] = Array.from({ length: 200 }, (_, i) => ({
            stationId: 'test_station',
            timestampUtc: `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:15:00.000Z`,
            windSpeedKmh: 12,
            windDirDeg: 190,
            tempC: 21,
            // no gust
        }));

        // add a specific condition where hourIdx is -1 for a row
        nwpGrids[4].hourly.time[50] = '2099-01-01T00:00'; // Make it not match

        // Make feature length drop by modifying a grid point to miss a time (for features.length === ... branch coverage)
        nwpGrids[0].hourly.time[51] = '2099-01-01T00:00';

        const onProgress = vi.fn();
        const result = await trainModel('test_station', nwpGrids, observations, onProgress);

        expect(result).not.toBeNull();
    });

    it('handles model fit with empty logs', async () => {
         // Setup TF mocks
        const mockModel = {
            add: vi.fn(),
            compile: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fit: vi.fn().mockImplementation((x: any, y: any, config: any) => {
                if (config?.callbacks?.onEpochEnd) {
                    config.callbacks.onEpochEnd(0, null); // passing null for logs
                }
                return Promise.resolve();
            }),
            save: vi.fn().mockResolvedValue(true),
            predict: vi.fn().mockReturnValue({
                dataSync: () => new Float32Array(5 * 50).fill(1), // Fake predictions
                dispose: vi.fn()
            }),
            dispose: vi.fn()
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tf.sequential as any).mockReturnValue(mockModel);

        const nwpGrids = new Array(9).fill(null).map(() => ({
            metadata: { grid_elevation: 100, elevation_diff: 10 },
            hourly: {
                time: Array.from({ length: 200 }, (_, i) => `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
                wind_speed_10m: Array(200).fill(10),
                wind_direction_10m: Array(200).fill(180),
                wind_gusts_10m: Array(200).fill(15),
                temperature_2m: Array(200).fill(20),
                cloud_cover: Array(200).fill(0),
                cape: Array(200).fill(0),
                boundary_layer_height: Array(200).fill(500),
            }
        }));

        const observations: ObservationRecord[] = Array.from({ length: 200 }, (_, i) => ({
            stationId: 'test_station',
            timestampUtc: `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:15:00.000Z`,
            windSpeedKmh: 12,
            windDirDeg: 190,
            tempC: 21,
            // no gust
        }));

        await trainModel('test_station', nwpGrids, observations, vi.fn());
    });
});

    it('handles stds[c] evaluating to 0 by substituting with 1 to avoid division by zero', async () => {
         // Setup TF mocks
        const mockModel = {
            add: vi.fn(),
            compile: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fit: vi.fn().mockImplementation((x: any, y: any, config: any) => {
                if (config?.callbacks?.onEpochEnd) {
                    config.callbacks.onEpochEnd(0, null); // passing null for logs
                }
                return Promise.resolve();
            }),
            save: vi.fn().mockResolvedValue(true),
            predict: vi.fn().mockReturnValue({
                dataSync: () => new Float32Array(5 * 50).fill(1), // Fake predictions
                dispose: vi.fn()
            }),
            dispose: vi.fn()
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tf.sequential as any).mockReturnValue(mockModel);

        // Use identical data so variance is exactly 0
        const constantGrid = {
            metadata: { grid_elevation: 100, elevation_diff: 10 },
            hourly: {
                time: Array.from({ length: 200 }, (_, i) => `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`),
                wind_speed_10m: Array(200).fill(10),
                wind_direction_10m: Array(200).fill(180),
                wind_gusts_10m: Array(200).fill(15),
                temperature_2m: Array(200).fill(20),
                cloud_cover: Array(200).fill(0),
                cape: Array(200).fill(0),
                boundary_layer_height: Array(200).fill(500),
            }
        };
        const nwpGrids = new Array(9).fill(constantGrid);

        const observations: ObservationRecord[] = Array.from({ length: 200 }, (_, i) => ({
            stationId: 'test_station',
            timestampUtc: `2023-10-${String(Math.floor(i / 24) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:15:00.000Z`,
            windSpeedKmh: 12,
            windDirDeg: 190,
            tempC: 21,
            // no gust
        }));

        const result = await trainModel('test_station', nwpGrids, observations, vi.fn());
        expect(result).not.toBeNull();
    });
