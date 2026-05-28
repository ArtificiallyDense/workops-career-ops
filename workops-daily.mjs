#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const model = argValue('--model', process.env.GEMINI_MODEL_DAILY || process.env.GEMINI_MODEL || 'gemini-3.5-flash');
const max = argValue('--max', '250');
const maxEval = argValue('--max-eval', '8');
const evalMinScore = argValue('--eval-min-score', '75');
const minutes = argValue('--minutes', '10');
const topPacks = Number.parseInt(argValue('--top-packs', '5'), 10);

const skipHunt = args.includes('--skip-hunt');
const skipPackages = args.includes('--skip-packages');

const runsRoot = dirname(paths.reportsDir);
const packagesDir = join(runsRoot, 'packages');
const applyPacksDir = join(runsRoot, 'apply-packs');
const topPicksPath = join(runsRoot, 'opportunity-top-picks.md');
const dailyPath = join(runsRoot, 'daily-summary.md');

function runNode(script, scriptArgs = []) {
  if (!existsSync(script)) {
    console.error(`Missing script: ${script}`);
    process.exit(1);
  }

  console.log('');
  console.log(`> node ${script} ${scriptArgs.join(' ')}`);

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

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function parseTopPicks() {
  if (!existsSync(topPicksPath)) return [];

  return readFileSync(topPicksPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !line.includes('---:') && !line.includes('Rank |'))
    .map((line) => line.split('|').map((part) => part.trim()).filter(Boolean))
    .map((parts) => ({
      rank: parts[0],
      company: parts[1],
      role: parts[2],
      score: parts[3],
      decision: parts[4],
      why: parts[5],
      report: parts[6],
    }))
    .filter((row) => row.report && row.report.endsWith('.md'))
    .slice(0, topPacks);
}

function latestPackageFor(company, role) {
  if (!existsSync(packagesDir)) return null;

  const companySlug = slugify(company);
  const roleSlug = slugify(role);

  const files = readdirSync(packagesDir)
    .filter((name) => name.endsWith('-package.md'))
    .map((name) => ({
      name,
      path: join(packagesDir, name),
      score:
        (name.includes(companySlug) ? 2 : 0) +
        (name.includes(roleSlug.slice(0, 35)) ? 1 : 0),
      mtime: statSync(join(packagesDir, name)).mtimeMs,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.mtime - a.mtime);

  return files[0]?.name || null;
}

console.log('WorkOps Daily');
console.log('=============');
console.log(`Model: ${model}`);
console.log(`Top packs: ${topPacks}`);

if (!skipHunt) {
  console.log('');
  console.log('Step 1/5: Hunting for fresh gigs/opportunities...');
  runNode('workops-gig-cycle.mjs', [
    '--max', max,
    '--max-eval', maxEval,
    '--eval-min-score', evalMinScore,
    '--minutes', minutes,
    '--model', model,
  ]);
} else {
  console.log('');
  console.log('Step 1/5: Skipping hunt.');
}

console.log('');
console.log('Step 2/5: Updating review...');
runNode('workops-review.mjs');

console.log('');
console.log('Step 3/5: Generating top picks...');
runNode('workops-top-picks.mjs');

const picks = parseTopPicks();

if (picks.length === 0) {
  console.log('No top picks found.');
  process.exit(0);
}

console.log('');
console.log(`Top picks found: ${picks.length}`);

if (!skipPackages) {
  console.log('');
  console.log('Step 4/5: Generating packages and apply-packs...');

  mkdirSync(packagesDir, { recursive: true });
  mkdirSync(applyPacksDir, { recursive: true });

  for (const pick of picks) {
    console.log('');
    console.log(`Packaging: ${pick.company} — ${pick.role}`);

    runNode('workops-package.mjs', [pick.report, '--model', model]);

    const packageFile = latestPackageFor(pick.company, pick.role);
    if (!packageFile) {
      console.warn(`Could not find package file for ${pick.company} — ${pick.role}`);
      continue;
    }

    runNode('workops-apply-pack.mjs', [packageFile]);
  }
} else {
  console.log('');
  console.log('Step 4/5: Skipping packages.');
}

console.log('');
console.log('Step 5/6: Generating pay estimates...');
runNode('workops-pay-estimate.mjs', ['--top', String(topPacks)]);

console.log('Step 6/6: Writing daily summary...');

const summary = [
  '# WorkOps Daily Summary',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Top Picks',
  '',
  '| Rank | Company | Role | Score | Decision | Why | Report |',
  '|---:|---|---|---:|---|---|---|',
  ...picks.map((p) => `| ${p.rank} | ${p.company} | ${p.role} | ${p.score} | ${p.decision} | ${p.why} | ${p.report} |`),
  '',
  '## Review Files',
  '',
  `- Top picks: ${topPicksPath}`,
  `- Opportunity review: ${join(runsRoot, 'opportunity-review.md')}`,
  `- Packages folder: ${packagesDir}`,
  `- Apply packs folder: ${applyPacksDir}`,
  `- Pay estimates: ${join(runsRoot, 'pay-estimates.md')}`,
  '',
  '## Next Human Action',
  '',
  'Review the top apply-pack folders and submit only the strongest matches first.',
  '',
].join('\n');

writeFileSync(dailyPath, summary, 'utf8');

console.log('');
console.log(`Saved daily summary: ${dailyPath}`);
console.log('');
console.log('Done. Review these:');
console.log(`- ${topPicksPath}`);
console.log(`- ${dailyPath}`);
console.log(`- ${applyPacksDir}`);
