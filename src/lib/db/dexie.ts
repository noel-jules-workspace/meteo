import Dexie, { type Table } from 'dexie';
import { Observation } from '@/app/api/observations/route';

export interface ObservationRecord extends Observation {
  stationId: string;
}

export interface ModelCache {
  id: string; // e.g. "us:fps_lastObsTimestamp"
  stationId: string;
  lastTrainedAt: string; // ISO string
  normalizationStats: {
    mean: number[];
    std: number[];
  };
}

export class WeatherDatabase extends Dexie {
  observations!: Table<ObservationRecord, [string, string]>; // [stationId, timestampUtc]
  models!: Table<ModelCache, string>;

  constructor() {
    super('WeatherDatabase');
    this.version(1).stores({
      observations: '[stationId+timestampUtc], stationId, timestampUtc',
      models: 'id, stationId',
    });
  }
}

export const db = new WeatherDatabase();
