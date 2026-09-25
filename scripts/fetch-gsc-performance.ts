#!/usr/bin/env npx tsx
/**
 * Google Search Console (GSC) Performance Extractor for LastBerth
 *
 * Fetches comprehensive query and page search analytics data via the GSC API
 * conforming to Google's official "all-your-data" guide.
 *
 * Outputs CSVs formatted identically to Google Search Console native exports:
 * - Queries.csv (Top queries,Clicks,Impressions,CTR,Position)
 * - Pages.csv (Top pages,Clicks,Impressions,CTR,Position)
 * - Countries.csv (Country,Clicks,Impressions,CTR,Position)
 * - Devices.csv (Device,Clicks,Impressions,CTR,Position)
 * - Dates.csv (Date,Clicks,Impressions,CTR,Position)
 * - Pages_and_Queries.csv (Page,Query,Clicks,Impressions,CTR,Position)
 * - Search_Appearance.csv (Search Appearance,Clicks,Impressions,CTR,Position)
 *
 * Usage:
 *   npx tsx scripts/fetch-gsc-performance.ts [options]
 *   npm run gsc:fetch
 *
 * Options:
 *   --site <url>            Site property (default: sc-domain:lastberth.com or GSC_SITE_URL)
 *   --days <number>         Fetch last N days of data (default: 28)
 *   --start-date <YYYY-MM-DD> Exact start date
 *   --end-date <YYYY-MM-DD>   Exact end date
 *   --type <type>           Search type: web | image | video | news | discover | googleNews (default: web)
 *   --key-file <path>       Path to Google service account JSON key file
 *   --out <dir>             Output directory (default: data/gsc/<site>-<date-range>)
 *   --setup-auth            Interactive guide to configure GSC API credentials
 *   --dry-run               Simulate API extraction without hitting live API
 *   --help                  Display help message
 */

import fs from 'fs';
import path from 'path';
import { google, searchconsole_v1 } from 'googleapis';

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface CliArgs {
  siteUrl: string;
  days: number;
  startDate?: string;
  endDate?: string;
  searchType: string;
  keyFile?: string;
  outputDir?: string;
  setupAuth: boolean;
  dryRun: boolean;
  help: boolean;
}

// -----------------------------------------------------------------------------
// Argument Parsing
// -----------------------------------------------------------------------------
function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    siteUrl: process.env.GSC_SITE_URL || 'sc-domain:lastberth.com',
    days: 28,
    searchType: 'web',
    setupAuth: false,
    dryRun: false,
    help: false,
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GSC_KEY_FILE,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--setup-auth') {
      args.setupAuth = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--site' && argv[i + 1]) {
      args.siteUrl = argv[++i];
    } else if (arg === '--days' && argv[i + 1]) {
      args.days = parseInt(argv[++i], 10) || 28;
    } else if (arg === '--start-date' && argv[i + 1]) {
      args.startDate = argv[++i];
    } else if (arg === '--end-date' && argv[i + 1]) {
      args.endDate = argv[++i];
    } else if (arg === '--type' && argv[i + 1]) {
      args.searchType = argv[++i];
    } else if (arg === '--key-file' && argv[i + 1]) {
      args.keyFile = argv[++i];
    } else if (arg === '--out' && argv[i + 1]) {
      args.outputDir = argv[++i];
    }
  }

  return args;
}

// -----------------------------------------------------------------------------
// Helper: Calculate Default Date Range (Accounting for GSC 2-3 Day Lag)
// -----------------------------------------------------------------------------
function computeDateRange(days: number, customStart?: string, customEnd?: string) {
  if (customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }

  // Google Search Console data is typically finalized 2 to 3 days ago
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 3);

  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));

  const format = (d: Date) => d.toISOString().split('T')[0];

  return {
    startDate: customStart || format(start),
    endDate: customEnd || format(end),
  };
}

