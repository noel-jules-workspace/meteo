import { describe, it, expect, beforeEach } from 'vitest';
import { db, ObservationRecord, ModelCache } from './dexie';
import 'fake-indexeddb/auto';

describe('Dexie Database', () => {
    beforeEach(async () => {
        // Clear all tables before each test
        await db.observations.clear();
        await db.models.clear();
    });

    it('can add and retrieve observations', async () => {
        const obs: ObservationRecord = {
            stationId: 'test_station',
            timestampUtc: '2023-10-01T12:00:00Z',
            windSpeedKmh: 10,
            windDirDeg: 180,
            tempC: 20
        };

        await db.observations.put(obs);

        const retrieved = await db.observations.toArray();
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0].stationId).toBe('test_station');
        expect(retrieved[0].windSpeedKmh).toBe(10);
    });

    it('can query observations by stationId', async () => {
        await db.observations.bulkPut([
            { stationId: 's1', timestampUtc: '2023-01-01T00:00Z', windSpeedKmh: 10, windDirDeg: 0, tempC: 0 },
            { stationId: 's2', timestampUtc: '2023-01-01T00:00Z', windSpeedKmh: 20, windDirDeg: 0, tempC: 0 },
            { stationId: 's1', timestampUtc: '2023-01-01T01:00Z', windSpeedKmh: 15, windDirDeg: 0, tempC: 0 },
        ]);

        const s1Obs = await db.observations.where('stationId').equals('s1').toArray();
        expect(s1Obs).toHaveLength(2);
    });

    it('can add and retrieve models', async () => {
        const model: ModelCache = {
            id: 'test_model_id',
            stationId: 'test_station',
            lastTrainedAt: '2023-10-01T12:00:00Z',
            normalizationStats: {
                mean: [1, 2, 3],
                std: [0.1, 0.2, 0.3]
            }
        };

        await db.models.put(model);

        const retrieved = await db.models.toArray();
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0].id).toBe('test_model_id');
        expect(retrieved[0].normalizationStats.mean).toEqual([1, 2, 3]);
    });
});
