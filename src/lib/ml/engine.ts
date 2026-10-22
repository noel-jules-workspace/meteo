import * as tf from '@tensorflow/tfjs';
import { ObservationRecord } from '../db/dexie';
import { db } from '../db/dexie';

export interface TrainingDataRow {
  features: number[];
  targets: number[]; // [du, dv, dspeed, dgust, dtemp]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFeatures(nwpGrids: any[], timeIso: string, currentObs?: {u: number, v: number, speed: number, gust: number, temp: number}): number[] {
  const features: number[] = [];
  // timeIso might be an Open-Meteo string like "YYYY-MM-DDTHH:00" without Z
  const date = timeIso.endsWith('Z') ? new Date(timeIso) : new Date(timeIso + 'Z');
  const hour = date.getUTCHours();
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getUTCFullYear(), 0, 0).getTime()) / 86400000);

  // Cyclic time features
  features.push(Math.sin((2 * Math.PI * hour) / 24));
  features.push(Math.cos((2 * Math.PI * hour) / 24));
  features.push(Math.sin((2 * Math.PI * dayOfYear) / 365));
  features.push(Math.cos((2 * Math.PI * dayOfYear) / 365));

  for (let g = 0; g < 9; g++) {
    const grid = nwpGrids[g];
    const omTime = timeIso.slice(0, 16);
    const hourIdx = grid.hourly.time.indexOf(omTime);
    if (hourIdx === -1) continue;

    const speed = grid.hourly.wind_speed_10m[hourIdx];
    const dir = grid.hourly.wind_direction_10m[hourIdx];

    // Orthogonal wind
    const dirRad = (dir * Math.PI) / 180;
    const u = -speed * Math.sin(dirRad);
    const v = -speed * Math.cos(dirRad);

    features.push(u);
    features.push(v);
    features.push(speed);
    features.push(grid.hourly.wind_gusts_10m[hourIdx]);
    features.push(grid.hourly.temperature_2m[hourIdx]);
    features.push(grid.hourly.cloud_cover[hourIdx]);
    features.push(grid.hourly.cape[hourIdx]);
    features.push(grid.hourly.boundary_layer_height[hourIdx]);
    features.push(grid.metadata.grid_elevation);
    features.push(grid.metadata.elevation_diff);
  }

  if (currentObs) {
    features.push(currentObs.u);
    features.push(currentObs.v);
    features.push(currentObs.speed);
    features.push(currentObs.gust);
    features.push(currentObs.temp);
  } else {
    features.push(0);
    features.push(0);
    features.push(0);
    features.push(0);
    features.push(0);
  }

  return features;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function trainModel(stationId: string, nwpGrids: any[], observations: ObservationRecord[], onProgress: (epoch: number, loss: number) => void) {
  // Explicitly sort observations chronologically to ensure training is on oldest data
  const sortedObs = [...observations].sort((a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime());

  // Aggregate sub-hourly observations to hourly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hourlyObs = new Map<string, any>();
  for (const obs of sortedObs) {
    const d = new Date(obs.timestampUtc);
    d.setUTCMinutes(0, 0, 0); // snap to top of hour
    const hourKey = d.toISOString();

    if (!hourlyObs.has(hourKey)) {
      hourlyObs.set(hourKey, { speeds: [], dirs: [], gusts: [], temps: [] });
    }
    const val = hourlyObs.get(hourKey);
    val.speeds.push(obs.windSpeedKmh);
    val.dirs.push(obs.windDirDeg);
    if (obs.windGustKmh) val.gusts.push(obs.windGustKmh);
    val.temps.push(obs.tempC);
  }

  const rows: TrainingDataRow[] = [];

  // Center grid is index 4 (middle of 3x3)
  const centerGrid = nwpGrids[4];

  const hourlyObsEntries = Array.from(hourlyObs.entries()).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());

  for (let j = 0; j < hourlyObsEntries.length; j++) {
    const [timeIso, obsVals] = hourlyObsEntries[j];
    const omTime = timeIso.slice(0, 16);
    const hourIdx = centerGrid.hourly.time.indexOf(omTime);
    if (hourIdx === -1) continue; // No overlapping NWP

    // Vector mean for wind direction
    let sumU = 0, sumV = 0;
    for (let i = 0; i < obsVals.speeds.length; i++) {
        const rad = (obsVals.dirs[i] * Math.PI) / 180;
        sumU += -obsVals.speeds[i] * Math.sin(rad);
        sumV += -obsVals.speeds[i] * Math.cos(rad);
    }
    const meanU = sumU / obsVals.speeds.length;
    const meanV = sumV / obsVals.speeds.length;
    const meanSpeed = obsVals.speeds.reduce((a:number, b:number) => a + b, 0) / obsVals.speeds.length;
    const maxGust = obsVals.gusts.length > 0 ? Math.max(...obsVals.gusts) : meanSpeed;
    const meanTemp = obsVals.temps.reduce((a:number, b:number) => a + b, 0) / obsVals.temps.length;

    const nwpSpeed = centerGrid.hourly.wind_speed_10m[hourIdx];
    const nwpDirRad = (centerGrid.hourly.wind_direction_10m[hourIdx] * Math.PI) / 180;
    const nwpU = -nwpSpeed * Math.sin(nwpDirRad);
    const nwpV = -nwpSpeed * Math.cos(nwpDirRad);
    const nwpGust = centerGrid.hourly.wind_gusts_10m[hourIdx];
    const nwpTemp = centerGrid.hourly.temperature_2m[hourIdx];

    const targets = [
        meanU - nwpU,
        meanV - nwpV,
        meanSpeed - nwpSpeed,
        maxGust - nwpGust,
        meanTemp - nwpTemp
    ];

    let currentObs = undefined;
    if (j > 0) {
      const prevObsVals = hourlyObsEntries[j - 1][1];
      let prevSumU = 0, prevSumV = 0;
      for (let i = 0; i < prevObsVals.speeds.length; i++) {
        const rad = (prevObsVals.dirs[i] * Math.PI) / 180;
        prevSumU += -prevObsVals.speeds[i] * Math.sin(rad);
        prevSumV += -prevObsVals.speeds[i] * Math.cos(rad);
      }
      const prevMeanU = prevSumU / prevObsVals.speeds.length;
      const prevMeanV = prevSumV / prevObsVals.speeds.length;
      const prevMeanSpeed = prevObsVals.speeds.reduce((a:number, b:number) => a + b, 0) / prevObsVals.speeds.length;
      const prevMaxGust = prevObsVals.gusts.length > 0 ? Math.max(...prevObsVals.gusts) : prevMeanSpeed;
      const prevMeanTemp = prevObsVals.temps.reduce((a:number, b:number) => a + b, 0) / prevObsVals.temps.length;

      currentObs = {
        u: prevMeanU,
        v: prevMeanV,
        speed: prevMeanSpeed,
        gust: prevMaxGust,
        temp: prevMeanTemp
      };
    }

    const features = createFeatures(nwpGrids, timeIso, currentObs);
    // ensure we got features for all 9 grids (sometimes an edge point drops)
    if (features.length === 4 + 9 * 10 + 5) {
        rows.push({ features, targets });
    }
  }

  if (rows.length < 168) {
     return null; // Not enough data
  }

  // Split 80/20 chronological
  const trainSize = Math.floor(rows.length * 0.8);
  const trainRows = rows.slice(0, trainSize);
  const valRows = rows.slice(trainSize);

  // Standardize strictly on training split
  const trainFeatures = trainRows.map(r => r.features);
  const numFeatures = trainFeatures[0].length;
  const means = new Array(numFeatures).fill(0);
  const stds = new Array(numFeatures).fill(0);

  for(let c=0; c<numFeatures; c++){
      let sum = 0;
      for(let r=0; r<trainSize; r++) sum += trainFeatures[r][c];
      means[c] = sum / trainSize;

      let varianceSum = 0;
      for(let r=0; r<trainSize; r++) varianceSum += Math.pow(trainFeatures[r][c] - means[c], 2);
      stds[c] = Math.sqrt(varianceSum / trainSize) || 1;
  }

  const normalize = (f: number[]) => f.map((val, c) => (val - means[c]) / stds[c]);

  const xsTrain = tf.tensor2d(trainRows.map(r => normalize(r.features)));
  const ysTrain = tf.tensor2d(trainRows.map(r => r.targets));
  const xsVal = tf.tensor2d(valRows.map(r => normalize(r.features)));
  const ysVal = tf.tensor2d(valRows.map(r => r.targets));

  // Build model
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [numFeatures] }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 5, activation: 'linear' }));

  model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

  await model.fit(xsTrain, ysTrain, {
      epochs: 50,
      validationData: [xsVal, ysVal],
      callbacks: {
          onEpochEnd: (epoch, logs) => {
              if (logs) onProgress(epoch, logs.loss);
          }
      }
  });

  const cacheId = `${stationId}_${Date.now()}`;
  await model.save(`indexeddb://${cacheId}`);

  // Evaluate MAE on validation split
  const valPreds = model.predict(xsVal) as tf.Tensor;
  const valPredData = valPreds.dataSync();
  const valTrueData = ysVal.dataSync();

  let totalSpeedMae = 0;
  let totalGustMae = 0;
  let totalTempMae = 0;
  let totalDirMae = 0;

  for(let i=0; i<valRows.length; i++) {
     totalSpeedMae += Math.abs(valPredData[i*5 + 2] - valTrueData[i*5 + 2]);
     totalGustMae += Math.abs(valPredData[i*5 + 3] - valTrueData[i*5 + 3]);
     totalTempMae += Math.abs(valPredData[i*5 + 4] - valTrueData[i*5 + 4]);
     // Dir MAE is tricky, simplified here as U/V error magnitude for demonstration
     totalDirMae += Math.sqrt(Math.pow(valPredData[i*5 + 0] - valTrueData[i*5 + 0], 2) + Math.pow(valPredData[i*5 + 1] - valTrueData[i*5 + 1], 2));
  }

  const metrics = {
     valSpeedMae: totalSpeedMae / valRows.length,
     valGustMae: totalGustMae / valRows.length,
     valTempMae: totalTempMae / valRows.length,
     valDirMae: totalDirMae / valRows.length, // approximation
  };

  await db.models.put({
      id: cacheId,
      stationId,
      lastTrainedAt: new Date().toISOString(),
      normalizationStats: { mean: means, std: stds }
  });

  valPreds.dispose();
  xsTrain.dispose();
  ysTrain.dispose();
  xsVal.dispose();
  ysVal.dispose();
  model.dispose();

  return { cacheId, metrics };
}
