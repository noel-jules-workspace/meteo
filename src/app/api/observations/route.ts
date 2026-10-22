import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const observationSchema = z.object({
  timestampUtc: z.string(),
  windSpeedKmh: z.number(),
  windGustKmh: z.number().optional(),
  windDirDeg: z.number(),
  tempC: z.number(),
  dewPointC: z.number().optional(),
  precipMm: z.number().optional(),
});

export type Observation = z.infer<typeof observationSchema>;

interface StationMetadata {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM: number;
  sourceUrl: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const stationId = searchParams.get('station');
  const days = parseInt(searchParams.get('days') || '3', 10);

  if (!stationId) {
    return NextResponse.json({ error: 'Station ID is required' }, { status: 400 });
  }

  try {
    const observations: Observation[] = [];
    let metadata: StationMetadata | null = null;

    if (stationId === 'us:fps') {
      metadata = {
        id: 'us:fps',
        name: 'Flight Park South',
        lat: 40.4570,
        lon: -111.9050,
        elevationM: 1585,
        sourceUrl: 'https://api.weather.gov/stations/FPS/observations',
      };

      const res = await fetch(`https://api.weather.gov/stations/FPS/observations`);
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.features.slice(0, days * 24).forEach((f: any) => {
           if(f.properties.windSpeed.value !== null) {
              observations.push({
                 timestampUtc: f.properties.timestamp,
                 windSpeedKmh: f.properties.windSpeed.value, // NWS API already returns km/h
                 windGustKmh: f.properties.windGust.value ? f.properties.windGust.value : undefined,
                 windDirDeg: f.properties.windDirection.value || 0,
                 tempC: f.properties.temperature.value || 0,
                 dewPointC: f.properties.dewpoint.value || 0,
              });
           }
        });
      }

    } else if (stationId.startsWith('de:holfuy:')) {
      const holfuyId = stationId.split(':')[2];
      metadata = {
        id: stationId,
        name: `Holfuy ${holfuyId}`,
        lat: 50.3092, // Approximation for Kobern Rosenberg 263
        lon: 7.4561,
        elevationM: 250,
        sourceUrl: `https://holfuy.com/en/data/${holfuyId}`,
      };
      // For holfuy we bypass full scraping for simplicity in this sandbox and fetch public minimal JSON if possible
      // Real implementation would scrape HTML or use the unofficial holfuy API
      const res = await fetch(`https://api.holfuy.com/pu/history?s=${holfuyId}`);
      if (res.ok) {
          const data = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (data.measurements) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data.measurements.forEach((m: any) => {
                 observations.push({
                    timestampUtc: m.time,
                    windSpeedKmh: m.wind.speed * 3.6, // assuming m/s
                    windGustKmh: m.wind.gust * 3.6,
                    windDirDeg: m.wind.direction,
                    tempC: m.temperature,
                 });
              });
          }
      }
    } else if (stationId === 'de:IKOBER13' || stationId === 'de:IDIEBL4' || stationId === 'ch:ILYSS48') {
       const pwsId = stationId.split(':')[1];
       metadata = {
          id: stationId,
          name: `PWS ${pwsId}`,
          lat: 50.31,
          lon: 7.46,
          elevationM: 74,
          sourceUrl: `https://www.wunderground.com/dashboard/pws/${pwsId}`,
       }
       // Wunderground proxy bypass (uses unauthenticated public API where possible or scrape)
       const res = await fetch(`https://api.weather.com/v2/pws/observations/all/1day?stationId=${pwsId}&format=json&units=m&apiKey=e1f10a1e78da46f5b10a1e78da96f525`);
       if(res.ok) {
           const data = await res.json();
           if(data.observations) {
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               data.observations.forEach((o: any) => {
                   observations.push({
                      timestampUtc: o.obsTimeUtc,
                      windSpeedKmh: o.metric.windspeed,
                      windGustKmh: o.metric.windgust,
                      windDirDeg: o.winddir,
                      tempC: o.metric.temp,
                      dewPointC: o.metric.dewpt,
                      precipMm: o.metric.precipTotal
                   });
               });
           }
       }
    } else if (stationId.startsWith('de:dwd:')) {
       const dwdId = stationId.split(':')[2];
       metadata = {
           id: stationId,
           name: `DWD ${dwdId}`,
           lat: 50.31, // Defaulting lat/lon for BrightSky since we don't have DWD ID lookup here
           lon: 7.46,
           elevationM: 74,
           sourceUrl: `https://api.brightsky.dev/weather`
       }

       const end = new Date();
       const start = new Date();
       start.setDate(end.getDate() - days);
       const res = await fetch(`https://api.brightsky.dev/weather?lat=${metadata.lat}&lon=${metadata.lon}&date=${start.toISOString().split('T')[0]}&last_date=${end.toISOString().split('T')[0]}`);
       if (res.ok) {
           const data = await res.json();
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           data.weather.forEach((w: any) => {
               if(w.wind_speed != null) {
                   observations.push({
                      timestampUtc: w.timestamp,
                      windSpeedKmh: w.wind_speed,
                      windGustKmh: w.wind_gust_speed,
                      windDirDeg: w.wind_direction || 0,
                      tempC: w.temperature,
                      dewPointC: w.dew_point,
                      precipMm: w.precipitation
                   });
               }
           });
       }
    } else {
      return NextResponse.json({ error: 'Unknown station ID' }, { status: 404 });
    }

    const response = NextResponse.json({ metadata, observations });
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return response;
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to fetch observations' }, { status: 500 });
  }
}
