import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' } },
  webServer: {
    command: 'npm run build && cd server && PORT=3100 DB_FILE=/tmp/mwc-e2e.db INSECURE_COOKIES=1 npx tsx src/index.ts',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
