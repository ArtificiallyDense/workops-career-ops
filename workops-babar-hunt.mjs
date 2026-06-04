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
const limit = Number(argValue('--serpapi-limit', '10'));
const maxRows = Number(argValue('--max-rows', '35'));
const regionMode = String(argValue('--region', 'all')).toLowerCase();
const outputRoot = 'D:/WorkOps/runs/babar-hospitality-global';

mkdirSync(outputRoot, { recursive: true });
mkdirSync(join(outputRoot, 'data'), { recursive: true });

if (!serpApiKey) {
  console.error('SERPAPI_API_KEY missing. Add it to .env in D:\\WorkOps\\core\\workops-career-ops.');
  process.exit(1);
}

const searches = [
  { region: 'gcc', q: 'F&B Operations Manager hospitality visa sponsorship', location: 'United Arab Emirates' },
  { region: 'gcc', q: 'Restaurant Operations Manager multi unit restaurants', location: 'United Arab Emirates' },
  { region: 'gcc', q: 'Group Operations Manager restaurant group F&B', location: 'United Arab Emirates' },
  { region: 'gcc', q: 'Multi Unit Restaurant Manager operations', location: 'Saudi Arabia' },
  { region: 'gcc', q: 'Pre Opening Restaurant Manager hospitality', location: 'United Arab Emirates' },
  { region: 'gcc', q: 'Food and Beverage Operations Manager hotel', location: 'Qatar' },
  { region: 'gcc', q: 'Hospitality Procurement Manager F&B', location: 'Qatar' },
  { region: 'gcc', q: 'Assistant General Manager hotel food beverage', location: 'Oman' },
  { region: 'gcc', q: 'Restaurant General Manager GCC hospitality', location: 'Bahrain' },
  { region: 'gcc', q: 'Hotel Operations Manager F&B GCC', location: 'Kuwait' },

  { region: 'asia', q: 'Hotel Operations Manager resort expat', location: 'Thailand' },
  { region: 'asia', q: 'F&B Operations Manager resort', location: 'Thailand' },
  { region: 'asia', q: 'Resort Operations Manager hospitality', location: 'Maldives' },
  { region: 'asia', q: 'Resort General Manager hospitality expat', location: 'Maldives' },
  { region: 'asia', q: 'Food and Beverage Operations Manager hotel', location: 'Malaysia' },
  { region: 'asia', q: 'Hotel General Manager boutique resort', location: 'Vietnam' },
  { region: 'asia', q: 'Restaurant Operations Manager hospitality', location: 'Cambodia' },

  { region: 'global', q: 'hospitality operations manager visa sponsorship', location: 'United Kingdom' },
  { region: 'global', q: 'restaurant operations manager visa sponsorship', location: 'Canada' },
  { region: 'global', q: 'hotel operations manager visa sponsorship', location: 'Australia' }
];