// -----------------------------------------------------------------------------
// Authentication Initializer
// -----------------------------------------------------------------------------
async function getSearchConsoleClient(keyFilePath?: string): Promise<searchconsole_v1.Searchconsole> {
  const scopes = ['https://www.googleapis.com/auth/webmasters.readonly'];

  // 1. Direct Service Account Key File
  if (keyFilePath && fs.existsSync(keyFilePath)) {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes,
    });
    return google.searchconsole({ version: 'v1', auth });
  }

  // 2. Service Account JSON in environment variable (GSC_SERVICE_ACCOUNT_JSON)
  if (process.env.GSC_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes,
      });
      return google.searchconsole({ version: 'v1', auth });
    } catch (e) {
      console.warn('⚠️ Failed to parse GSC_SERVICE_ACCOUNT_JSON as JSON. Trying standard auth...');
    }
  }

  // 3. OAuth2 Client ID + Secret + Refresh Token
  if (process.env.GSC_CLIENT_ID && process.env.GSC_CLIENT_SECRET && process.env.GSC_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GSC_CLIENT_ID,
      process.env.GSC_CLIENT_SECRET,
      'http://localhost:3000/oauth2callback'
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GSC_REFRESH_TOKEN,
    });
    return google.searchconsole({ version: 'v1', auth: oauth2Client });
  }

  // 4. Default Application Default Credentials (ADC) or GOOGLE_APPLICATION_CREDENTIALS
  const auth = new google.auth.GoogleAuth({
    scopes,
  });
  return google.searchconsole({ version: 'v1', auth });
}

// -----------------------------------------------------------------------------
// Paginated Search Analytics Query (Google "All Your Data" Architecture)
// -----------------------------------------------------------------------------
async function fetchFullDataset(
  client: searchconsole_v1.Searchconsole,
  siteUrl: string,
  requestBody: {
    startDate: string;
    endDate: string;
    dimensions: string[];
    type?: string;
    aggregationType?: string;
    dimensionFilterGroups?: any[];
  }
): Promise<GscRow[]> {
  const MAX_ROWS = 25000;
  let startRow = 0;
  const allRows: GscRow[] = [];

  while (true) {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        ...requestBody,
        rowLimit: MAX_ROWS,
        startRow,
      },
    });

    const rows = response.data.rows || [];
    if (rows.length === 0) {
      break;
    }

    allRows.push(...(rows as GscRow[]));

    if (rows.length < MAX_ROWS) {
      break;
    }

    startRow += MAX_ROWS;
    // Log progress if dataset is massive (>25k rows)
    console.log(`  Fetched ${allRows.length} rows so far (startRow=${startRow})...`);
  }

  return allRows;
}

// -----------------------------------------------------------------------------
// CSV Formatting & Escaping (Strict GSC UI Alignment)
// -----------------------------------------------------------------------------
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCtr(ctr?: number): string {
  if (ctr === undefined || ctr === null) return '0%';
  return `${(ctr * 100).toFixed(2).replace(/\.00$/, '')}%`;
}

function formatPosition(pos?: number): string {
  if (pos === undefined || pos === null) return '0';
  const rounded = Math.round(pos * 100) / 100;
  return rounded.toString();
}

function convertRowsToCsv(
  headerLabels: string[],
  rows: GscRow[],
  dimensionCount: number
): string {
  const lines: string[] = [];
  lines.push(headerLabels.map(escapeCsv).join(','));

  for (const row of rows) {
    const keys = row.keys || [];
    const keyCols = keys.slice(0, dimensionCount).map(escapeCsv);
    const clicks = row.clicks ?? 0;
    const impressions = row.impressions ?? 0;
    const ctr = formatCtr(row.ctr);
    const position = formatPosition(row.position);

    lines.push([...keyCols, clicks, impressions, ctr, position].join(','));
  }

  return lines.join('\n') + '\n';
}

