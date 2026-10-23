import { test, expect } from '@playwright/test';

// Use BASE_URL if provided (e.g. for testing a deployed Vercel instance),
// otherwise let Playwright use the default webServer configured in playwright.config.ts
const baseUrl = process.env.BASE_URL || '';

const stations = [
  'us:fps',
  'de:holfuy:263',
  'de:IKOBER13'
];

test.describe('Integration Tests: API Validation', () => {
  test('Returns 404 and appropriate error for unknown station ID in /api/observations', async ({ request }) => {
    const response = await request.get('/api/observations?station=unknown:station:123');
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error).toBe('Unknown station ID');
  });

  test('Returns 400 if station ID is missing', async ({ request }) => {
    const response = await request.get('/api/observations');
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('Station ID is required');
  });
});

test.describe('Integration Tests: Station Data Rendering', () => {
  for (const station of stations) {
    test(`Verify actual data is rendered for station ${station}`, async ({ page }) => {
      // Log client-side console messages for debugging
      page.on('console', msg => {
        console.log(`[Browser Console - ${station}]: ${msg.type()} ${msg.text()}`);
      });

      // Navigate to the station page
      console.log(`Navigating to ${baseUrl}/${station}`);
      await page.goto(`${baseUrl}/${station}`);

      // The animation canvas should start playing immediately while data fetches/processes
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible({ timeout: 10000 });

      // Wait for the main title to ensure page load has started
      await expect(page.getByRole('heading', { name: /Forecast:/ })).toBeVisible({ timeout: 60000 });

      // Wait for at least one table row to appear.
      // This is the core assertion to verify that ACTUAL data is presented,
      // failing the test if the proxy/data source fails.
      const tableRows = page.locator('tbody tr');
      await expect(tableRows.first()).toBeVisible({ timeout: 15000 });

      // Verify that the chart rendered (recharts generates a svg container)
      const chartSurface = page.locator('.recharts-surface').first();
      await expect(chartSurface).toBeVisible({ timeout: 15000 });

      // Check that the first row contains some expected text formats for Wind
      // e.g. "12G15 kmh" or "12 mph"
      const windCell = tableRows.first().locator('td').nth(1); // the wind cell is now column index 1 because we removed score
      const windText = await windCell.textContent();
      expect(windText).toMatch(/[0-9]+.*(kmh|mph)/);
    });
  }
});