function safe(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function md(value) {
  return safe(value).replaceAll('|', '\\|');
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function sourceKind(url, via = '') {
  const domain = domainOf(url);
  const source = `${domain} ${via}`.toLowerCase();

  if (!url) return 'Missing';

  // Strongest: real ATS / company-owned systems.
  if (/workable|greenhouse|lever|smartrecruiters|bamboohr|oraclecloud|successfactors|icims|harri|ashbyhq|applytojob|talentreef|myworkdayjobs|brassring|jobvite/.test(source)) {
    return 'Direct ATS';
  }

  if (/marriott|hilton|hyatt|accor|ihg|jumeirah|rotana|kempinski|fourseasons|mandarinoriental|fairmont|radisson|emaar|emiratesflightcatering|wynn|americana|azadea|apparelgroup|chalhoubgroup|kerzner|atlantis|minorhotels|anantara/.test(source)) {
    return 'Direct Company';
  }

  // Good enough to apply, but still verify.
  if (/gulftalent|naukrigulf|catererglobal|hcareers|hosco|bayt/.test(source)) {
    return 'Hospitality Recruiter';
  }

  // Useful, but should rarely be A-list.
  if (/indeed|linkedin/.test(source)) {
    return 'Major Job Board';
  }

  // Weak aggregators / scraping sites. Discovery only.
  if (/jooble|bebee|jobrapido|talentify|theirstack|grabjobs|laimoon|jobleads|learn4good|trabajo|jobsora|247careerforfresher|newgulfcareers|naqrajobs|mncjobsgulf|founditgulf|jobzella|drjobpro|dubizzle/.test(source)) {
    return 'Aggregator';
  }

  return 'Other';
}

function sourceScore(kind) {
  if (kind === 'Direct Company') return 18;
  if (kind === 'Direct ATS') return 18;
  if (kind === 'Hospitality Recruiter') return 10;
  if (kind === 'Major Job Board') return 0;
  if (kind === 'Other') return -8;
  if (kind === 'Aggregator') return -22;
  return -30;
}

function pickApplyUrl(job) {
  const options = [];

  if (Array.isArray(job.apply_options)) {
    for (const option of job.apply_options) {
      if (option?.link) {
        options.push({
          title: safe(option.title),
          link: option.link,
          kind: sourceKind(option.link, option.title)
        });
      }
    }
  }

  if (job.share_link) options.push({ title: 'Google Jobs', link: job.share_link, kind: sourceKind(job.share_link, 'Google Jobs') });
  if (job.link) options.push({ title: safe(job.via), link: job.link, kind: sourceKind(job.link, job.via) });

  const ranked = options
    .filter((x) => x.link && !String(x.link).includes('google.com/search'))
    .sort((a, b) => sourceScore(b.kind) - sourceScore(a.kind));

  const best = ranked[0] || options[0] || { title: '', link: '', kind: 'Missing' };
  return best;
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

  if (/united arab emirates|dubai|abu dhabi|ras al khaimah|saudi|riyadh|jeddah|qatar|doha|oman|muscat|bahrain|kuwait/.test(text)) {
    return 'GCC Hospitality';
  }

  if (/thailand|bangkok|phuket|samui|maldives|malaysia|vietnam|cambodia|resort|island/.test(text)) {
    return 'Asia Resort';
  }

  return 'Global / Other';
}

function visaRisk(job) {
  const text = haystack(job);
  const risks = [];

  if (/visa sponsorship|sponsorship provided|relocation provided|work visa|company visa|visa provided|expat package|expatriate package/.test(text)) {
    return { level: 'Lower', reasons: ['visa/relocation signal'] };
  }

  if (/no sponsorship|does not sponsor|without sponsorship|must be authorized|right to work|work authorization|citizen|permanent resident|local candidates only/.test(text)) {
    risks.push('work authorization restriction');
  }

  if (/european experienced|european national|western passport|western national|native english speaker|native speaker/.test(text)) {
    risks.push('nationality/passport preference');
  }

  if (/arabic required|fluent arabic|thai language required|malay required|mandarin required/.test(text)) {
    risks.push('language requirement');
  }

  if (/currently in uae|uae based only|locally available|immediate joiner in uae|gcc experience mandatory/.test(text)) {
    risks.push('local availability preference');
  }

  if (risks.length >= 2) return { level: 'High', reasons: risks };
  if (risks.length === 1) return { level: 'Medium-High', reasons: risks };

  return { level: 'Medium', reasons: ['visa not clearly stated'] };
}

function seniorityFit(job) {
  const text = haystack(job);

  if (/director|regional|group|cluster|multi-unit|multi unit|general manager|head of operations/.test(text)) return { score: 14, label: 'Senior / multi-unit' };
  if (/operations manager|f&b manager|food and beverage manager|restaurant manager|hotel manager|resort manager/.test(text)) return { score: 10, label: 'Manager' };
  if (/assistant restaurant manager|assistant outlet manager|supervisor|team leader/.test(text)) return { score: -14, label: 'Too junior risk' };

  return { score: 0, label: 'Unclear' };
}

function roleFit(job) {
  const text = haystack(job);
  let score = 0;
  const reasons = [];

  const add = (points, reason) => {
    score += points;
    reasons.push(reason);
  };

  if (/operations manager|operation manager|head of operations|operations lead/.test(text)) add(18, 'operations manager fit');
  if (/f&b|food and beverage/.test(text)) add(16, 'F&B fit');
  if (/restaurant/.test(text)) add(12, 'restaurant fit');
  if (/hotel/.test(text)) add(9, 'hotel fit');
  if (/resort/.test(text)) add(10, 'resort fit');
  if (/general manager|assistant general manager|agm|hotel manager/.test(text)) add(12, 'GM/AGM fit');
  if (/multi-unit|multi unit|cluster|regional|group operations/.test(text)) add(16, 'multi-unit/regional fit');
  if (/pre-opening|pre opening|opening team|new opening|launch|fit-out|fit out/.test(text)) add(12, 'pre-opening fit');
  if (/procurement|purchasing|sourcing|inventory|cost control|cost controller|supply chain/.test(text)) add(12, 'procurement/cost control fit');
  if (/haccp|food safety|quality audit|internal audit/.test(text)) add(7, 'food safety/audit fit');
  if (/training|staff training|team leadership|people management|leadership/.test(text)) add(7, 'team training fit');

  score = Math.min(52, score);

  if (/\bwaiter\b|\bcashier\b|\bbarista\b|\bline cook\b|\bcommis\b|\bhousekeeping attendant\b|\bfront desk agent\b|\binternship\b|\bintern\b|\btrainee\b|\bentry level\b/.test(text)) {
    score -= 55;
    reasons.push('too junior or wrong function');
  }

  if (/chef de partie|sous chef|executive chef|cook/.test(text) && !/operations|manager|general manager|head/.test(text)) {
    score -= 38;
    reasons.push('chef-only role risk');
  }

  if (/sales executive|business development|account manager/.test(text) && !/operations|hospitality|f&b/.test(text)) {
    score -= 30;
    reasons.push('sales/admin-only risk');
  }

  return {
    score,
    reasons: [...new Set(reasons)].slice(0, 8)
  };
}

function regionScore(job) {
  const region = regionType(job);

  if (region === 'GCC Hospitality') return 16;
  if (region === 'Asia Resort') return 12;
  return 4;
}

function visaScore(level) {
  if (level === 'Lower') return 14;
  if (level === 'Medium') return 5;
  if (level === 'Medium-High') return -8;
  if (level === 'High') return -25;
  return 0;
}

function sourceAction(kind) {
  if (kind === 'Direct Company' || kind === 'Direct ATS') return 'Apply direct';
  if (kind === 'Hospitality Recruiter') return 'Apply / recruiter site ok';
  if (kind === 'Major Job Board') return 'Verify posting, then apply';
  if (kind === 'Aggregator') return 'Find original source first';
  if (kind === 'Other') return 'Manual verification needed';
  return 'Manual verification needed';
}

function trustedForA(job) {
  if (['Direct Company', 'Direct ATS', 'Hospitality Recruiter'].includes(job.sourceQuality)) return true;
  return false;
}

function vagueOrSuspiciousCompany(job) {
  const company = String(job.company || '').toLowerCase();
  const title = String(job.title || '').toLowerCase();

  if (/holding group company|group of restaurant|confidential|private company|company confidential|recruitment agency|جهة|Ø|Ù/.test(company)) return true;
  if (/apply|careers|urgent hiring/.test(company) && !/group|hotel|restaurant|hospitality/.test(company)) return true;
  if (/european experienced|european national|western passport|western national/.test(title)) return true;

  return false;
}

function payEstimate(job) {
  const text = haystack(job);
  const region = regionType(job);

  if (/general manager|hotel manager|resort general manager|group operations|regional/.test(text)) {
    if (region === 'GCC Hospitality') return 'USD 4,000-8,500/mo + benefits';
    if (region === 'Asia Resort') return 'USD 2,500-6,000/mo + housing/benefits';
    return 'USD 3,000-7,000/mo';
  }

  if (/operations manager|f&b|food and beverage|restaurant operations/.test(text)) {
    if (region === 'GCC Hospitality') return 'USD 2,800-6,500/mo + visa/benefits';
    if (region === 'Asia Resort') return 'USD 1,800-4,500/mo + housing/benefits';
    return 'USD 2,500-5,500/mo';
  }

  if (/procurement|supply chain|cost control|inventory/.test(text)) {
    if (region === 'GCC Hospitality') return 'USD 2,500-6,000/mo';
    return 'USD 1,800-4,500/mo';
  }

  return 'Verify market range';
}

function scoreJob(job, apply) {
  const fit = roleFit(job);
  const visa = visaRisk(job);
  const seniority = seniorityFit(job);
  const srcScore = sourceScore(apply.kind);
  const region = regionScore(job);

  let score = fit.score + region + seniority.score + visaScore(visa.level) + srcScore;

  const text = haystack(job);
  const penalties = [];

  if (/european experienced|european national|western passport|western national/.test(text)) {
    score -= 28;
    penalties.push('nationality preference penalty');
  }

  if (/assistant restaurant manager|assistant outlet manager|supervisor/.test(text)) {
    score -= 14;
    penalties.push('junior title penalty');
  }

  if (apply.kind === 'Aggregator') {
    score -= 8;
    penalties.push('aggregator verification needed');
  }

  if (apply.kind === 'Other') {
    score -= 4;
    penalties.push('unknown source verification needed');
  }

  const companyForPenalty = String(job.company_name || '').toLowerCase();
  if (/holding group company|group of restaurant|confidential|private company|company confidential|جهة|Ø|Ù/.test(companyForPenalty)) {
    score -= 14;
    penalties.push('vague or suspicious company name');
  }

  score = Math.max(0, Math.min(96, Math.round(score)));

  const reasons = [
    ...fit.reasons,
    seniority.label,
    `${apply.kind} source`,
    ...visa.reasons,
    ...penalties
  ].filter(Boolean);

  return {
    score,
    roleFitScore: fit.score,
    regionFitScore: region,
    sourceQuality: apply.kind,
    sourceQualityScore: srcScore,
    seniorityFit: seniority.label,
    visaRisk: visa.level,
    visaReasons: visa.reasons,
    reasons: [...new Set(reasons)].slice(0, 8),
    penalties
  };
}

function priorityFor(job) {
  const goodVisa = ['Lower', 'Medium'].includes(job.visaRisk);
  const trusted = trustedForA(job);
  const suspicious = vagueOrSuspiciousCompany(job);

  // A-list should be genuinely apply-ready, not just keyword-rich.
  if (job.score >= 82 && goodVisa && trusted && !suspicious) return 'A';

  // Strong but not clean enough: verify or apply after A-list.
  if (job.score >= 62 && job.visaRisk !== 'High') return 'B';

  // Backlog.
  if (job.score >= 42) return 'C';

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

let activeSearches = searches;

if (regionMode === 'gcc') activeSearches = searches.filter((s) => s.region === 'gcc');
if (regionMode === 'asia') activeSearches = searches.filter((s) => s.region === 'asia');
if (regionMode === 'global') activeSearches = searches.filter((s) => s.region === 'global');

const selectedSearches = activeSearches.slice(0, limit);
const raw = [];

console.log('Babar Hospitality Hunt v2');
console.log(`Region: ${regionMode}`);
console.log(`Queries: ${selectedSearches.length}/${activeSearches.length}`);

for (const [index, search] of selectedSearches.entries()) {
  try {
    console.log(`Searching ${index + 1}/${selectedSearches.length}: ${search.q} | ${search.location}`);
    const jobs = await searchGoogleJobs(search);
    console.log(`  found ${jobs.length}`);

    for (const job of jobs) {
      const apply = pickApplyUrl(job);
      const scored = scoreJob(job, apply);

      raw.push({
        source: 'SerpApi Google Jobs',
        query: search.q,
        queryLocation: search.location,
        company: safe(job.company_name),
        title: safe(job.title),
        location: safe(job.location),
        via: safe(job.via),
        description: safe(job.description).slice(0, 1000),
        applyUrl: apply.link,
        applySource: apply.title,
        score: scored.score,
        priority: null,
        regionType: regionType(job),
        visaRisk: scored.visaRisk,
        visaReasons: scored.visaReasons,
        sourceQuality: scored.sourceQuality,
        sourceQualityScore: scored.sourceQualityScore,
        seniorityFit: scored.seniorityFit,
        roleFitScore: scored.roleFitScore,
        payEstimate: payEstimate(job),
        applyAction: sourceAction(scored.sourceQuality),
        reasons: scored.reasons,
        penalties: scored.penalties
      });
    }
  } catch (error) {
    console.warn(`  skipped: ${error.message}`);
  }
}

const seen = new Set();

let leads = raw
  .filter((job) => {
    const key = `${job.company}|${job.title}|${job.location}`.toLowerCase()
      .replace(/[^a-z0-9|]+/g, ' ')
      .trim();

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .map((job) => ({
    ...job,
    priority: priorityFor(job)
  }))
  .sort((a, b) =>
    b.score - a.score ||
    sourceScore(b.sourceQuality) - sourceScore(a.sourceQuality) ||
    a.company.localeCompare(b.company)
  );

// Cap A-list to the strongest 5 only.
let aCount = 0;
leads = leads.map((job) => {
  if (job.priority === 'A') {
    aCount += 1;
    if (aCount > 5) {
      return {
        ...job,
        priority: 'B',
        reasons: [...job.reasons, 'A-list capped - review after top 5']
      };
    }
  }

  return job;
});

const qualified = leads.filter((job) => job.priority !== 'D');
const queue = qualified.slice(0, maxRows);

const counts = {
  total: queue.length,
  a: queue.filter((job) => job.priority === 'A').length,
  b: queue.filter((job) => job.priority === 'B').length,
  c: queue.filter((job) => job.priority === 'C').length,
  aggregator: queue.filter((job) => job.sourceQuality === 'Aggregator').length,
  direct: queue.filter((job) => ['Direct Company', 'Direct ATS'].includes(job.sourceQuality)).length,
  highVisa: queue.filter((job) => job.visaRisk === 'High').length
};

const warnings = [];

for (const job of queue) {
  if (!job.applyUrl) warnings.push({ level: 'HIGH', type: 'missing_apply_url', message: `Missing apply URL: ${job.company} - ${job.title}` });
  if (job.priority === 'A' && job.visaRisk !== 'Lower' && job.visaRisk !== 'Medium') warnings.push({ level: 'HIGH', type: 'visa_risk', message: `Risky visa status in A-list: ${job.company} - ${job.title}` });
  if (job.priority === 'A' && !trustedForA(job)) warnings.push({ level: 'HIGH', type: 'source_quality', message: `Untrusted source in A-list: ${job.company} - ${job.title}` });
  if (/european|western|native speaker/i.test(`${job.title} ${job.description}`)) warnings.push({ level: 'MEDIUM', type: 'nationality_filter', message: `Possible nationality filter: ${job.company} - ${job.title}` });
  if (job.sourceQuality === 'Aggregator') warnings.push({ level: 'LOW', type: 'aggregator', message: `Find original source first: ${job.company} - ${job.title}` });
  if (job.sourceQuality === 'Other') warnings.push({ level: 'LOW', type: 'unknown_source', message: `Manual source verification needed: ${job.company} - ${job.title}` });
  if (vagueOrSuspiciousCompany(job)) warnings.push({ level: 'MEDIUM', type: 'suspicious_company', message: `Vague/suspicious company naming: ${job.company} - ${job.title}` });
}

if (counts.a > 5) warnings.push({ level: 'HIGH', type: 'a_list_overload', message: `Too many A-list rows: ${counts.a}` });

const generated = new Date().toISOString();

writeFileSync(join(outputRoot, 'babar-leads.json'), JSON.stringify({ generated, leads, counts }, null, 2) + '\n', 'utf8');

const leadsMd = [
  '# Babar Hospitality Leads v2',
  '',
  `Generated: ${generated}`,
  `Region mode: ${regionMode}`,
  `Queries: ${selectedSearches.length}`,
  `Total leads: ${leads.length}`,
  '',
  '| Rank | Priority | Score | Source Quality | Region | Visa Risk | Company | Role | Location | Pay Estimate | Action | Why | URL |',
  '|---:|---|---:|---|---|---|---|---|---|---|---|---|---|',
  ...queue.map((job, index) =>
    `| ${index + 1} | ${job.priority} | ${job.score} | ${md(job.sourceQuality)} | ${md(job.regionType)} | ${md(job.visaRisk)} | ${md(job.company)} | ${md(job.title)} | ${md(job.location)} | ${md(job.payEstimate)} | ${md(job.applyAction)} | ${md(job.reasons.join(', '))} | ${md(job.applyUrl)} |`
  )
].join('\n');

writeFileSync(join(outputRoot, 'babar-leads.md'), leadsMd, 'utf8');

const queueMd = [
  '# Babar Apply Queue v2',
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
  '- **A:** Apply today after verifying source and visa/location fit. Maximum 5.',
  '- **B:** Good lead. Review next or verify original source.',
  '- **C:** Backlog unless fast or highly strategic.',
  '',
  '## Today Queue',
  '',
  '| Priority | Rank | Company | Role | Score | Source | Region | Visa Risk | Pay | Action | Why | Apply URL |',
  '|---|---:|---|---|---:|---|---|---|---|---|---|---|',
  ...queue.map((job, index) =>
    `| ${job.priority} | ${index + 1} | ${md(job.company)} | ${md(job.title)} | ${job.score} | ${md(job.sourceQuality)} | ${md(job.regionType)} | ${md(job.visaRisk)} | ${md(job.payEstimate)} | ${md(job.applyAction)} | ${md(job.reasons.join(', '))} | ${md(job.applyUrl)} |`
  ),
  '',
  '## Detailed Notes',
  '',
  ...queue.slice(0, 15).map((job, index) => [
    `### ${job.priority}${index + 1} - ${job.company} - ${job.title}`,
    '',
    `- **Score:** ${job.score}`,
    `- **Source quality:** ${job.sourceQuality}`,
    `- **Apply action:** ${job.applyAction}`,
    `- **Region type:** ${job.regionType}`,
    `- **Visa risk:** ${job.visaRisk}`,
    `- **Visa notes:** ${job.visaReasons.join(', ')}`,
    `- **Seniority fit:** ${job.seniorityFit}`,
    `- **Pay estimate:** ${job.payEstimate}`,
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
  '# Babar Queue Health v2',
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
  `- Aggregator rows: ${counts.aggregator}`,
  `- High visa risk rows: ${counts.highVisa}`,
  `- Warnings: ${warnings.length}`,
  '',
  '## Warnings',
  '',
  ...(warnings.length ? warnings.map((w) => `- **${w.level} / ${w.type}:** ${w.message}`) : ['- None'])
].join('\n');

writeFileSync(join(outputRoot, 'babar-queue-health.md'), healthMd, 'utf8');

const quickActions = [
  '# Babar Quick Actions',
  '',
  `Generated: ${generated}`,
  '',
  '## Apply Today',
  '',
  ...queue.filter((job) => job.priority === 'A').map((job, index) => [
    `### ${index + 1}. ${job.company} - ${job.title}`,
    '',
    `- Source: ${job.sourceQuality}`,
    `- Action: ${job.applyAction}`,
    `- Visa risk: ${job.visaRisk}`,
    `- Pay: ${job.payEstimate}`,
    `- Proof angle: ${job.reasons.includes('multi-unit/regional fit') ? 'Burgerizzer 12-branch expansion' : job.reasons.includes('pre-opening fit') ? 'Regulus/Food Fund pre-opening execution' : job.reasons.includes('resort fit') ? 'IRIS/Pinnacle/Shangrila resort operations' : 'F&B operations and cost control'}`,
    `- URL: ${job.applyUrl}`,
    ''
  ].join('\n')),
  '',
  '## Verify Next',
  '',
  ...queue.filter((job) => job.priority === 'B').slice(0, 10).map((job, index) => [
    `### ${index + 1}. ${job.company} - ${job.title}`,
    '',
    `- Source: ${job.sourceQuality}`,
    `- Action: ${job.applyAction}`,
    `- Visa risk: ${job.visaRisk}`,
    `- Pay: ${job.payEstimate}`,
    `- URL: ${job.applyUrl}`,
    ''
  ].join('\n'))
].join('\n');

writeFileSync(join(outputRoot, 'babar-quick-actions.md'), quickActions, 'utf8');

const payMd = [
  '# Babar Pay Estimates',
  '',
  `Generated: ${generated}`,
  '',
  'These are heuristic ranges for quoting / expectation setting, not verified salary data.',
  '',
  '| Rank | Priority | Company | Role | Region | Pay Estimate |',
  '|---:|---|---|---|---|---|',
  ...queue.slice(0, 20).map((job, index) =>
    `| ${index + 1} | ${job.priority} | ${md(job.company)} | ${md(job.title)} | ${md(job.regionType)} | ${md(job.payEstimate)} |`
  )
].join('\n');

writeFileSync(join(outputRoot, 'babar-pay-estimates.md'), payMd, 'utf8');

const verifyOriginals = [
  '# Babar Verify Original Sources',
  '',
  `Generated: ${generated}`,
  '',
  'These roles may be good, but should not be applied to blindly from weak aggregator links.',
  '',
  '| Rank | Priority | Company | Role | Source | Action | URL |',
  '|---:|---|---|---|---|---|---|',
  ...queue
    .filter((job) => ['Aggregator', 'Other', 'Major Job Board'].includes(job.sourceQuality))
    .map((job, index) =>
      `| ${index + 1} | ${job.priority} | ${md(job.company)} | ${md(job.title)} | ${md(job.sourceQuality)} | ${md(job.applyAction)} | ${md(job.applyUrl)} |`
    )
].join('\n');

writeFileSync(join(outputRoot, 'babar-verify-originals.md'), verifyOriginals, 'utf8');

console.log('');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-leads.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\today-babar-queue.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-queue-health.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-quick-actions.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-pay-estimates.md');
console.log('Saved: D:\\WorkOps\\runs\\babar-hospitality-global\\babar-verify-originals.md');
console.log('');
console.log(`Rows: ${counts.total} | A: ${counts.a} | B: ${counts.b} | C: ${counts.c} | Direct/ATS: ${counts.direct} | Aggregators: ${counts.aggregator} | Warnings: ${warnings.length}`);
