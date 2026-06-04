#!/usr/bin/env node

import dotenv from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const serpApiKey = process.env.SERPAPI_API_KEY || '';
const limit = Number(argValue('--serpapi-limit', '8'));
const outputRoot = 'D:/WorkOps/runs/babar-hospitality-global';

mkdirSync(outputRoot, { recursive: true });
mkdirSync(join(outputRoot, 'data'), { recursive: true });

if (!serpApiKey) {
  console.error('SERPAPI_API_KEY missing. Add it to .env in D:\\WorkOps\\core\\workops-career-ops.');
  process.exit(1);
}

const searches = [
  { q: 'F&B Operations Manager hospitality visa sponsorship', location: 'United Arab Emirates' },
  { q: 'Restaurant Operations Manager hospitality group', location: 'United Arab Emirates' },
  { q: 'Multi Unit Restaurant Manager operations', location: 'Saudi Arabia' },
  { q: 'Pre Opening Restaurant Manager hospitality', location: 'United Arab Emirates' },
  { q: 'Hotel Operations Manager resort', location: 'Thailand' },
  { q: 'Resort Operations Manager hospitality', location: 'Maldives' },
  { q: 'Hospitality Procurement Manager F&B', location: 'Qatar' },
  { q: 'Assistant General Manager hotel resort', location: 'Oman' },
  { q: 'Restaurant General Manager GCC hospitality', location: 'Bahrain' },
  { q: 'Food and Beverage Operations Manager hotel', location: 'Malaysia' },
  { q: 'Resort General Manager hospitality', location: 'Vietnam' },
  { q: 'Hotel General Manager boutique resort', location: 'Cambodia' }
];

function safe(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function md(value) {
  return safe(value).replaceAll('|', '\\|');
}

function pickApplyUrl(job) {
  if (Array.isArray(job.apply_options) && job.apply_options.length) {
    const direct = job.apply_options.find((item) => item.link && !String(item.link).includes('google.com/search'));
    return direct?.link || job.apply_options[0]?.link || '';
  }

  return job.share_link || job.link || '';
}

function haystack(job) {
  return [
    job.title,
    job.company_name,
    job.location,
    job.via,
    job.description,
    ...(job.extensions || []),
    JSON.stringify(job.detected_extensions || {}),
    JSON.stringify(job.job_highlights || [])
  ].join(' ').toLowerCase();
}

function regionType(job) {
  const text = haystack(job);

  if (/united arab emirates|dubai|abu dhabi|saudi|riyadh|jeddah|qatar|doha|oman|muscat|bahrain|kuwait/.test(text)) {
    return 'GCC Hospitality';
  }

  if (/thailand|bangkok|phuket|samui|maldives|malaysia|vietnam|cambodia|resort/.test(text)) {
    return 'Asia Resort';
  }

  return 'Global / Other';
}

function visaRisk(job) {
  const text = haystack(job);

  if (/visa sponsorship|sponsorship provided|relocation provided|work visa|company visa|visa provided/.test(text)) {
    return 'Lower';
  }

  if (/must be authorized|no sponsorship|right to work|work authorization|citizen|permanent resident|local candidates only/.test(text)) {
    return 'High';
  }

  if (/remote|anywhere|international|expat/.test(text)) {
    return 'Medium';
  }

  return 'Medium';
}

function scoreJob(job) {
  const text = haystack(job);
  const reasons = [];
  let score = 0;

  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (/operations manager|operation manager/.test(text)) add(28, 'operations manager fit');
  if (/f&b|food and beverage/.test(text)) add(26, 'F&B fit');
  if (/restaurant/.test(text)) add(22, 'restaurant fit');
  if (/hotel/.test(text)) add(18, 'hotel fit');
  if (/resort/.test(text)) add(18, 'resort fit');
  if (/general manager|assistant general manager|agm/.test(text)) add(18, 'GM/AGM fit');
  if (/multi-unit|multi unit|cluster|regional/.test(text)) add(22, 'multi-unit/regional fit');
  if (/pre-opening|pre opening|opening team|new opening|launch/.test(text)) add(20, 'pre-opening fit');
  if (/procurement|purchasing|sourcing|inventory|cost control|cost controller/.test(text)) add(16, 'procurement/cost control fit');
  if (/haccp|food safety|quality audit|internal audit/.test(text)) add(10, 'food safety/audit fit');
  if (/training|staff training|team leadership|people management/.test(text)) add(10, 'team training fit');

  if (regionType(job) === 'GCC Hospitality') add(18, 'GCC region fit');
  if (regionType(job) === 'Asia Resort') add(12, 'Asia/resort region fit');

  if (visaRisk(job) === 'Lower') add(18, 'visa/relocation signal');
  if (visaRisk(job) === 'High') {
    score -= 35;
    reasons.push('visa/local authorization risk');
  }

  if (/waiter|cashier|barista|line cook|commis|housekeeping attendant|front desk agent|intern|trainee|entry level/.test(text)) {
    score -= 50;
    reasons.push('too junior or wrong function');
  }

  if (/chef de partie|sous chef|executive chef|cook/.test(text) && !/operations|manager|general manager/.test(text)) {
    score -= 35;
    reasons.push('chef-only role risk');
  }

  if (/thai language required|arabic required|mandarin required|native speaker/.test(text)) {
    score -= 20;
    reasons.push('language requirement risk');
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    reasons: [...new Set(reasons)].slice(0, 6)
  };
}

function priorityFor(job) {
  if (job.score >= 78 && job.visaRisk !== 'High') return 'A';
  if (job.score >= 58) return 'B';
  if (job.score >= 40) return 'C';
  return 'D';
}

async function searchGoogleJobs(search) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_jobs');
  url.searchParams.set('q', search.q);
  url.searchParams.set('location', search.location);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', serpApiKey);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`SerpApi ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.jobs_results || [];
}

