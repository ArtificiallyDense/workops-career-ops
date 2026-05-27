#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const inputPath = join(paths.dataDir, 'gig-leads.json');
const outputPath = join(paths.dataDir, 'gig-shortlist.md');
const outputJsonPath = join(paths.dataDir, 'gig-shortlist.json');

if (!existsSync(inputPath)) {
  console.error(`Missing gig leads file: ${inputPath}`);
  console.error('Run: npm run workops:gig-discover');
  process.exit(1);
}

const leads = JSON.parse(readFileSync(inputPath, 'utf8'));

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

const weakStudentGerman = [
  'werkstudent',
  'praktikant',
  'praktikum',
  'm/w/d',
  'german speaker',
  'deutsch',
  'remote in de'
];

function textOf(lead) {
  return `${lead.title || ''} ${lead.company || ''} ${lead.location || ''} ${lead.description || ''} ${(lead.tags || []).join(' ')}`.toLowerCase();
}

function titleOf(lead) {
  return String(lead.title || '').toLowerCase();
}

function bonusScore(lead) {
  const text = textOf(lead);
  const title = titleOf(lead);
  let score = lead.score || 0;

  if (/freelance|contract|part-time|part time|remote/i.test(text)) score += 12;
  if (/canva|figma|adobe|midjourney|comfyui|ai|generative/i.test(text)) score += 10;
  if (/logo|poster|social|content|brand|creative|designer|video|motion/i.test(title)) score += 18;
  if (/thailand|bangkok|asia|worldwide|remote/i.test(text)) score += 6;

  if (weakStudentGerman.some((term) => text.includes(term))) score -= 10;

  return score;
}

function reason(lead) {
  const title = titleOf(lead);
  const reasons = [];

  if (/canva/i.test(title)) reasons.push('Canva/design tool fit');
  if (/graphic designer|designer/i.test(title)) reasons.push('design role');
  if (/brand/i.test(title)) reasons.push('brand fit');
  if (/content|social/i.test(title)) reasons.push('content/social fit');
  if (/creative/i.test(title)) reasons.push('creative role');
  if (/motion|video|videographer/i.test(title)) reasons.push('motion/video fit');
  if (/ai/i.test(textOf(lead))) reasons.push('AI angle');
  if (/freelance|contract|part-time|part time|remote/i.test(textOf(lead))) reasons.push('remote/flexible');

  return reasons.length ? reasons.join(', ') : 'possible adjacent fit';
}

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

writeFileSync(outputJsonPath, JSON.stringify(shortlist, null, 2), 'utf8');

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

lines.push('');
lines.push('## Next');
lines.push('');
lines.push('Evaluate one lead:');
lines.push('');
lines.push('```powershell');
lines.push('npm run workops:eval-url -- "LEAD_URL" --model gemini-3.5-flash');
lines.push('```');

writeFileSync(outputPath, lines.join('\n'), 'utf8');

console.log(`Shortlisted ${shortlist.length} leads.`);
console.log(`Saved: ${outputPath}`);
console.log(`Saved: ${outputJsonPath}`);
