import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.resolve('frontend/screenshots');
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const routes = [
  { name: 'playground', path: '/' },
  { name: 'load_balancer', path: '/balancer' },
  { name: 'human_review', path: '/review' },
  { name: 'trust_dashboard', path: '/trust' },
  { name: 'policy_editor', path: '/policies' },
  { name: 'secret_vault', path: '/secrets' },
  { name: 'system_health', path: '/health' },
  { name: 'audit_trail', path: '/audit' }
];

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Desktop
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const desktopPage = await desktopContext.newPage();

  for (const route of routes) {
    console.log(`Capturing desktop: ${route.name}`);
    await desktopPage.goto(`http://localhost:5173${route.path}`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(600);
    await desktopPage.screenshot({
      path: path.join(OUT_DIR, `desktop_${route.name}.png`),
      fullPage: false
    });
  }
  await desktopContext.close();

  // Mobile
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const mobilePage = await mobileContext.newPage();

  for (const route of routes) {
    console.log(`Capturing mobile: ${route.name}`);
    await mobilePage.goto(`http://localhost:5173${route.path}`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(600);
    await mobilePage.screenshot({
      path: path.join(OUT_DIR, `mobile_${route.name}.png`),
      fullPage: false
    });
  }
  await mobileContext.close();

  await browser.close();
  console.log('All screenshots captured successfully in frontend/screenshots/');
}

run().catch(console.error);
