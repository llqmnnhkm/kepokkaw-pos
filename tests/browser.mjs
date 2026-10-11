// Starts headless Chrome for the tests. Uses the Chrome that comes with puppeteer,
// or another one when CHROME_PATH is set (CHROME_ARGS can add extra flags, separated by spaces).
import puppeteer from 'puppeteer';

export function launch() {
  const extra = (process.env.CHROME_ARGS || '').split(' ').filter(Boolean);
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', ...extra],
  });
}
