#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const outputRoot = 'D:/WorkOps/runs/babar-hospitality-global';
const maxRows = Number(argValue('--max-rows', '35'));

const leadsPath = join(outputRoot, 'babar-leads.json');

if (!existsSync(leadsPath)) {
  console.error(`Missing leads file: ${leadsPath}`);
  console.error('Run: npm run workops:babar-hunt -- --region gcc --serpapi-limit 10 --max-rows 35');
  process.exit(1);
}

const input = JSON.parse(readFileSync(leadsPath, 'utf8'));
const leads = input.leads || [];

function safe(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/â€“|â€”/g, '-')
    .replace(/MÃ©/g, 'Mé')
    .replace(/Ø|Ù/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function md(value) {
  return safe(value).replaceAll('|', '\\|');
}

function cleanUrl(raw) {
  const value = safe(raw);

  try {
    const url = new URL(value);

    for (const key of [...url.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith('utm_') ||
        key === 'lastSelectedFacet' ||
        key === 'selectedFlexFieldsFacets'
      ) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return value;
  }
}

function domainOf(raw) {
  try {
    return new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function companyKey(job) {
  return safe(job.company)
    .toLowerCase()
    .replace(/international|group|company|llc|ltd|limited|hotel|resort|spa|careers|sales/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleKey(job) {
  return safe(job.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(and|the|of|in|for|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTrustedForApply(job) {
  return ['Direct ATS', 'Direct Company', 'Hospitality Recruiter'].includes(job.sourceQuality);
}

function isStrongDirect(job) {
  return ['Direct ATS', 'Direct Company'].includes(job.sourceQuality);
}

function suspiciousCompany(job) {
  const company = safe(job.company).toLowerCase();
  const title = safe(job.title).toLowerCase();
  const url = safe(job.applyUrl).toLowerCase();

  if (/holding group company|group of restaurant|confidential|private company|company confidential/.test(company)) return true;
  if (/careers international|recruitment|sales$/.test(company) && !/hotel|restaurant|hospitality|group/.test(company)) return true;
  if (/whatjobs|jobsora|jobleads|learn4good|careerforfresher|drjobs|jobaaj|anygulfjobs/.test(url)) return true;
  if (/european experienced|european national|western passport|western national/.test(title)) return true;

  return false;
}

function internshipNoise(job) {
  const url = safe(job.applyUrl).toLowerCase();
  const title = safe(job.title).toLowerCase();

  return /internship|intern/.test(url) && !/internship|intern\b/.test(title);
}

function roleTier(job) {
  const title = safe(job.title).toLowerCase();
  const reasons = (job.reasons || []).join(' ').toLowerCase();

  if (/director|regional|group|cluster|multi-unit|multi unit|general manager|hotel manager|head of operations/.test(title)) {
    return 'Senior / strategic';
  }

  if (/operations manager|f&b manager|food and beverage manager|outlets manager|restaurant manager|procurement manager|supply chain lead/.test(title)) {
    return 'Manager / specialist';
  }

  if (/assistant|supervisor|team leader/.test(title)) {
    return 'Junior risk';
  }

  if (/senior \/ multi-unit/.test(reasons)) return 'Senior / strategic';
  if (/manager/.test(reasons)) return 'Manager / specialist';

  return 'Unclear';
}

function qualityGate(job) {
  let score = Number(job.score || 0);
  const flags = [];

  const titleText = safe(job.title).toLowerCase();

  if (/\bcfo\b|chief financial|finance director|financial controller|accountant|accounting|comptroller|head of finance/.test(titleText)) {
    score -= 80;
    flags.push('wrong function - finance/accounting role');
  }

  const source = job.sourceQuality || 'Other';
  const tier = roleTier(job);

  if (source === 'Direct ATS' || source === 'Direct Company') score += 4;
  if (source === 'Hospitality Recruiter') score += 1;
  if (source === 'Major Job Board') {
    score -= 4;
    flags.push('verify job board source');
  }
  if (source === 'Other') {
    score -= 9;
    flags.push('unknown source');
  }
  if (source === 'Aggregator') {
    score -= 16;
    flags.push('aggregator source');
  }

  if (suspiciousCompany(job)) {
    score -= 18;
    flags.push('suspicious/vague source');
  }

  if (internshipNoise(job)) {
    score -= 8;
    flags.push('ATS URL contains internship/filter noise');
  }

  if (tier === 'Senior / strategic') score += 5;
  if (tier === 'Manager / specialist') score += 1;
  if (tier === 'Unclear') {
    score -= 6;
    flags.push('seniority unclear');
  }
  if (tier === 'Junior risk') {
    score -= 18;
    flags.push('junior role risk');
  }

  if (job.visaRisk === 'Lower') score += 5;
  if (job.visaRisk === 'Medium-High') {
    score -= 12;
    flags.push('medium-high visa risk');
  }
  if (job.visaRisk === 'High') {
    score -= 28;
    flags.push('high visa risk');
  }

  score = Math.max(0, Math.min(98, Math.round(score)));

  return {
    polishedScore: score,
    qualityFlags: [...new Set(flags)],
    roleTier: tier
  };
}

function basePriority(job) {
  const trusted = isTrustedForApply(job);
  const cleanCompany = !suspiciousCompany(job);
  const cleanVisa = ['Lower', 'Medium'].includes(job.visaRisk);
  const cleanRole = !['Junior risk', 'Unclear'].includes(job.roleTier);

  if (job.polishedScore >= 84 && trusted && cleanCompany && cleanVisa && cleanRole) return 'A';
  if (job.polishedScore >= 62 && job.visaRisk !== 'High') return 'B';
  if (job.polishedScore >= 42) return 'C';

  return 'D';
}

function proofAngle(job) {
  const title = String(job.title || '').toLowerCase();
  const company = String(job.company || '').toLowerCase();
  const text = [
    job.title,
    job.company,
    job.location,
    ...(job.reasons || [])
  ].join(' ').toLowerCase();

  // Hotel / resort F&B leadership roles should NOT lead with Burgerizzer first.
  if (/director of food|food and beverage director|director f&b|director food|food & beverage director/.test(title)) {
    return 'Hotel/resort F&B leadership + IRIS/Pinnacle/Shangrila operations';
  }

  if (/food and beverage outlets manager|f&b outlets manager|outlets manager/.test(title)) {
    return 'Hotel/resort F&B outlets operations + cost control + guest experience';
  }

  if (/food and beverage manager|food & beverage manager|f and b manager|f&b manager/.test(title)) {
    return 'Hotel/resort F&B operations + cost control + staff leadership';
  }

  // Cluster / multi-unit / area restaurant roles should lead with Burgerizzer.
  if (/cluster|multi-unit|multi unit|area operations|group operations|regional/.test(title)) {
    return 'Burgerizzer 12-branch expansion + multi-unit restaurant operations';
  }

  if (/restaurant managers|restaurant manager/.test(title)) {
    return 'Restaurant operations + Burgerizzer multi-branch systems';
  }

  if (/general manager|new openings|pre-opening|pre opening|opening/.test(title)) {
    return 'Regulus / Food Fund pre-opening execution + turnaround operations';
  }

  if (/procurement|supply chain|cost control|inventory|sourcing/.test(title)) {
    return 'Regulus procurement, sourcing, inventory, and cost control';
  }

  if (/hotel manager|resort/.test(title)) {
    return 'IRIS / Pinnacle / Shangrila hotel-resort operations';
  }

  if (/marriott|hilton|wyndham|jumeirah|wynn|resort|hotel/.test(company + ' ' + text)) {
    return 'Hotel/resort operations + F&B leadership + guest experience';
  }

  return 'F&B operations, team leadership, cost control';
}

function applyPlan(job) {
  if (job.priority === 'A') {
    if (isStrongDirect(job)) return 'Apply direct today with tailored CV angle.';
    return 'Apply today after quick source check.';
  }

  if (job.priority === 'B') return 'Verify original source first, then decide.';
  if (job.priority === 'C') return 'Backlog / source check only.';

  return 'Ignore unless manually selected.';
}

function prioritySort(priority) {
  if (priority === 'A') return 1;
  if (priority === 'B') return 2;
  if (priority === 'C') return 3;
  return 4;
}

let polished = leads.map((job) => {
  const gated = qualityGate(job);

  return {
    ...job,
    title: safe(job.title),
    company: safe(job.company),
    location: safe(job.location),
    applyUrl: cleanUrl(job.applyUrl),
    polishedScore: gated.polishedScore,
    score: gated.polishedScore,
    qualityFlags: gated.qualityFlags,
    roleTier: gated.roleTier,
    proofAngle: proofAngle(job),
  };
});

polished = polished
  .map((job) => ({
    ...job,
    priority: basePriority(job)
  }))
  .filter((job) => job.priority !== 'D')
  .sort((a, b) =>
    prioritySort(a.priority) - prioritySort(b.priority) ||
    b.polishedScore - a.polishedScore ||
    a.company.localeCompare(b.company)
  );

// Maximum 5 A-list, and only one A-list per company family.
let aCount = 0;
const aCompanies = new Set();

polished = polished.map((job) => {
  if (job.priority !== 'A') return job;

  const key = companyKey(job);

  if (aCount >= 5) {
    return {
      ...job,
      priority: 'B',
      qualityFlags: [...job.qualityFlags, 'A-list cap demotion']
    };
  }

  if (aCompanies.has(key)) {
    return {
      ...job,
      priority: 'B',
      qualityFlags: [...job.qualityFlags, 'same-company A-list demotion']
    };
  }

  aCompanies.add(key);
  aCount += 1;
  return job;
});

// Remove near duplicates after company A-list demotion.
const seen = new Set();

polished = polished.filter((job) => {
  const key = `${companyKey(job)}|${titleKey(job)}|${safe(job.location).toLowerCase()}`;

  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

polished = polished.sort((a, b) =>
  prioritySort(a.priority) - prioritySort(b.priority) ||
  b.polishedScore - a.polishedScore ||
  a.company.localeCompare(b.company)
);

const queue = polished.slice(0, maxRows);

const counts = {
  total: queue.length,
  a: queue.filter((job) => job.priority === 'A').length,
  b: queue.filter((job) => job.priority === 'B').length,
  c: queue.filter((job) => job.priority === 'C').length,
  direct: queue.filter((job) => ['Direct Company', 'Direct ATS'].includes(job.sourceQuality)).length,
  recruiter: queue.filter((job) => job.sourceQuality === 'Hospitality Recruiter').length,
  majorJobBoard: queue.filter((job) => job.sourceQuality === 'Major Job Board').length,
  aggregator: queue.filter((job) => job.sourceQuality === 'Aggregator').length,
  other: queue.filter((job) => job.sourceQuality === 'Other').length,
  highVisa: queue.filter((job) => job.visaRisk === 'High').length
};

const warnings = [];

for (const job of queue) {
  if (!job.applyUrl) warnings.push({ level: 'HIGH', type: 'missing_apply_url', message: `Missing apply URL: ${job.company} - ${job.title}` });
  if (job.priority === 'A' && !isTrustedForApply(job)) warnings.push({ level: 'HIGH', type: 'untrusted_a_list', message: `A-list has untrusted source: ${job.company} - ${job.title}` });
  if (job.priority === 'A' && internshipNoise(job)) warnings.push({ level: 'MEDIUM', type: 'ats_url_noise', message: `A-list URL has internship/filter noise: ${job.company} - ${job.title}` });
  if (job.sourceQuality === 'Aggregator') warnings.push({ level: 'LOW', type: 'aggregator', message: `Find original source first: ${job.company} - ${job.title}` });
  if (job.sourceQuality === 'Other') warnings.push({ level: 'LOW', type: 'unknown_source', message: `Manual source verification needed: ${job.company} - ${job.title}` });
  if (job.sourceQuality === 'Major Job Board') warnings.push({ level: 'LOW', type: 'job_board', message: `Verify posting freshness/original company page: ${job.company} - ${job.title}` });
  if (suspiciousCompany(job)) warnings.push({ level: 'MEDIUM', type: 'suspicious_source', message: `Suspicious/vague source: ${job.company} - ${job.title}` });
  for (const flag of job.qualityFlags || []) warnings.push({ level: 'INFO', type: 'quality_flag', message: `${job.company} - ${job.title}: ${flag}` });
}

const generated = new Date().toISOString();

writeFileSync(join(outputRoot, 'babar-leads-polished.json'), JSON.stringify({ generated, counts, queue }, null, 2) + '\n', 'utf8');

const queueMd = [
  '# Babar Apply Queue v3.1',
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
  '- **A:** Apply today. Trusted source, strong role, acceptable visa/location risk.',
  '- **B:** Good lead. Verify original source first or review after A-list.',
  '- **C:** Backlog. Only use if quick or strategically important.',
  '',
  '## Today Queue',
  '',
  '| Priority | Rank | Company | Role | Score | Source | Region | Visa Risk | Role Tier | Pay | Action | Proof Angle | Flags | URL |',
  '|---|---:|---|---|---:|---|---|---|---|---|---|---|---|---|',
  ...queue.map((job, index) =>
    `| ${job.priority} | ${index + 1} | ${md(job.company)} | ${md(job.title)} | ${job.polishedScore} | ${md(job.sourceQuality)} | ${md(job.regionType)} | ${md(job.visaRisk)} | ${md(job.roleTier)} | ${md(job.payEstimate)} | ${md(applyPlan(job))} | ${md(job.proofAngle)} | ${md((job.qualityFlags || []).join(', '))} | ${md(job.applyUrl)} |`
  ),
  '',
  '## Detailed Notes',
  '',
  ...queue.slice(0, 15).map((job, index) => [
    `### ${job.priority}${index + 1} - ${job.company} - ${job.title}`,
    '',
    `- **Score:** ${job.polishedScore}`,
    `- **Source quality:** ${job.sourceQuality}`,
    `- **Role tier:** ${job.roleTier}`,
    `- **Apply plan:** ${applyPlan(job)}`,
    `- **Region type:** ${job.regionType}`,
    `- **Visa risk:** ${job.visaRisk}`,
    `- **Visa notes:** ${(job.visaReasons || []).join(', ')}`,
    `- **Pay estimate:** ${job.payEstimate}`,
    `- **Location:** ${job.location}`,
    `- **Proof angle:** ${job.proofAngle}`,
    `- **Quality flags:** ${(job.qualityFlags || []).join(', ') || 'None'}`,
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
  '# Babar Queue Health v3.1',
  '',
  `Generated: ${generated}`,
  '',
  '## Summary',
  '',
  `- Rows: ${counts.total}`,
  `- A-list: ${counts.a}`,
  `- B-list: ${counts.b}`,
  `- C-list: ${counts.c}`,
  `- Direct/ATS rows: ${counts.direct}`,
  `- Hospitality recruiter rows: ${counts.recruiter}`,
  `- Major job board rows: ${counts.majorJobBoard}`,
  `- Aggregator rows: ${counts.aggregator}`,
  `- Other/unknown rows: ${counts.other}`,
  `- High visa risk rows: ${counts.highVisa}`,
  `- Warnings: ${warnings.length}`,
  '',
  '## Warnings',
  '',
  ...(warnings.length ? warnings.map((w) => `- **${w.level} / ${w.type}:** ${w.message}`) : ['- None'])
].join('\n');

writeFileSync(join(outputRoot, 'babar-queue-health.md'), healthMd, 'utf8');

const quickActions = [
  '# Babar Quick Actions v3.1',
  '',
  `Generated: ${generated}`,
  '',
  '## Apply Today',
  '',
  ...queue.filter((job) => job.priority === 'A').map((job, index) => [
    `### ${index + 1}. ${job.company} - ${job.title}`,
    '',
    `- Source: ${job.sourceQuality}`,
    `- Action: ${applyPlan(job)}`,
    `- Visa risk: ${job.visaRisk}`,
    `- Pay: ${job.payEstimate}`,
    `- Proof angle: ${job.proofAngle}`,
    `- Quality flags: ${(job.qualityFlags || []).join(', ') || 'None'}`,
    `- URL: ${job.applyUrl}`,
    ''
  ].join('\n')),
  '',
  '## Verify Next',
  '',
  ...queue.filter((job) => job.priority === 'B').slice(0, 12).map((job, index) => [
    `### ${index + 1}. ${job.company} - ${job.title}`,
    '',
    `- Source: ${job.sourceQuality}`,
    `- Action: ${applyPlan(job)}`,
    `- Visa risk: ${job.visaRisk}`,
    `- Pay: ${job.payEstimate}`,
    `- Proof angle: ${job.proofAngle}`,
    `- URL: ${job.applyUrl}`,
    ''
  ].join('\n'))
].join('\n');

writeFileSync(join(outputRoot, 'babar-quick-actions.md'), quickActions, 'utf8');

const applyTodayMd = [
  '# Babar Apply Today',
  '',
  `Generated: ${generated}`,
  '',
  'Use this file only for the true A-list. Do not mass apply.',
  '',
  ...queue.filter((job) => job.priority === 'A').map((job, index) => [
    `## ${index + 1}. ${job.company} - ${job.title}`,
    '',
    `**Apply URL:** ${job.applyUrl}`,
    '',
    `**Why this fits:** ${job.proofAngle}`,
    '',
    '**Opening angle:**',
    '',
    `Babar is a senior hospitality operations and F&B management professional with GCC, restaurant, resort, pre-opening, procurement, cost-control, and multi-unit operations experience. For this role, lead with ${job.proofAngle}.`,
    '',
    '**Proof bullets to use:**',
    '',
    '- Burgerizzer Riyadh: opened 12 branches and improved kitchen workflow/cooking time.',
    '- Regulus / Food Fund UAE: pre-opening, procurement, admin, HR, and multi-brand restaurant operations.',
    '- IRIS / Pinnacle / Shangrila: hotel/resort operations, guest experience, revenue, maintenance, and team leadership.',
    '- Data Sweets & Bakers: turnaround of a loss-making business into a profitable operation.',
    ''
  ].join('\n'))
].join('\n');

writeFileSync(join(outputRoot, 'babar-apply-today.md'), applyTodayMd, 'utf8');

const verifyMd = [
  '# Babar Verify Original Sources v3.1',
  '',
  `Generated: ${generated}`,
  '',
  'These are not bad leads. They just need original-source verification before applying.',
  '',
  '| Rank | Priority | Company | Role | Source | Reason | URL |',
  '|---:|---|---|---|---|---|---|',
  ...queue
    .filter((job) => ['Aggregator', 'Other', 'Major Job Board'].includes(job.sourceQuality) || suspiciousCompany(job))
    .map((job, index) =>
      `| ${index + 1} | ${job.priority} | ${md(job.company)} | ${md(job.title)} | ${md(job.sourceQuality)} | ${md((job.qualityFlags || []).join(', ') || applyPlan(job))} | ${md(job.applyUrl)} |`
    )
].join('\n');

writeFileSync(join(outputRoot, 'babar-verify-originals.md'), verifyMd, 'utf8');

const payMd = [
  '# Babar Pay Estimates v3.1',
  '',
  `Generated: ${generated}`,
  '',
  'These are heuristic ranges for expectation-setting, not verified salary data.',
  '',
  '| Rank | Priority | Company | Role | Region | Source | Pay Estimate |',
  '|---:|---|---|---|---|---|---|',
  ...queue.slice(0, 20).map((job, index) =>
    `| ${index + 1} | ${job.priority} | ${md(job.company)} | ${md(job.title)} | ${md(job.regionType)} | ${md(job.sourceQuality)} | ${md(job.payEstimate)} |`
  )
].join('\n');

writeFileSync(join(outputRoot, 'babar-pay-estimates.md'), payMd, 'utf8');

console.log('Babar polish v3.1 complete.');
console.log(`Rows: ${counts.total} | A: ${counts.a} | B: ${counts.b} | C: ${counts.c} | Warnings: ${warnings.length}`);
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\today-babar-queue.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-apply-today.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-queue-health.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-quick-actions.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-verify-originals.md');
