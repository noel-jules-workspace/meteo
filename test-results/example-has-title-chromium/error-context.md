# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: example.spec.ts >> has title
- Location: tests/example.spec.ts:3:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://127.0.0.1:3000/us:fps", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  |
  3  | test('has title', async ({ page }) => {
> 4  |   await page.goto('/us:fps');
     |              ^ Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
  5  |   await expect(page).toHaveTitle(/Paragliding Weather bias-correction/);
  6  | });
  7  |
  8  | test('proxy api is reachable', async ({ request }) => {
  9  |   const response = await request.get('/api/observations?station=us:fps&days=1');
  10 |   expect(response.ok()).toBeTruthy();
  11 |   const json = await response.json();
  12 |   expect(json.metadata.id).toBe('us:fps');
  13 |   expect(json.observations.length).toBeGreaterThan(0);
  14 | });
  15 |
```