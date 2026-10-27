import { defineConfig } from '@playwright/test'
import fs from 'node:fs'

// Use the preinstalled Chromium when present (cloud sandbox); elsewhere (CI) Playwright's own browser is used.
const chromium = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', launchOptions: chromium ? { executablePath: chromium } : {} },
  webServer: {
    command: 'npm run build && cd server && PORT=3100 DB_FILE=/tmp/mwc-e2e.db INSECURE_COOKIES=1 REGISTER_MAX=1000 npx tsx src/index.ts',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
