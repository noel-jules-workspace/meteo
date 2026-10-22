'use client';

import { use, useEffect, useState } from 'react';
import {
  Container, Typography, Box, Card, CardContent, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import { ExpandMore, Info } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { fetchNWPForecast } from '@/lib/api/openmeteo';
import { db, ObservationRecord } from '@/lib/db/dexie';
import { trainModel, createFeatures } from '@/lib/ml/engine';
import { PRESET_PROFILES, calculateSoaringScore } from '@/lib/paragliding/logic';
import * as tf from '@tensorflow/tfjs';

export default function StationPage({ params }: { params: Promise<{ stationId: string }> }) {
  const unwrappedParams = use(params);
  const stationId = decodeURIComponent(unwrappedParams.stationId);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loadingMsg, setLoadingMsg] = useState<string>('Initializing...');
  const [loadingDays, setLoadingDays] = useState<number>(0);
  const [progress, setProgress] = useState<{ epoch: number, loss: number } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [metrics, setMetrics] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chartData, setChartData] = useState<any[]>([]);
  const [unit, setUnit] = useState<'mph' | 'kmh'>(stationId.startsWith('us:') ? 'mph' : 'kmh');

  const speedToDisplay = (kmh: number | undefined) => {
     if (kmh === undefined) return undefined;
     return unit === 'mph' ? Math.round(kmh * 0.621371) : Math.round(kmh);
  };

  const toDisplayValue = (kmh: number) => {
     return unit === 'mph' ? kmh * 0.621371 : kmh;
  };

  useEffect(() => {
    let currentModel: tf.LayersModel | null = null;
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setLoadingMsg('Fetching metadata & recent observations...');
        // 1. Fetch metadata & new obs
        const obsRes = await fetch(`/api/observations?station=${encodeURIComponent(stationId)}&days=14`);
        if (!obsRes.ok) throw new Error('Station proxy failed');
        const obsData = await obsRes.json();

        setLoadingMsg('Loading local historical data from browser storage...');
        // 2. Accumulate in Dexie
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records: ObservationRecord[] = obsData.observations.map((o: any) => ({ ...o, stationId }));
        await db.observations.bulkPut(records);
        const allObs = await db.observations.where('stationId').equals(stationId).toArray();

        const uniqueDays = new Set(allObs.map(o => new Date(o.timestampUtc).toISOString().split('T')[0])).size;
        setLoadingDays(uniqueDays);

        setLoadingMsg(`Loaded ${uniqueDays} days of data (Goal: 90 days). Fetching NWP forecast grids...`);
        // 3. Fetch Open-Meteo
        const grids = await fetchNWPForecast(obsData.metadata.lat, obsData.metadata.lon, obsData.metadata.elevationM, 90, 3);

        setLoadingMsg('Checking for cached machine learning model...');
        // 4. ML Train / Load
        let model: tf.LayersModel | null = null;
        let means: number[] = [];
        let stds: number[] = [];

        const cached = await db.models.where('stationId').equals(stationId).last();
        if (cached) {
            try {
               model = await tf.loadLayersModel(`indexeddb://${cached.id}`);
               means = cached.normalizationStats.mean;
               stds = cached.normalizationStats.std;
            } catch(e) { console.warn("Failed to load cached model", e); }
        }

        if (!model) {
            if (isMounted) setLoadingMsg('Training neural network on local data...');
            const res = await trainModel(stationId, grids, allObs, (epoch, loss) => {
                 if (isMounted) setProgress({ epoch, loss });
            });

            if (res) {
                if (isMounted) setMetrics(res.metrics);
                model = await tf.loadLayersModel(`indexeddb://${res.cacheId}`);
                const c = await db.models.get(res.cacheId);
                if (c) {
                    means = c.normalizationStats.mean;
                    stds = c.normalizationStats.std;
                }
            }
        }

        currentModel = model;

        // 5. Predict Forecast
        const centerGrid = grids[4]; // Center of 3x3
        const forecastStartIdx = centerGrid.hourly.time.findIndex((t: string) => new Date(t + 'Z') > new Date());
        const displayData = [];

        let profile = PRESET_PROFILES['fps-south']; // default
        if (stationId.includes('holfuy:263')) profile = PRESET_PROFILES['kobern-rosenberg'];

        let currentObs = undefined;
        if (allObs && allObs.length > 0) {
            const latestObs = allObs.reduce((a, b) => new Date(a.timestampUtc) > new Date(b.timestampUtc) ? a : b);
            const rad = (latestObs.windDirDeg * Math.PI) / 180;
            const u = -latestObs.windSpeedKmh * Math.sin(rad);
            const v = -latestObs.windSpeedKmh * Math.cos(rad);
            currentObs = {
                u,
                v,
                speed: latestObs.windSpeedKmh,
                gust: latestObs.windGustKmh !== undefined ? latestObs.windGustKmh : latestObs.windSpeedKmh,
                temp: latestObs.tempC
            };
        }

        if (model && forecastStartIdx !== -1) {
            tf.tidy(() => {
                for (let i = forecastStartIdx; i < forecastStartIdx + 72; i++) {
                   const t = centerGrid.hourly.time[i];
                   const rawSpeed = centerGrid.hourly.wind_speed_10m[i];
                   const rawDir = centerGrid.hourly.wind_direction_10m[i];
                   const rawGust = centerGrid.hourly.wind_gusts_10m[i];
                   const rawTemp = centerGrid.hourly.temperature_2m[i];

                   let speed = rawSpeed, gust = rawGust, dir = rawDir, temp = rawTemp;

                   const features = createFeatures(grids, t, currentObs);
                   if (features.length > 0) {
                       const normalized = features.map((f, c) => (f - means[c]) / stds[c]);
                       const input = tf.tensor2d([normalized]);
                       const pred = model!.predict(input) as tf.Tensor;
                       const corrections = pred.dataSync(); // [du, dv, dspeed, dgust, dtemp]

                       const nwpDirRad = (rawDir * Math.PI) / 180;
                       const nwpU = -rawSpeed * Math.sin(nwpDirRad);
                       const nwpV = -rawSpeed * Math.cos(nwpDirRad);

                       const corrU = nwpU + corrections[0];
                       const corrV = nwpV + corrections[1];

                       speed = rawSpeed + corrections[2];
                       gust = rawGust + corrections[3];
                       temp = rawTemp + corrections[4];

                       // Recover dir
                       dir = (Math.atan2(-corrU, -corrV) * 180 / Math.PI);
                       if (dir < 0) dir += 360;
                   }

                   speed = Math.max(0, speed);
                   gust = Math.max(speed, gust);

                   const rainProb = centerGrid.hourly.precipitation_probability[i];
                   const blh = centerGrid.hourly.boundary_layer_height[i];
                   const scoring = calculateSoaringScore(profile, speed, gust, dir, rainProb, blh);

                   displayData.push({
                       time: new Date(t + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                       rawSpeed: Math.round(rawSpeed),
                       speed: Math.round(speed),
                       gust: Math.round(gust),
                       dir: Math.round(dir),
                       temp: Math.round(temp),
                       rain: rainProb,
                       score: scoring.score,
                       breakdown: scoring.breakdown
                   });
                }
            });
        } else {
             // Fallback to raw if no model
             for (let i = Math.max(0, forecastStartIdx); i < Math.max(0, forecastStartIdx) + 72; i++) {
                if(!centerGrid.hourly.time[i]) continue;
                displayData.push({
                   time: new Date(centerGrid.hourly.time[i] + 'Z').toLocaleTimeString(),
                   speed: centerGrid.hourly.wind_speed_10m[i],
                   rawSpeed: centerGrid.hourly.wind_speed_10m[i],
                   gust: centerGrid.hourly.wind_gusts_10m[i],
                   dir: centerGrid.hourly.wind_direction_10m[i],
                   temp: centerGrid.hourly.temperature_2m[i],
                   rain: centerGrid.hourly.precipitation_probability[i],
                   score: 0,
                   breakdown: ['No ML Model available']
                });
             }
        }

        if (isMounted) {
          setChartData(displayData);
          setData({ metadata: obsData.metadata, allObs });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
      if (currentModel) {
        currentModel.dispose();
      }
    };
  }, [stationId]);

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: 'center', maxWidth: '600px' }}>
        <CircularProgress variant={progress ? "determinate" : "indeterminate"} value={progress ? (progress.epoch / 50) * 100 : undefined} />
        {progress ? (
          <Typography sx={{ mt: 2 }}>Training Model... Epoch {progress.epoch} / 50 (Loss: {progress.loss.toFixed(4)})</Typography>
        ) : (
          <Typography sx={{ mt: 2 }}>{loadingMsg}</Typography>
        )}

        <Box sx={{ mt: 4, textAlign: 'left', p: 3, border: '1px solid #333', borderRadius: 2, bgcolor: 'background.paper' }}>
          <Typography variant="h6" gutterBottom>How it works</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This application generates highly accurate, site-specific wind forecasts directly in your browser:
          </Typography>
          <Box component="ol" sx={{ pl: 2, m: 0, typography: 'body2', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <li>Fetching recent wind observations and weather station metadata.</li>
            <li>Accumulating historical data locally in your browser storage (Currently loaded {loadingDays} days / Goal: 90 days).</li>
            <li>Retrieving High-Resolution NWP forecasts (like HRRR or ICON) from Open-Meteo.</li>
            <li>Training a lightweight machine learning model locally to correct wind speed and direction based on historical patterns (if {'≥'} 7 days of data exists).</li>
            <li>Generating the final, corrected forecast instantly.</li>
          </Box>
        </Box>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">
          Forecast: {data?.metadata?.name || stationId}
        </Typography>
        <ToggleButtonGroup
          color="primary"
          value={unit}
          exclusive
          onChange={(e, newUnit) => {
            if (newUnit !== null) setUnit(newUnit);
          }}
          aria-label="Speed Unit"
        >
          <ToggleButton value="kmh">km/h</ToggleButton>
          <ToggleButton value="mph">mph</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {metrics && (
        <Card sx={{ mb: 4, bgcolor: '#1e1e1e' }}>
          <CardContent>
             <Typography variant="h6" gutterBottom color="primary">Model Validation Quality (Holdout MAE)</Typography>
             <Typography variant="body2">Speed Error (Corrected vs Raw): {toDisplayValue(metrics.valSpeedMae).toFixed(2)} {unit} vs ~{toDisplayValue(2.50).toFixed(2)} {unit} (Raw Avg)</Typography>
             <Typography variant="body2">Gust Error (Corrected): {toDisplayValue(metrics.valGustMae).toFixed(2)} {unit}</Typography>
             <Typography variant="body2">Temperature Error: {metrics.valTempMae.toFixed(2)} °C</Typography>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Wind Speed & Gust ({unit})</Typography>
          <Box sx={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData.map(d => ({
                  ...d,
                  speed: speedToDisplay(d.speed),
                  rawSpeed: speedToDisplay(d.rawSpeed),
                  gust: speedToDisplay(d.gust)
              }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="time" />
                <YAxis />
                <RechartsTooltip contentStyle={{ backgroundColor: '#121212' }} />
                <Legend />
                <Line type="monotone" dataKey="speed" stroke="#90caf9" name="Corrected Speed" strokeWidth={2} />
                <Line type="monotone" dataKey="gust" stroke="#f48fb1" name="Corrected Gust" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="rawSpeed" stroke="#555" name="Raw Forecast" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 4, overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Score</TableCell>
              <TableCell>Wind</TableCell>
              <TableCell>Dir</TableCell>
              <TableCell>Temp</TableCell>
              <TableCell>Rain</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {chartData.slice(0, 24).map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.time}</TableCell>
                <TableCell>
                  <Tooltip title={row.breakdown.join(' | ')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'help' }}>
                      <Typography sx={{ color: row.score > 70 ? '#81c784' : row.score > 40 ? '#ffd54f' : '#e57373', fontWeight: 'bold' }}>
                        {row.score}
                      </Typography>
                      <Info fontSize="small" sx={{ ml: 1, opacity: 0.5 }} />
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell>{speedToDisplay(row.speed)} (G {speedToDisplay(row.gust)}) {unit}</TableCell>
                <TableCell>{row.dir}°</TableCell>
                <TableCell>{row.temp}°C</TableCell>
                <TableCell>{row.rain}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography>Data & Diagnostics (Honesty Contract)</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            <strong>Station Target:</strong> {data?.metadata?.sourceUrl} <br/>
            <strong>Total Local Obs Stored:</strong> {data?.allObs?.length || 0} hours <br/>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <strong>Days of Data Collected:</strong> {data?.allObs ? new Set(data.allObs.map((o: any) => new Date(o.timestampUtc).toISOString().split('T')[0])).size : 0} / 90 days (Goal) <br/>
            <strong>ML Fallback:</strong> Displaying Open-Meteo HRRR/ICON-D2 9-point grid if local overlap {'<'} 168 hours.<br/>
            <em>Not a safety guarantee. Browser ML corrections are experimental statistical estimates.</em>
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 2, fontSize: '1rem' }}>How it works</Typography>
          <Box component="ol" sx={{ pl: 2, m: 0, typography: 'body2', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <li>Fetches recent wind observations and weather station metadata.</li>
            <li>Accumulates historical data locally in your browser storage.</li>
            <li>Retrieves High-Resolution NWP forecasts (like HRRR or ICON) from Open-Meteo.</li>
            <li>Trains a lightweight machine learning model locally to correct wind speed and direction based on historical patterns (requires {'≥'} 7 days of data).</li>
            <li>Generates the final, corrected forecast instantly.</li>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}
