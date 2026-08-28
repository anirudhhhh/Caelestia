import { chromium } from 'playwright';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

  await page.goto('http://localhost:5173/policies', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Scroll to Autonomous Policy Recommendations section
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Autonomous Policy'));
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(600);

  await page.screenshot({
    path: path.resolve('screenshots/desktop_policy_recommendations.png'),
    fullPage: false
  });

  await browser.close();
  console.log('Policy recommendations screenshot captured successfully.');
}

run().catch(console.error);