// -----------------------------------------------------------------------------
// Setup & Auth Guide Helper
// -----------------------------------------------------------------------------
function printAuthSetupGuide() {
  console.log(`
================================================================================
  🔑 Google Search Console (GSC) API Authentication Setup Guide
================================================================================

To allow LastBerth's automated daily script to fetch search performance:

Option A: Service Account (Recommended for Automations / CI / Cron)
-------------------------------------------------------------------
1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Select or create your project (e.g. "LastBerth SEO").
3. Enable the "Google Search Console API" (Webmasters API):
   https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
4. Create a Service Account:
   - Go to IAM & Admin > Service Accounts > Create Service Account.
   - Name it e.g. "gsc-extractor@<project-id>.iam.gserviceaccount.com".
   - Grant it no special GCP roles (Search Console uses its own permissions).
5. Generate a Key:
   - Click the created Service Account > Keys tab > Add Key > Create new key > JSON.
   - Download the JSON key file and save it securely (e.g. ./gsc-service-account.json).
6. Authorize the Service Account in Google Search Console:
   - Open Search Console: https://search.google.com/search-console
   - Select property: sc-domain:lastberth.com (or your domain property).
   - Go to Settings ⚙️ > Users and permissions > Add user.
   - Enter your Service Account email address.
   - Permission: Select "Full" (or "Owner").
   - Click Add.
7. Configure Environment:
   - Add to your .env or shell:
     GOOGLE_APPLICATION_CREDENTIALS=/path/to/gsc-service-account.json
     or
     GSC_KEY_FILE=./gsc-service-account.json

Option B: OAuth2 (For Personal / User-delegated Access)
------------------------------------------------------
1. Create an OAuth 2.0 Client ID (Desktop app or Web app) in GCP Console.
2. Generate a refresh token with scope 'https://www.googleapis.com/auth/webmasters.readonly'.
3. Set environment variables in .env:
   GSC_CLIENT_ID=your_client_id
   GSC_CLIENT_SECRET=your_client_secret
   GSC_REFRESH_TOKEN=your_refresh_token

Once configured, simply run:
  npm run gsc:fetch
================================================================================
`);
}

