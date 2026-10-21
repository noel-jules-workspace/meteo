import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/us:fps');
  await expect(page).toHaveTitle(/Paragliding Weather bias-correction/);
});

test('proxy api is reachable', async ({ request }) => {
  const response = await request.get('/api/observations?station=us:fps&days=1');
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.metadata.id).toBe('us:fps');
  expect(json.observations.length).toBeGreaterThan(0);
});
