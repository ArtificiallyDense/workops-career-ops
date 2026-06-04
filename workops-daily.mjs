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
const topPacks = Number.parseInt(argValue('--top-packs', '12'), 10);
const queueMax = Number.parseInt(argValue('--queue-max', '50'), 10);

const skipHunt = args.includes('--skip-hunt');
const skipPackages = args.includes('--skip-packages');
const forcePackages = args.includes('--force-packages');
const skipPay = args.includes('--skip-pay');
const skipQueue = args.includes('--skip-queue');

const runsRoot = dirname(paths.reportsDir);
const packagesDir = join(runsRoot, 'packages');
const applyPacksDir = join(runsRoot, 'apply-packs');
const topPicksPath = join(runsRoot, 'opportunity-top-picks.md');
const dailyPath = join(runsRoot, 'daily-summary.md');
const payPath = join(runsRoot, 'pay-estimates.md');
const applyQueuePath = join(runsRoot, 'today-apply-queue.md');

const failures = [];
const skipped = [];
const created = [];

function loadActiveProfile() {
  const profilePath = join(paths.dataDir, 'profiles', 'active-profile.json');

  if (!existsSync(profilePath)) return null;

  try {
    return JSON.parse(readFileSync(profilePath, 'utf8'));
  } catch {
    return null;
  }
}

