#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const runsRoot = dirname(paths.reportsDir);
const reviewPath = join(runsRoot, 'opportunity-review.md');
const outputPath = join(runsRoot, 'opportunity-top-picks.md');

if (!existsSync(reviewPath)) {
  console.error(`Missing review file: ${reviewPath}`);
  console.error('Run: npm run workops:review');
  process.exit(1);
}

const lines = readFileSync(reviewPath, 'utf8').split(/\r?\n/);

const rows = lines
  .filter((line) => line.startsWith('|') && !line.includes('---:') && !line.includes('Rank |'))
  .map((line) => line.split('|').map((part) => part.trim()).filter(Boolean))
  .map((parts) => ({
    rank: parts[0],
    company: parts[1],
    role: parts[2],
    score: Number.parseFloat(parts[3]) || 0,
    decision: parts[4],
    legitimacy: parts[5],
    archetype: parts[6],
    report: parts[7],
  }))
  .filter((row) => row.score >= 4.0)
  .filter((row) => !/werkstudent|praktikant|intern|proofreader|german speaker|native german/i.test(`${row.company} ${row.role}`))
  .sort((a, b) => b.score - a.score);

const out = [
  '# WorkOps Top Picks',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Rank | Company | Role | Score | Decision | Why it matters | Report |',
  '|---:|---|---|---:|---|---|---|',
];

rows.forEach((row, index) => {
  let why = 'Strong fit worth reviewing';
  if (/linjer/i.test(row.company)) why = 'Best fashion/ecommerce + AI creative strategy match';
  else if (/elevenlabs/i.test(row.company)) why = 'Best prestige / AI creative career leverage';
  else if (/later/i.test(row.company)) why = 'Fast freelance content-production angle';
  else if (/glacis/i.test(row.company)) why = 'Remote/part-time AI content + visual storytelling angle';
  else if (/crossing hurdles/i.test(row.company)) why = 'Canva/design execution gig with quick-cash potential';

  out.push(`| ${index + 1} | ${row.company} | ${row.role} | ${row.score.toFixed(1)} | ${row.decision} | ${why} | ${row.report} |`);
});

out.push('');
out.push('## Recommended Order');
out.push('');
out.push('1. Package and apply/pitch Linjer first.');
out.push('2. Keep ElevenLabs as prestige target, ideally with one audio/AI demo.');
out.push('3. Use Later / Glacis / Canva Specialist as faster cashflow or part-time angles.');
out.push('');

writeFileSync(outputPath, out.join('\n'), 'utf8');

console.log(`Top picks: ${rows.length}`);
console.log(`Saved: ${outputPath}`);