const selectedSearches = searches.slice(0, limit);
const raw = [];

console.log(`Babar Hospitality Hunt`);
console.log(`Queries: ${selectedSearches.length}/${searches.length}`);

for (const [index, search] of selectedSearches.entries()) {
  try {
    console.log(`Searching ${index + 1}/${selectedSearches.length}: ${search.q} | ${search.location}`);
    const jobs = await searchGoogleJobs(search);
    console.log(`  found ${jobs.length}`);

    for (const job of jobs) {
      const scored = scoreJob(job);

      raw.push({
        source: 'SerpApi Google Jobs',
        query: search.q,
        queryLocation: search.location,
        company: safe(job.company_name),
        title: safe(job.title),
        location: safe(job.location),
        via: safe(job.via),
        description: safe(job.description).slice(0, 900),
        applyUrl: pickApplyUrl(job),
        score: scored.score,
        priority: null,
        regionType: regionType(job),
        visaRisk: visaRisk(job),
        reasons: scored.reasons
      });
    }
  } catch (error) {
    console.warn(`  skipped: ${error.message}`);
  }
}

const seen = new Set();
const leads = raw
  .filter((job) => {
    const key = `${job.company}|${job.title}|${job.location}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .map((job) => ({
    ...job,
    priority: priorityFor(job)
  }))
  .sort((a, b) => b.score - a.score);

const qualified = leads.filter((job) => job.priority !== 'D');
const queue = qualified.slice(0, 30);

const counts = {
  total: queue.length,
  a: queue.filter((job) => job.priority === 'A').length,
  b: queue.filter((job) => job.priority === 'B').length,
  c: queue.filter((job) => job.priority === 'C').length
};

const warnings = [];

for (const job of queue) {
  if (!job.applyUrl) warnings.push(`Missing apply URL: ${job.company} - ${job.title}`);
  if (job.priority === 'A' && job.visaRisk === 'High') warnings.push(`High visa risk in A-list: ${job.company} - ${job.title}`);
}

const generated = new Date().toISOString();

writeFileSync(join(outputRoot, 'babar-leads.json'), JSON.stringify({ generated, leads }, null, 2) + '\n', 'utf8');

const leadsMd = [
  '# Babar Hospitality Leads',
  '',
  `Generated: ${generated}`,
  `Queries: ${selectedSearches.length}`,
  `Total leads: ${leads.length}`,
  '',
  '| Rank | Priority | Score | Region | Visa Risk | Company | Role | Location | Why | URL |',
  '|---:|---|---:|---|---|---|---|---|---|---|',
  ...queue.map((job, index) =>
    `| ${index + 1} | ${job.priority} | ${job.score} | ${md(job.regionType)} | ${md(job.visaRisk)} | ${md(job.company)} | ${md(job.title)} | ${md(job.location)} | ${md(job.reasons.join(', '))} | ${md(job.applyUrl)} |`
  )
].join('\n');

writeFileSync(join(outputRoot, 'babar-leads.md'), leadsMd, 'utf8');

const queueMd = [
  '# Babar Apply Queue',
  '',
  `Generated: ${generated}`,
  'Active profile: Hospitality Operations + F&B Management',
  '',
  '## Daily Rule',
  '',
  'Apply only where Babar looks like an operations/profitability/pre-opening solution, not just another generic hotel manager.',
  '',
  '## Priority System',
  '',
  '- **A:** Apply today after verifying visa/location fit.',
  '- **B:** Good lead. Review next.',
  '- **C:** Backlog unless fast or highly strategic.',
  '',
  '## Today Queue',
  '',
  '| Priority | Rank | Company | Role | Score | Region | Visa Risk | Why | Apply URL |',
  '|---|---:|---|---|---:|---|---|---|---|',
  ...queue.map((job, index) =>
    `| ${job.priority} | ${index + 1} | ${md(job.company)} | ${md(job.title)} | ${job.score} | ${md(job.regionType)} | ${md(job.visaRisk)} | ${md(job.reasons.join(', '))} | ${md(job.applyUrl)} |`
  ),
  '',
  '## Detailed Notes',
  '',
  ...queue.slice(0, 12).map((job, index) => [
    `### ${job.priority}${index + 1} - ${job.company} - ${job.title}`,
    '',
    `- **Score:** ${job.score}`,
    `- **Region type:** ${job.regionType}`,
    `- **Visa risk:** ${job.visaRisk}`,
    `- **Location:** ${job.location}`,
    `- **Why:** ${job.reasons.join(', ')}`,
    `- **Apply URL:** ${job.applyUrl || 'Missing - verify manually'}`,
    '',
    'Suggested proof:',
    '- Use Burgerizzer / multi-branch operations for restaurant group roles.',
    '- Use Regulus / Food Fund for pre-opening and GCC restaurant roles.',
    '- Use IRIS / Pinnacle / Shangrila for hotel or resort operations roles.',
    '- Use Data Sweets turnaround for profit-improvement roles.',
    ''
  ].join('\n'))
].join('\n');

writeFileSync(join(outputRoot, 'today-babar-queue.md'), queueMd, 'utf8');

const healthMd = [
  '# Babar Queue Health',
  '',
  `Generated: ${generated}`,
  '',
  '## Summary',
  '',
  `- Rows: ${counts.total}`,
  `- A-list: ${counts.a}`,
  `- B-list: ${counts.b}`,
  `- C-list: ${counts.c}`,
  `- Warnings: ${warnings.length}`,
  '',
  '## Warnings',
  '',
  ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- None'])
].join('\n');

writeFileSync(join(outputRoot, 'babar-queue-health.md'), healthMd, 'utf8');

console.log('');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-leads.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\today-babar-queue.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-queue-health.md');
console.log('');
console.log(`Rows: ${counts.total} | A: ${counts.a} | B: ${counts.b} | C: ${counts.c} | Warnings: ${warnings.length}`);
