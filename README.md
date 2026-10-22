This is a Next.js 15 App Router project bootstrapped with `create-next-app` that implements a Zero-Key Browser-ML Paragliding Weather Bias-Correction App.

## Live Demos

Here are examples of live deployed station targets. They use different sources to gather real observation data and perform on-device machine learning predictions:

* **[us:fps](https://meteo-rose.vercel.app/us:fps)**: Fetches public observation data from the US National Weather Service (NWS) endpoints.
* **[de:holfuy:263](https://meteo-rose.vercel.app/de:holfuy:263)**: Parses public measurement embeddings for Holfuy targets.
* **[de:IKOBER13](https://meteo-rose.vercel.app/de:IKOBER13)**: Scrapes public Wunderground PWS history.

## Honesty Contract

This application strictly adheres to the following principles regarding data processing and proxy integrations:

1. **No User Keys or Subscriptions Required**: The application accesses strictly public endpoints without user-supplied authentication keys.
2. **Proxy API Routing (Edge)**:
   - Uses `/api/observations` to bypass CORS and proxy weather data on Next.js edge infrastructure.
   - Proxies NWS (National Weather Service) JSON formats for US targets (e.g. `us:fps`).
   - Parses public measurement embeddings for Holfuy targets (e.g. `de:holfuy:263`). *Note: Holfuy limits free historical data windows.*
   - Proxies BrightSky / DWD endpoint for German state observation stations.
   - Scrapes public Wunderground PWS history (e.g. `de:IKOBER13`).
3. **Rolling Browser Caching**: Since public API sources aggressively limit historical windows, the application relies on an IndexedDB (Dexie) store to accumulate rolling overlapping hourly periods locally across visits.
4. **No Fabricated Data**:
   - The UI correctly displays ML bias correction only if the local database has >168 hours of valid overlaps.
   - Raw Open-Meteo forecasts are displayed clearly without silent interpolation in the event of missing or insufficient historical proxies.
   - Rate limit headers and cache max-ages are strictly respected by Vercel edge/Cloudflare CDN architectures.
   - Target metrics for model evaluation (Holdout MAE validation) are natively displayed to human operators alongside the raw vs corrected graphs.
