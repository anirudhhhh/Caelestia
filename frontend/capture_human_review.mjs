import { chromium } from 'playwright';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5173/review', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Take screenshot of clean table
  await page.screenshot({
    path: path.resolve('screenshots/desktop_human_review_clean.png'),
    fullPage: false
  });

  // Click on the first row to test whole-row click opening the triage dialog
  const firstRow = page.locator('tbody tr').first();
  await firstRow.click();
  await page.waitForTimeout(600);

  // Take screenshot of opened triage modal
  await page.screenshot({
    path: path.resolve('screenshots/desktop_human_review_modal.png'),
    fullPage: false
  });

  await browser.close();
  console.log('Human review screenshots captured.');
}

run().catch(console.error);
