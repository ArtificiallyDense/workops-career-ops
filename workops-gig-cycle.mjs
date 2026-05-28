#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { paths } from './lib/workops-paths.mjs';
import yaml from 'js-yaml';

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const max = argValue('--max', '200');
const maxEval = Number.parseInt(argValue('--max-eval', argValue('--eval-top', '8')), 10);
const evalMinScore = Number.parseInt(argValue('--eval-min-score', '75'), 10);
const shortlistMinScore = Number.parseInt(argValue('--shortlist-min-score', '60'), 10);
const minutes = Number.parseFloat(argValue('--minutes', '8'));
const model = argValue('--model', process.env.GEMINI_MODEL_GIGS || process.env.GEMINI_MODEL || 'gemini-3.5-flash');
const includeEvaluated = args.includes('--include-evaluated');
const noEval = args.includes('--no-eval');

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

function addUnique(list, items = []) {
  for (const item of items || []) {
    if (typeof item === 'string' && item.trim() && !list.includes(item.trim())) {
      list.push(item.trim());
    }
  }
}

function runNode(script, scriptArgs = []) {
  if (!existsSync(script)) {
    console.error(`Missing script: ${script}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNodeSoft(script, scriptArgs = []) {
  if (!existsSync(script)) {
    console.error(`Missing script: ${script}`);
    return { status: 1 };
  }

  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    return { status: 1 };
  }

  return { status: result.status ?? 1 };
}

function slugify(value) {
  return String(value || 'lead')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function writeLeadJdFile(lead) {
  const dir = join(process.cwd(), 'jds');
  mkdirSync(dir, { recursive: true });

  const filename = `${slugify(`${lead.company || 'company'}-${lead.title || 'role'}`)}-serpapi.txt`;
  const path = join(dir, filename);

  const body = [
    `Company: ${lead.company || ''}`,
    `Role: ${lead.title || ''}`,
    `Source: ${lead.source || ''}`,
    `Location: ${lead.location || ''}`,
    `URL: ${lead.url || ''}`,
    `Apply URL: ${lead.apply_url || lead.url || ''}`,
    `Tags: ${(lead.tags || []).join(', ')}`,
    '',
    'Job Description:',
    lead.description || '',
  ].join('\n');

  writeFileSync(path, body, 'utf8');
  return path;
}

function clean(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^[-:\s]+|[-:\s]+$/g, '')
    .trim();
}

function extractSummaryField(text, name) {
  const summary =
    text.match(/---SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/) ||
    text.match(/---_SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/);

  const block = summary ? summary[1] : text;
  const match = block.match(new RegExp(`${name}:\\s*(.+)`, 'i'));
  return match ? clean(match[1]) : null;
}

function extractHeader(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith('# Evaluation:'));
  if (!line) return {};
  const cleanLine = line.replace('# Evaluation:', '').trim();
  const parts = cleanLine.split(/\s+(?:—|â€”|-)\s+/);
  return {
    company: clean(parts[0]),
    role: clean(parts.slice(1).join(' - ')),
  };
}

function evalKey(company, role) {
  return `${clean(company).toLowerCase()}::${clean(role).toLowerCase()}`;
}

function normalizeUrl(url) {
  return String(url || '')
    .replace(/\?.*$/, '')
    .replace(/#.*$/, '')
    .replace(/\/$/, '')
    .toLowerCase()
    .trim();
}

function evaluatedHistory() {
  const keys = new Set();
  const urls = new Set();

  if (!existsSync(paths.reportsDir)) return { keys, urls };

  for (const file of readdirSync(paths.reportsDir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(paths.reportsDir, file), 'utf8');
    const header = extractHeader(text);
    const company = extractSummaryField(text, 'COMPANY') || header.company;
    const role = extractSummaryField(text, 'ROLE') || header.role;
    const urlMatch = text.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/i) || text.match(/URL:\s*(https?:\/\/\S+)/i);
    if (urlMatch) urls.add(normalizeUrl(urlMatch[1]));

    if (company && role && company.length <= 80) {
      keys.add(evalKey(company, role));
    }
  }

  return { keys, urls };
}

function textOf(lead) {
  return `${lead.title || ''} ${lead.company || ''} ${lead.location || ''} ${lead.description || ''} ${(lead.tags || []).join(' ')}`.toLowerCase();
}

function titleOf(lead) {
  return String(lead.title || '').toLowerCase();
}

const obviousBadTitleRegex = /growth manager|performance marketing manager|customer support|customer success|sales manager|account executive|business development|e[- ]?commerce growth manager/i;

function shortlistKey(lead) {
  return `${lead.company || ''}|${lead.title || ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const hardGood = [
  'graphic designer',
  'brand designer',
  'designer - brand',
  'junior graphic designer',
  'creative designer',
  'creative strategist',
  'motion',
  'video editing',
  'videographer',
  'content creator',
  'content producer',
  'social media',
  'canva',
  'figma',
  'ai creative',
  'generative ai',
  'midjourney',
  'comfyui',
  'poster',
  'logo',
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
  'icon design',
  'ecommerce',
  'presentation',
  'pitch deck',
  'marketing designer',
  'visual designer',
  'digital designer',
  'copywriter',
  'content writer'
];

const hardBad = [
  'maintenance',
  'crew member',
  'therapist',
  'physiotherapist',
  'medical assistant',
  'nurse',
  'doctor',
  'driver',
  'range operator',
  'data entry',
  'it support',
  'business analyst',
  'finance',
  'buchhalter',
  'account manager',
  'sales director',
  'recruiter',
  'talent acquisition',
  'head of finance',
  'product manager',
  'software',
  'engineer',
  'backend',
  'frontend',
  'devops',
  'microbiology',
  'pmhnp',
  'proofreader',
  'pharmaceutical proofreader',
  'founders associate',
  'working student',
  'werkstudent',
  'praktikant',
  'praktikum',
  'intern',
  'internship',
  'city scout',
  'growth manager',
  'performance marketing manager',
  'customer support specialist',
  'customer support',
  'e commerce growth manager',
  'e-commerce growth manager',
  'minijob',
  'düsseldorf',
  'duesseldorf',
  'gerente de opera'
];

const weakTerms = [
  'werkstudent',
  'working student',
  'praktikant',
  'praktikum',
  'intern',
  'internship',
  'german speaker',
  'native german',
  'deutsch',
  'remote in de',
  'weekly shoots',
  'in-person shoots',
  'must be based'
];

const cycleGigSources = loadGigSources();
addUnique(hardGood, cycleGigSources.positive_terms);
addUnique(hardBad, cycleGigSources.negative_terms);
addUnique(weakTerms, cycleGigSources.weak_terms);

function bonusScore(lead) {
  const text = textOf(lead);
  const title = titleOf(lead);
  let score = lead.score || 0;

  if (/freelance|contract|part-time|part time|remote|worldwide|anywhere/i.test(text)) score += 14;
  if (/canva|figma|adobe|midjourney|comfyui|ai|generative/i.test(text)) score += 14;
  if (/fashion|luxury|jewelry|bags|ecommerce|dtc|creative strategy/i.test(text)) score += 18;
  if (/logo|poster|social|content|brand|creative|designer|video|motion|visual/i.test(title)) score += 20;
  if (/thailand|bangkok|asia|hong kong|singapore|remote/i.test(text)) score += 8;
  if (weakTerms.some((term) => text.includes(term))) score -= 14;

  return score;
}

function reason(lead) {
  const title = titleOf(lead);
  const text = textOf(lead);
  const reasons = [];

  if (/canva|figma|adobe/i.test(text)) reasons.push('design tool fit');
  if (/graphic designer|designer|visual/i.test(title)) reasons.push('design role');
  if (/brand/i.test(title + text)) reasons.push('brand fit');
  if (/content|social|copywriter/i.test(title)) reasons.push('content/social fit');
  if (/creative strategist|creative/i.test(title)) reasons.push('creative strategy fit');
  if (/motion|video|videographer/i.test(title)) reasons.push('motion/video fit');
  if (/fashion|luxury|jewelry|bags|ecommerce/i.test(text)) reasons.push('fashion/ecommerce fit');
  if (/ai|midjourney|comfyui|generative/i.test(text)) reasons.push('AI angle');
  if (/freelance|contract|part-time|remote|worldwide/i.test(text)) reasons.push('remote/flexible');

  return reasons.length ? reasons.join(', ') : 'possible adjacent fit';
}

console.log('Step 1/4: Discover wider gig/job leads...');
runNode('workops-gig-discover.mjs', [
  '--max',
  max,
  ...(args.includes('--serpapi') ? ['--serpapi'] : []),
  ...(args.includes('--serpapi-limit') ? ['--serpapi-limit', argValue('--serpapi-limit', '10')] : []),
  ...(args.includes('--serpapi-location') ? ['--serpapi-location', argValue('--serpapi-location', 'United States')] : []),
]);

const leadsPath = join(paths.dataDir, 'gig-leads.json');
if (!existsSync(leadsPath)) {
  console.error(`Missing leads file after discovery: ${leadsPath}`);
  process.exit(1);
}

console.log('');
console.log('Step 2/4: Build smart shortlist and skip already evaluated leads...');

const done = evaluatedHistory();
const leads = JSON.parse(readFileSync(leadsPath, 'utf8'));

const shortlist = leads
  .filter((lead) => {
    const title = titleOf(lead);
    const text = textOf(lead);

    if (hardBad.some((bad) => title.includes(bad))) return false;
    if (obviousBadTitleRegex.test(title)) return false;
    if (weakTerms.some((term) => text.includes(term))) return false;
    if (/proofreader|pharmaceutical|medical|physio|founders associate|city scout|working student|werkstudent|praktikant|praktikum|internship|native german|german speaker|deutsch|remote in de/i.test(text)) return false;
    if (!hardGood.some((good) => text.includes(good))) return false;

    return includeEvaluated || (!done.keys.has(evalKey(lead.company, lead.title)) && !done.urls.has(normalizeUrl(lead.url)));
  })
  .map((lead) => ({
    ...lead,
    shortlist_score: bonusScore(lead),
    reason: reason(lead),
  }))
  .filter((lead) => lead.shortlist_score >= shortlistMinScore)
  .filter((lead, index, all) => all.findIndex((other) => shortlistKey(other) === shortlistKey(lead)) === index)
  .sort((a, b) => b.shortlist_score - a.shortlist_score)
  .slice(0, 50);

const shortlistJson = join(paths.dataDir, 'gig-shortlist.json');
const shortlistMd = join(paths.dataDir, 'gig-shortlist.md');

writeFileSync(shortlistJson, JSON.stringify(shortlist, null, 2), 'utf8');

const lines = [
  '# WorkOps Gig Shortlist',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Selected: ${shortlist.length}`,
  `Evaluated leads skipped: ${includeEvaluated ? 'no' : 'yes'}`,
  `Auto-eval threshold: ${evalMinScore}`,
  `Shortlist minimum score: ${shortlistMinScore}`,
  '',
  '| Rank | Score | Source | Company | Title | Location | Why | URL |',
  '|---:|---:|---|---|---|---|---|---|',
];

for (const [index, lead] of shortlist.entries()) {
  const safe = (value) => String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  lines.push(`| ${index + 1} | ${lead.shortlist_score} | ${safe(lead.source)} | ${safe(lead.company)} | ${safe(lead.title)} | ${safe(lead.location)} | ${safe(lead.reason)} | ${safe(lead.url)} |`);
}

writeFileSync(shortlistMd, lines.join('\n'), 'utf8');

console.log(`Shortlisted ${shortlist.length} unevaluated leads.`);
console.log(`Saved: ${shortlistMd}`);

const selected = noEval
  ? []
  : shortlist
      .filter((lead) => lead.shortlist_score >= evalMinScore)
      .filter((lead) => !/werkstudent|working student|praktikant|praktikum|intern|internship|native german|german speaker|remote in de/i.test(textOf(lead)))
      .slice(0, maxEval);

if (selected.length === 0) {
  console.log('');
  console.log('Step 3/4: No leads qualified for auto-evaluation.');
  console.log(`Try lowering threshold, e.g. --eval-min-score ${Math.max(50, evalMinScore - 10)}`);
  process.exit(0);
}

console.log('');
console.log(`Step 3/4: Auto-evaluating ${selected.length} lead(s) with ${model}...`);

const start = Date.now();
let evaluated = 0;

for (const [index, lead] of selected.entries()) {
  const elapsedMinutes = (Date.now() - start) / 60000;

  if (elapsedMinutes >= minutes) {
    console.log(`Stopping because --minutes ${minutes} was reached.`);
    break;
  }

  console.log('');
  console.log(`=== Gig ${index + 1}/${selected.length}: ${lead.company} — ${lead.title} ===`);
  console.log(`Shortlist score: ${lead.shortlist_score}`);
  console.log(lead.url);

  const evalResult = String(lead.source || '').toLowerCase().includes('serpapi')
    ? runNodeSoft('gemini-eval.mjs', ['--file', writeLeadJdFile(lead), '--model', model])
    : runNodeSoft('workops-eval-url.mjs', [lead.url, '--model', model]);

  if (evalResult.status === 0) {
    evaluated++;
  } else {
    console.warn(`Evaluation skipped/failed but hunt will continue: ${lead.company} — ${lead.title}`);
  }
}

console.log('');
console.log(`Evaluated ${evaluated} lead(s).`);

console.log('');
console.log('Step 4/4: Updating opportunity review...');
runNode('workops-review.mjs');

console.log('');
console.log('Gig hunt complete.');
console.log(`Review: ${join(dirname(paths.reportsDir), 'opportunity-review.md')}`);
