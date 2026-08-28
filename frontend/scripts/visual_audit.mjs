import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const ROUTES = [
  { name: '01_playground', path: '/' },
  { name: '02_semantic_router', path: '/load-balancer' },
  { name: '03_human_review', path: '/review' },
  { name: '04_trust_dashboard', path: '/trust' },
  { name: '05_audit_trail', path: '/audit' },
  { name: '06_policy_studio', path: '/policies' },
  { name: '07_secret_vault', path: '/secrets' },
  { name: '08_system_health', path: '/health' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

async function runVisualAudit() {
  console.log('🚀 Starting Playwright Visual Audit...');
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const url = `http://localhost:3000${route.path}`;
      console.log(`📸 Capturing ${route.name} at ${vp.name} (${vp.width}x${vp.height})...`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 8000 });
        await page.waitForTimeout(500); // allow transitions to settle
        const filename = `${route.name}_${vp.name}.png`;
        const filePath = path.join(SCREENSHOT_DIR, filename);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`   ✓ Saved: ${filePath}`);
      } catch (err) {
        console.error(`   ✕ Error capturing ${route.name}:`, err.message);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log('✨ Visual audit completed! All screenshots saved in ./screenshots/');
}

runVisualAudit();
