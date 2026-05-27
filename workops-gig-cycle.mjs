#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const max = argValue('--max', '80');
const evalTop = Number.parseInt(argValue('--eval-top', '0'), 10);
const model = argValue('--model', process.env.GEMINI_MODEL_GIGS || process.env.GEMINI_MODEL || 'gemini-3.5-flash');

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

function textOf(lead) {
  return `${lead.title || ''} ${lead.company || ''} ${lead.location || ''} ${lead.description || ''} ${(lead.tags || []).join(' ')}`.toLowerCase();
}

function titleOf(lead) {
  return String(lead.title || '').toLowerCase();
}

const hardGood = [
  'graphic designer',
  'brand designer',
  'designer - brand',
  'junior graphic designer',
  'creative designer',
  'motion',
  'video editing',
  'videographer',
  'content creator',
  'content producer',
  'social media',
  'canva',
  'ai-design',
  'ai design',
  'screen- & ai-design',
  'creative strategist',
  'productzeichnung',
  'produktzeichnung',
  'poster',
  'logo',
  'thumbnail',
  'ecommerce',
  'presentation',
  'pitch deck',
  'marketing designer',
  'visual designer',
  'digital designer'
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
  'pmhnp'
];

const weakTerms = [
  'werkstudent',
  'praktikant',
  'praktikum',
  'german speaker',
  'deutsch',
  'remote in de'
];

function bonusScore(lead) {
  const text = textOf(lead);
  const title = titleOf(lead);
  let score = lead.score || 0;

  if (/freelance|contract|part-time|part time|remote/i.test(text)) score += 12;
  if (/canva|figma|adobe|midjourney|comfyui|ai|generative/i.test(text)) score += 10;
  if (/logo|poster|social|content|brand|creative|designer|video|motion/i.test(title)) score += 18;
  if (/thailand|bangkok|asia|worldwide|remote/i.test(text)) score += 6;

  if (weakTerms.some((term) => text.includes(term))) score -= 10;

  return score;
}

function reason(lead) {
  const title = titleOf(lead);
  const text = textOf(lead);
  const reasons = [];

  if (/canva/i.test(title)) reasons.push('Canva/design tool fit');
  if (/graphic designer|designer/i.test(title)) reasons.push('design role');
  if (/brand/i.test(title)) reasons.push('brand fit');
  if (/content|social/i.test(title)) reasons.push('content/social fit');
  if (/creative/i.test(title)) reasons.push('creative role');
  if (/motion|video|videographer/i.test(title)) reasons.push('motion/video fit');
  if (/ai/i.test(text)) reasons.push('AI angle');
  if (/freelance|contract|part-time|part time|remote/i.test(text)) reasons.push('remote/flexible');

  return reasons.length ? reasons.join(', ') : 'possible adjacent fit';
}

console.log('Step 1/3: Discover gig leads...');
runNode('workops-gig-discover.mjs', ['--max', max]);

const leadsPath = join(paths.dataDir, 'gig-leads.json');
if (!existsSync(leadsPath)) {
  console.error(`Missing leads file after discovery: ${leadsPath}`);
  process.exit(1);
}

console.log('');
console.log('Step 2/3: Shortlist best-fit leads...');

const leads = JSON.parse(readFileSync(leadsPath, 'utf8'));

const shortlist = leads
  .filter((lead) => {
    const title = titleOf(lead);
    const text = textOf(lead);

    if (hardBad.some((bad) => title.includes(bad))) return false;
    if (hardGood.some((good) => text.includes(good))) return true;

    return false;
  })
  .map((lead) => ({
    ...lead,
    shortlist_score: bonusScore(lead),
    reason: reason(lead),
  }))
  .sort((a, b) => b.shortlist_score - a.shortlist_score)
  .slice(0, 30);

const shortlistJson = join(paths.dataDir, 'gig-shortlist.json');
const shortlistMd = join(paths.dataDir, 'gig-shortlist.md');

writeFileSync(shortlistJson, JSON.stringify(shortlist, null, 2), 'utf8');

const lines = [
  '# WorkOps Gig Shortlist',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Selected: ${shortlist.length}`,
  '',
  '| Rank | Score | Source | Company | Title | Location | Why | URL |',
  '|---:|---:|---|---|---|---|---|---|',
];

for (const [index, lead] of shortlist.entries()) {
  const safe = (value) => String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  lines.push(`| ${index + 1} | ${lead.shortlist_score} | ${safe(lead.source)} | ${safe(lead.company)} | ${safe(lead.title)} | ${safe(lead.location)} | ${safe(lead.reason)} | ${safe(lead.url)} |`);
}

writeFileSync(shortlistMd, lines.join('\n'), 'utf8');

console.log(`Shortlisted ${shortlist.length} leads.`);
console.log(`Saved: ${shortlistMd}`);

if (evalTop > 0) {
  console.log('');
  console.log(`Step 3/3: Evaluating top ${evalTop} shortlisted leads with ${model}...`);

  for (const [index, lead] of shortlist.slice(0, evalTop).entries()) {
    console.log('');
    console.log(`=== Gig ${index + 1}/${evalTop}: ${lead.company} — ${lead.title} ===`);
    console.log(lead.url);

    runNode('workops-eval-url.mjs', [lead.url, '--model', model]);
  }

  console.log('');
  console.log('Gig evaluations complete.');
  console.log('Run: npm run workops:review');
} else {
  console.log('');
  console.log('Step 3/3: Skipped evaluation.');
  console.log('To evaluate top leads, run:');
  console.log('npm run workops:gig-cycle -- --eval-top 3 --model gemini-3.5-flash');
}
