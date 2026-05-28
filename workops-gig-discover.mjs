#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';
import { join } from 'path';
import { paths } from './lib/workops-paths.mjs';
import yaml from 'js-yaml';

config();

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const max = Number.parseInt(argValue('--max', '80'), 10);
const includeSerpApi = args.includes('--serpapi') || Boolean(process.env.SERPAPI_API_KEY);
const serpApiLimit = Number.parseInt(argValue('--serpapi-limit', '10'), 10);
const serpApiLocation = argValue('--serpapi-location', 'United States');

const goodKeywords = [
  'graphic designer', 'brand designer', 'logo', 'poster', 'flyer', 'pamphlet',
  'thumbnail',
  'company profile',
  'media kit',
  'investor deck',
  'sales deck',
  'report design',
  'pdf design',
  'newsletter design',
  'email design',
  'landing page design',
  'twitch overlay',
  'stream overlay',
  'lottie',
  'gif animation',
  'animated logo',
  'video editing',
  'short video',
  'reel cover',
  'instagram story',
  'instagram post',
  'facebook ad',
  'typography',
  'layout design',
  'diagram',
  'infographic',
  'print ready',
  'print design',
  'apparel design',
  'merch design',
  't-shirt design',
  'etsy',
  'shopify',
  'amazon listing',
  'product listing',
  'image editing',
  'background removal',
  'photo retouching',
  'photo editing',
  'product mockup',
  'mockup',
  'style guide',
  'brand guidelines',
  'brand kit',
  'ebook cover',
  'book cover',
  'album cover',
  'podcast cover',
  'youtube thumbnail',
  'ad banner',
  'web banner',
  'banner',
  'price list',
  'cafe menu',
  'restaurant menu',
  'menu design',
  'lookbook',
  'catalog',
  'brochure',
  'letterhead',
  'business card',
  'packaging design',
  'product label',
  'label design',
  'sticker design',
  'mascot',
  'character design',
  'vector illustration',
  'illustrator',
  'illustration',
  'vector icon',
  'app icon',
  'icons',
  'icon design', 'social media', 'content producer', 'content creator',
  'creative producer', 'ai creative', 'generative ai', 'midjourney', 'comfyui',
  'motion designer', 'visual designer', 'digital designer', 'canva', 'figma',
  'ad creative', 'ecommerce', 'product image', 'presentation designer', 'pitch deck'
];

const badKeywords = [
  'software engineer', 'backend', 'frontend', 'devops', 'nurse', 'doctor',
  'java developer', 'data engineer', 'account executive', 'sales executive'
];


function loadGigSources() {
  const configPath = join(paths.dataDir, 'config', 'gig-sources.yml');
  if (!existsSync(configPath)) return {};
  try {
    return yaml.load(readFileSync(configPath, 'utf8')) || {};
  } catch (error) {
    console.warn(`Could not load gig sources config: ${error.message}`);
    return {};
  }
}

const serpQueries = [];

const defaultSerpQueries = [
  'remote freelance graphic designer',
  'remote logo designer freelance',
  'remote social media designer freelance',
  'remote canva designer freelance',
  'remote brand designer contract',
  'remote packaging designer freelance',
  'remote youtube thumbnail designer',
  'remote product image editor',
  'remote ecommerce designer freelance',
  'remote AI creative producer'
];

let gigSourcesApplied = false;

function applyGigSourcesConfig() {
  if (gigSourcesApplied) return;
  const gigSources = loadGigSources();

  addUnique(goodKeywords, gigSources.positive_terms);
  addUnique(goodKeywords, gigSources.context_terms);
  addUnique(badKeywords, gigSources.negative_terms);
  addUnique(badKeywords, gigSources.location_risks);
  addUnique(badKeywords, gigSources.weak_terms);
  // serpQueries not present in this file

  gigSourcesApplied = true;
}

function addUnique(list, items = []) {
  for (const item of items || []) {
    if (typeof item === 'string' && item.trim() && !list.includes(item.trim())) {
      list.push(item.trim());
    }
  }
}


function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreLead(lead) {
  applyGigSourcesConfig();
  const haystack = `${lead.title} ${lead.company} ${lead.location} ${lead.description} ${(lead.tags || []).join(' ')}`.toLowerCase();
  let score = 0;

  for (const keyword of goodKeywords) {
    if (haystack.includes(keyword.toLowerCase())) score += 8;
  }

  for (const bad of badKeywords) {
    if (haystack.includes(bad.toLowerCase())) score -= 25;
  }

  if (/freelance|contract|part-time|part time|temporary|remote|work from home/i.test(haystack)) score += 14;
  if (/logo|poster|flyer|social|thumbnail|content|brand|creative|designer|visual/i.test(haystack)) score += 16;
  if (/ai|generative|midjourney|comfyui|adobe|figma|canva/i.test(haystack)) score += 12;
  if (/thai|thailand|bangkok|remote/i.test(haystack)) score += 6;

  return score;
}

function keyFor(lead) {
  return `${lead.source}|${lead.company}|${lead.title}|${lead.url}`.toLowerCase();
}

