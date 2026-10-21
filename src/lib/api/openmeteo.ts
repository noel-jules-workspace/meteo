export interface GridPoint {
  lat: number;
  lon: number;
  elevation: number;
}

export interface NWPHourly {
  time: string[];
  temperature_2m: number[];
  dew_point_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  precipitation_probability: number[];
  precipitation: number[];
  cape: number[];
  lifted_index: number[];
  boundary_layer_height: number[];
  cloud_cover: number[];
}

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: NWPHourly;
}

const VARIABLES = 'temperature_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,precipitation,cape,lifted_index,boundary_layer_height,cloud_cover';

export async function fetchNWPForecast(lat: number, lon: number, stationElevation: number, pastDays: number = 0, forecastDays: number = 3) {
  // Generate a 3x3 grid
  const gridSpacing = 0.02; // ~2km
  const lats = [lat - gridSpacing, lat, lat + gridSpacing];
  const lons = [lon - gridSpacing, lon, lon + gridSpacing];

  const queries = [];
  for(let i=0; i<3; i++){
    for(let j=0; j<3; j++){
      queries.push(`latitude=${lats[i]}&longitude=${lons[j]}`);
    }
  }

  const combinedLatLons = `latitude=${lats.flatMap(l=>[l,l,l]).join(',')}&longitude=${lons.flatMap(()=>lons).join(',')}`;

  const baseUrl = pastDays > 0 ? 'https://historical-forecast-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast';
  const url = `${baseUrl}?${combinedLatLons}&hourly=${VARIABLES}&past_days=${pastDays}&forecast_days=${forecastDays}&models=icon_d2,hrrr,best_match`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch NWP data');
  }

  const data = await res.json() as OpenMeteoResponse[];

  // Array of 9 responses
  const grids = data.map((d) => {
    return {
      metadata: {
         lat: d.latitude,
         lon: d.longitude,
         grid_elevation: d.elevation,
         elevation_diff: d.elevation - stationElevation
      },
      hourly: d.hourly
    };
  });

  return grids;
}