// -----------------------------------------------------------------------------
// Main Execution Workflow
// -----------------------------------------------------------------------------
async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(`
Google Search Console Daily Performance Extractor

Usage:
  npx tsx scripts/fetch-gsc-performance.ts [options]
  npm run gsc:fetch

Options:
  --site <url>            GSC property identifier (default: sc-domain:lastberth.com)
  --days <number>         Number of days of data to pull (default: 28)
  --start-date <YYYY-MM-DD> Specific start date
  --end-date <YYYY-MM-DD>   Specific end date
  --type <type>           Search type: web | image | video | news | discover (default: web)
  --key-file <path>       Path to Service Account JSON key
  --out <dir>             Output directory
  --setup-auth            Show step-by-step setup guide for API authentication
  --dry-run               Test runner and directory creation without making API calls
  --help                  Show this message
`);
    process.exit(0);
  }

  if (args.setupAuth) {
    printAuthSetupGuide();
    process.exit(0);
  }

  const { startDate, endDate } = computeDateRange(args.days, args.startDate, args.endDate);
  const siteSlug = args.siteUrl.replace(/^sc-domain:/, '').replace(/https?:\/\//, '').replace(/[^\w.-]/g, '_');
  
  const targetDir = args.outputDir || path.join(
    process.cwd(),
    'data',
    'gsc',
    `${siteSlug}-Performance-on-Search-${startDate}_to_${endDate}`
  );

  console.log(`🚀 LastBerth GSC Performance Extractor`);
  console.log(`--------------------------------------------------`);
  console.log(`  Site Property : ${args.siteUrl}`);
  console.log(`  Date Range    : ${startDate} to ${endDate} (${args.days} days)`);
  console.log(`  Search Type   : ${args.searchType}`);
  console.log(`  Output Folder : ${targetDir}`);
  console.log(`--------------------------------------------------\n`);

  fs.mkdirSync(targetDir, { recursive: true });

  if (args.dryRun) {
    console.log(`🧪 [Dry Run] Simulating queries and writing mock output...`);
    const mockQueries: GscRow[] = [
      { keys: ['chhath puja special train 2026 time table'], clicks: 346, impressions: 1279, ctr: 0.2705, position: 1.54 },
      { keys: ['puja special train 2026'], clicks: 279, impressions: 2015, ctr: 0.1385, position: 3.72 },
    ];
    const mockPages: GscRow[] = [
      { keys: ['https://lastberth.com/blog/diwali-special-train-2026-booking-dates-routes-list'], clicks: 3560, impressions: 59182, ctr: 0.0602, position: 5.2 },
    ];
    fs.writeFileSync(path.join(targetDir, 'Queries.csv'), convertRowsToCsv(['Top queries', 'Clicks', 'Impressions', 'CTR', 'Position'], mockQueries, 1));
    fs.writeFileSync(path.join(targetDir, 'Pages.csv'), convertRowsToCsv(['Top pages', 'Clicks', 'Impressions', 'CTR', 'Position'], mockPages, 1));
    console.log(`✅ Dry run complete. Saved sample files to ${targetDir}`);
    return;
  }

  let client: searchconsole_v1.Searchconsole;
  try {
    client = await getSearchConsoleClient(args.keyFile);
  } catch (err: any) {
    console.error(`❌ Authentication Error: Could not initialize Google Search Console client.`);
    console.error(err.message || err);
    console.log(`\nRun 'npx tsx scripts/fetch-gsc-performance.ts --setup-auth' for help setting up credentials.`);
    process.exit(1);
  }

  // Define the extraction jobs to execute
  const jobs = [
    {
      name: 'Top Queries',
      filename: 'Queries.csv',
      headers: ['Top queries', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['query'],
      dimCount: 1,
    },
    {
      name: 'Top Pages',
      filename: 'Pages.csv',
      headers: ['Top pages', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['page'],
      dimCount: 1,
    },
    {
      name: 'Countries Breakdown',
      filename: 'Countries.csv',
      headers: ['Country', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['country'],
      dimCount: 1,
    },
    {
      name: 'Devices Breakdown',
      filename: 'Devices.csv',
      headers: ['Device', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['device'],
      dimCount: 1,
    },
    {
      name: 'Daily Trends (Dates)',
      filename: 'Dates.csv',
      headers: ['Date', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['date'],
      dimCount: 1,
    },
    {
      name: 'Search Appearance',
      filename: 'Search_Appearance.csv',
      headers: ['Search Appearance', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['searchAppearance'],
      dimCount: 1,
    },
    {
      name: 'Pages & Queries Mapping',
      filename: 'Pages_and_Queries.csv',
      headers: ['Top pages', 'Top queries', 'Clicks', 'Impressions', 'CTR', 'Position'],
      dimensions: ['page', 'query'],
      dimCount: 2,
    },
  ];

  const resultsSummary: Record<string, any> = {
    siteUrl: args.siteUrl,
    startDate,
    endDate,
    searchType: args.searchType,
    generatedAt: new Date().toISOString(),
    datasets: {},
  };

  for (const job of jobs) {
    process.stdout.write(`⏳ Fetching ${job.name}... `);
    try {
      const rows = await fetchFullDataset(client, args.siteUrl, {
        startDate,
        endDate,
        dimensions: job.dimensions,
        type: args.searchType,
      });

      const csvContent = convertRowsToCsv(job.headers, rows, job.dimCount);
      const filePath = path.join(targetDir, job.filename);
      fs.writeFileSync(filePath, csvContent, 'utf-8');

      const totalClicks = rows.reduce((acc, r) => acc + (r.clicks || 0), 0);
      const totalImpressions = rows.reduce((acc, r) => acc + (r.impressions || 0), 0);

      resultsSummary.datasets[job.filename] = {
        rows: rows.length,
        totalClicks,
        totalImpressions,
      };

      console.log(`✅ ${rows.length} rows saved to ${job.filename} (${totalClicks.toLocaleString()} clicks, ${totalImpressions.toLocaleString()} imp)`);
    } catch (err: any) {
      console.log(`⚠️ Failed`);
      console.error(`   Error details:`, err.message || err);
      if (err.code === 403) {
        console.error(`   👉 Ensure the authenticated account or service account is added as a user to '${args.siteUrl}' in Google Search Console Settings.`);
      }
    }
  }

  // Write Summary JSON
  fs.writeFileSync(
    path.join(targetDir, 'summary.json'),
    JSON.stringify(resultsSummary, null, 2),
    'utf-8'
  );

  // Maintain a 'latest' symlink/copy in data/gsc/latest
  const latestDir = path.join(process.cwd(), 'data', 'gsc', 'latest');
  try {
    fs.mkdirSync(latestDir, { recursive: true });
    for (const job of jobs) {
      const srcFile = path.join(targetDir, job.filename);
      const destFile = path.join(latestDir, job.filename);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
      }
    }
    fs.copyFileSync(path.join(targetDir, 'summary.json'), path.join(latestDir, 'summary.json'));
    console.log(`\n📌 Copied latest datasets to: data/gsc/latest/`);
  } catch (e) {
    // Non-critical
  }

  console.log(`\n🎉 Extraction Complete! Output available at:`);
  console.log(`   📁 ${targetDir}`);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