async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 WorkOps gig discover',
      'accept': 'application/json,text/plain,*/*',
    },
  });

  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

async function collectRemoteOk() {
  const data = await fetchJson('https://remoteok.com/api', 'RemoteOK');
  return data
    .filter((item) => item && item.position && item.company)
    .map((item) => ({
      source: 'RemoteOK',
      title: item.position || '',
      company: item.company || '',
      location: item.location || 'Remote',
      url: item.url || item.apply_url || '',
      apply_url: item.apply_url || item.url || '',
      tags: item.tags || [],
      date: item.date || '',
      description: stripHtml(item.description || ''),
    }));
}

async function collectArbeitnow() {
  const data = await fetchJson('https://www.arbeitnow.com/api/job-board-api', 'Arbeitnow');
  const jobs = Array.isArray(data) ? data : (data.data || []);

  return jobs.map((item) => ({
    source: 'Arbeitnow',
    title: item.title || '',
    company: item.company_name || item.company || '',
    location: item.location || 'Remote/Unknown',
    url: item.url || item.slug || '',
    apply_url: item.url || item.slug || '',
    tags: item.tags || [],
    date: item.created_at || '',
    description: stripHtml(item.description || ''),
  }));
}


async function collectSerpApi() {
  applyGigSourcesConfig();

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    console.warn('  skipped SerpApi: SERPAPI_API_KEY missing');
    return [];
  }

  const all = [];
  if (serpQueries.length === 0) {
    addUnique(serpQueries, defaultSerpQueries);
  }

  const queries = (serpQueries || []).slice(0, serpApiLimit);

  console.log(`  SerpApi queries: ${queries.length}/${serpQueries.length}`);

  for (const query of queries) {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_jobs');
    url.searchParams.set('q', query);
    url.searchParams.set('location', serpApiLocation);
    url.searchParams.set('hl', 'en');
    url.searchParams.set('gl', 'us');
    url.searchParams.set('api_key', apiKey);

    try {
      const data = await fetchJson(url.toString(), `SerpApi ${query}`);
      const jobs = data.jobs_results || [];

      for (const item of jobs) {
        all.push({
          source: 'SerpApi Google Jobs',
          title: item.title || '',
          company: item.company_name || '',
          location: item.location || '',
          url: (item.apply_options && item.apply_options[0] && item.apply_options[0].link) || item.share_link || '',
          apply_url: (item.apply_options && item.apply_options[0] && item.apply_options[0].link) || item.share_link || '',
          job_id: item.job_id || '',
          tags: item.extensions || [],
          date: item.detected_extensions?.posted_at || '',
          description: stripHtml(item.description || ''),
        });
      }
    } catch (error) {
      console.error(`  SerpApi query skipped: ${query} — ${error.message}`);
    }
  }

  return all;
}

const collectors = [
  ['RemoteOK', collectRemoteOk],
  ['Arbeitnow', collectArbeitnow],
];

console.log(`SerpApi enabled: ${includeSerpApi ? 'yes' : 'no'}`);
console.log(`SerpApi key present: ${process.env.SERPAPI_API_KEY ? 'yes' : 'no'}`);
console.log(`SerpApi location: ${serpApiLocation}`);

if (includeSerpApi) {
  collectors.push(['SerpApi', collectSerpApi]);
}

const collected = [];

for (const [name, collector] of collectors) {
  try {
    console.log(`Collecting: ${name}`);
    const items = await collector();
    console.log(`  found ${items.length}`);
    collected.push(...items);
  } catch (error) {
    console.error(`  skipped ${name}: ${error.message}`);
  }
}

const seen = new Set();

const leads = collected
  .map((lead) => ({ ...lead, score: scoreLead(lead) }))
  .filter((lead) => lead.score >= 20)
  .filter((lead) => {
    const key = keyFor(lead);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, max);

mkdirSync(paths.dataDir, { recursive: true });

const jsonPath = join(paths.dataDir, 'gig-leads.json');
const mdPath = join(paths.dataDir, 'gig-leads.md');

writeFileSync(jsonPath, JSON.stringify(leads, null, 2), 'utf8');

const lines = [
  '# WorkOps Gig Leads',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Total selected: ${leads.length}`,
  '',
  '| Rank | Score | Source | Company | Title | Location | URL |',
  '|---:|---:|---|---|---|---|---|',
];

leads.forEach((lead, index) => {
  const safe = (v) => String(v || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  lines.push(`| ${index + 1} | ${lead.score} | ${safe(lead.source)} | ${safe(lead.company)} | ${safe(lead.title)} | ${safe(lead.location)} | ${safe(lead.url)} |`);
});

lines.push('');
lines.push('## Next Command');
lines.push('');
lines.push('```powershell');
lines.push('npm run workops:eval-url -- "LEAD_URL" --model gemini-3.5-flash');
lines.push('```');

writeFileSync(mdPath, lines.join('\n'), 'utf8');

console.log('');
console.log(`Selected ${leads.length} gig/freelance leads.`);
console.log(`Saved: ${mdPath}`);
console.log(`Saved: ${jsonPath}`);