function runNode(script, scriptArgs = [], options = {}) {
  const soft = Boolean(options.soft);

  if (!existsSync(script)) {
    const message = `Missing script: ${script}`;
    if (soft) {
      console.warn(message);
      return { ok: false, status: 1 };
    }
    console.error(message);
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
    return { ok: false, status: 1 };
  }

  const status = result.status ?? 1;
  const ok = status === 0;

  if (!ok && !soft) {
    process.exit(status);
  }

  return { ok, status };
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/â€“|â€”|–|—/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function clean(value) {
  return String(value || '')
    .replace(/â€“|â€”|–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTopPicks() {
  if (!existsSync(topPicksPath)) return [];

  return readFileSync(topPicksPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !line.includes('---:') && !line.includes('Rank |'))
    .map((line) => line.split('|').map((part) => clean(part)).filter(Boolean))
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

function findApplyPackDir(company, role) {
  if (!existsSync(applyPacksDir)) return null;

  const folders = readdirSync(applyPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const companySlug = slugify(company);
  const roleSlug = slugify(role);

  const ranked = folders
    .map((folder) => {
      let score = 0;
      if (folder.includes(companySlug)) score += 10;

      for (const part of roleSlug.split('-').filter((p) => p.length > 3)) {
        if (folder.includes(part)) score += 1;
      }

      return { folder, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0] ? join(applyPacksDir, ranked[0].folder) : null;
}

function latestPackageFor(company, role) {
  if (!existsSync(packagesDir)) return null;

  const companySlug = slugify(company);
  const roleSlug = slugify(role);

  const files = readdirSync(packagesDir)
    .filter((name) => name.endsWith('-package.md'))
    .map((name) => {
      const path = join(packagesDir, name);
      return {
        name,
        path,
        score:
          (name.includes(companySlug) ? 4 : 0) +
          roleSlug.split('-').filter((p) => p.length > 3 && name.includes(p)).length,
        mtime: statSync(path).mtimeMs,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.mtime - a.mtime);

  return files[0]?.name || null;
}

function discoverArgs() {
  return [
    '--max',
    max,
    '--max-eval',
    maxEval,
    '--eval-min-score',
    evalMinScore,
    '--minutes',
    minutes,
    '--model',
    model,
    ...(args.includes('--serpapi') ? ['--serpapi'] : []),
    ...(args.includes('--serpapi-limit') ? ['--serpapi-limit', argValue('--serpapi-limit', '10')] : []),
    ...(args.includes('--serpapi-location') ? ['--serpapi-location', argValue('--serpapi-location', 'United States')] : []),
  ];
}

const activeProfile = loadActiveProfile();

console.log('WorkOps Daily');
console.log('=============');
console.log(`Model: ${model}`);
console.log(`Top packs: ${topPacks}`);
console.log(`Active profile: ${activeProfile?.name || 'None'}`);
console.log(`Force packages: ${forcePackages ? 'yes' : 'no'}`);

if (!skipHunt) {
  console.log('');
  console.log('Step 1/6: Hunting for fresh gigs/opportunities...');
  const result = runNode('workops-gig-cycle.mjs', discoverArgs(), { soft: true });

  if (!result.ok) {
    failures.push('Gig hunt failed or partially failed. Continuing with existing reports.');
  }
} else {
  console.log('');
  console.log('Step 1/6: Skipping hunt.');
}

console.log('');
console.log('Step 2/6: Updating review...');
runNode('workops-review.mjs');

console.log('');
console.log('Step 3/6: Generating top picks...');
runNode('workops-top-picks.mjs');

console.log('');
console.log('Selecting qualified opportunities...');
runNode('workops-select.mjs', ['--min-score', argValue('--min-score', '4.1'), '--max', String(queueMax)], { soft: true });

const picks = parseTopPicks();

if (picks.length === 0) {
  console.log('No top picks found.');
  process.exit(0);
}

console.log('');
console.log(`Top picks found: ${picks.length}`);

if (!skipPackages) {
  console.log('');
  console.log('Step 4/6: Ensuring packages and apply-packs exist...');

  mkdirSync(packagesDir, { recursive: true });
  mkdirSync(applyPacksDir, { recursive: true });

  for (const pick of picks) {
    const existingApplyPack = findApplyPackDir(pick.company, pick.role);

    if (existingApplyPack && !forcePackages) {
      console.log('');
      console.log(`Skipping existing apply pack: ${pick.company} — ${pick.role}`);
      skipped.push(`${pick.company} — ${pick.role}`);
      continue;
    }

    console.log('');
    console.log(`Packaging: ${pick.company} — ${pick.role}`);

    const packageResult = runNode('workops-package.mjs', [pick.report, '--model', model], { soft: true });

    if (!packageResult.ok) {
      console.warn(`Package failed, continuing: ${pick.company} — ${pick.role}`);
      failures.push(`Package failed: ${pick.company} — ${pick.role}`);
      continue;
    }

    const packageFile = latestPackageFor(pick.company, pick.role);

    if (!packageFile) {
      console.warn(`Could not find package file for ${pick.company} — ${pick.role}`);
      failures.push(`Package file not found: ${pick.company} — ${pick.role}`);
      continue;
    }

    const applyPackResult = runNode('workops-apply-pack.mjs', [packageFile], { soft: true });

    if (!applyPackResult.ok) {
      failures.push(`Apply pack failed: ${pick.company} — ${pick.role}`);
      continue;
    }

    created.push(`${pick.company} — ${pick.role}`);
  }
} else {
  console.log('');
  console.log('Step 4/6: Skipping packages.');
}

if (!skipPay) {
  console.log('');
  console.log('Step 5/6: Generating pay estimates...');
  const result = runNode('workops-pay-estimate.mjs', ['--top', String(queueMax), '--qualified'], { soft: true });

  if (!result.ok) {
    failures.push('Pay estimate generation failed.');
  }
} else {
  console.log('');
  console.log('Step 5/6: Skipping pay estimates.');
}

if (!skipQueue) {
  console.log('');
  console.log('Step 6/6: Generating apply queue...');
  const result = runNode('workops-apply-queue.mjs', ['--max', String(queueMax)], { soft: true });

  if (!result.ok) {
    failures.push('Apply queue generation failed.');
  }

  console.log('Running queue health check...');
  const healthResult = runNode('workops-queue-health.mjs', [], { soft: true });
  if (!healthResult.ok) failures.push('Queue health check failed.');

  console.log('Generating money plan...');
  const moneyResult = runNode('workops-money-plan.mjs', [], { soft: true });
  if (!moneyResult.ok) failures.push('Money plan generation failed.');

  console.log('Generating proof match...');
  const proofResult = runNode('workops-proof-match.mjs', [], { soft: true });
  if (!proofResult.ok) failures.push('Proof match generation failed.');
} else {
  console.log('');
  console.log('Step 6/6: Skipping apply queue.');
}

console.log('');
console.log('Writing daily summary...');

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
  `- Qualified opportunities: ${join(runsRoot, 'qualified-opportunities.md')}`,
  `- Pay estimates: ${payPath}`,
  `- Apply queue: ${applyQueuePath}`,
  `- Queue health: ${join(runsRoot, 'queue-health.md')}`,
  `- Money plan: ${join(runsRoot, 'money-plan.md')}`,
  `- Proof match: ${join(runsRoot, 'proof-match.md')}`,
  `- Packages folder: ${packagesDir}`,
  `- Apply packs folder: ${applyPacksDir}`,
  '',
  '## Package Status',
  '',
  `- Created/refreshed this run: ${created.length}`,
  `- Skipped existing apply-packs: ${skipped.length}`,
  `- Failures: ${failures.length}`,
  '',
  ...(failures.length ? ['### Failures', '', ...failures.map((item) => `- ${item}`), ''] : []),
  '## Next Human Action',
  '',
  'Open today-apply-queue.md and apply only the A-list first.',
  '',
].join('\n');

writeFileSync(dailyPath, summary, 'utf8');

console.log('');
console.log(`Saved daily summary: ${dailyPath}`);
console.log('');
console.log('Done. Review these:');
console.log(`- ${topPicksPath}`);
console.log(`- ${dailyPath}`);
console.log(`- ${payPath}`);
console.log(`- ${applyQueuePath}`);
console.log(`- ${applyPacksDir}`);

if (failures.length) {
  console.log('');
  console.log('Completed with non-fatal failures. See daily summary.');
}
