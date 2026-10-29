// Renders public/icons/icon.svg into the PNG sizes needed by the PWA manifest, using the locally installed Chrome.
import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CHROME = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME_PATH.');

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const maskableSvg = svg
  // full-bleed square for maskable icons; shrink artwork into the safe zone
  .replace(/<rect width="512" height="512" rx="112" fill="url\(#g\)"\/>/, '<rect width="512" height="512" fill="url(#g)"/>')
  .replace(/<rect x="26"[^>]*\/>/, '')
  .replace('</defs>', '</defs><g transform="translate(256 256) scale(0.78) translate(-256 -256)">')
  .replace('</svg>', '</g></svg>');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();

async function render(markup, size, file, transparentBg = false) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:${transparentBg ? 'transparent' : '#072418'}">${markup.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const buf = await page.screenshot({ type: 'png', omitBackground: transparentBg });
  writeFileSync(file, buf);
  console.log('wrote', file);
}

await render(svg, 192, 'public/icons/icon-192.png', true);
await render(svg, 512, 'public/icons/icon-512.png', true);
await render(svg, 180, 'public/icons/apple-touch-icon.png');
await render(maskableSvg, 512, 'public/icons/icon-maskable-512.png');
await browser.close();
