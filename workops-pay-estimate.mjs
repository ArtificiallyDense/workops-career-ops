#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import yaml from 'js-yaml';
import { paths } from './lib/workops-paths.mjs';

config();

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const top = Number.parseInt(argValue('--top', '12'), 10);
const useWeb = args.includes('--web');
const webQueriesPerRole = Number.parseInt(argValue('--web-queries', '1'), 10);
const runsRoot = dirname(paths.reportsDir);
const topPicksPath = join(runsRoot, 'opportunity-top-picks.md');
const applyPacksDir = join(runsRoot, 'apply-packs');
const summaryPath = join(runsRoot, 'pay-estimates.md');
const payConfigPath = join(paths.dataDir, 'config', 'pay-ranges.yml');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/â€“|â€”/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function money(value) {
  return `$${Number(value).toLocaleString('en-US')}`;
}

function rangeText(range, suffix = '') {
  if (!range || range.length < 2) return 'Not estimated';
  return `${money(range[0])}-${money(range[1])}${suffix}`;
}

function midpoint(range) {
  if (!range || range.length < 2) return null;
  return Math.round((Number(range[0]) + Number(range[1])) / 2);
}

function loadYamlSafe(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return yaml.load(readFileSync(path, 'utf8')) || fallback;
  } catch (error) {
    console.warn(`Could not load YAML ${path}: ${error.message}`);
    return fallback;
  }
}

const payConfig = loadYamlSafe(payConfigPath, {});

const internalBands = {
  logo_brand_style: {
    hourly: [25, 75],
    project: [150, 1200],
    retainer: [500, 2500],
    note: 'Logo plus brand style guide / small identity system.',
  },
  quick_logo: {
    hourly: [20, 55],
    project: [75, 500],
    retainer: [300, 1200],
    note: 'Quick logo, cleanup, small visual identity task.',
  },
  freelance_graphic_designer: {
    hourly: [25, 80],
    day: [200, 650],
    project: [150, 1500],
    retainer: [800, 3500],
    note: 'General freelance graphic design, campaign assets, layouts.',
  },
  paid_media_designer: {
    hourly: [35, 95],
    day: [250, 750],
    project: [250, 2000],
    retainer: [1200, 5000],
    note: 'Paid social creative / ad creative / performance design.',
  },
  brand_designer: {
    hourly: [35, 100],
    day: [300, 800],
    project: [500, 3500],
    retainer: [1500, 6000],
    note: 'Brand identity, brand systems, style direction.',
  },
  senior_designer: {
    hourly: [50, 125],
    day: [400, 1000],
    project: [800, 5000],
    retainer: [2000, 8000],
    note: 'Senior freelance designer / design lead.',
  },
  creative_strategist: {
    hourly: [45, 120],
    day: [350, 950],
    project: [750, 5000],
    retainer: [2000, 8000],
    note: 'Creative strategy, campaign concepts, brand direction.',
  },
  content_creator: {
    hourly: [25, 75],
    day: [200, 600],
    project: [250, 2000],
    retainer: [800, 4000],
    note: 'Content creation, social media visuals, short-form creative.',
  },
  social_media_designer: {
    hourly: [25, 70],
    day: [200, 550],
    project: [150, 1500],
    retainer: [700, 3000],
    note: 'Social post packs, reels covers, thumbnails, campaign graphics.',
  },
  thumbnail_designer: {
    hourly: [20, 60],
    project: [50, 300],
    retainer: [500, 2500],
    note: 'YouTube thumbnails, podcast thumbnails, content packaging.',
  },
  canva_designer: {
    hourly: [20, 55],
    project: [100, 1000],
    retainer: [500, 2500],
    note: 'Canva templates, social packs, simple execution work.',
  },
  ai_creative_producer: {
    hourly: [50, 150],
    day: [400, 1200],
    project: [1000, 8000],
    retainer: [2500, 10000],
    note: 'AI-assisted creative systems, image workflows, campaign production.',
  },
  product_designer: {
    hourly: [50, 140],
    day: [400, 1100],
    project: [1000, 8000],
    retainer: [3000, 12000],
    note: 'Product/UX design; only relevant if role is actually product design.',
  },
  content_writer: {
    hourly: [25, 90],
    project: [200, 2500],
    retainer: [1000, 5000],
    note: 'Content writing, thought leadership, B2B content.',
  },
};
const bands = { ...internalBands, ...(payConfig.bands || {}) };
const defaultBand = payConfig.default || {
  hourly: [25, 75],
  day: [200, 600],
  project: [150, 1500],
  retainer: [800, 3500],
  note: 'General remote creative freelance range.',
};

function parseTopPicks() {
  if (!existsSync(topPicksPath)) {
    console.error(`Missing top picks file: ${topPicksPath}`);
    process.exit(1);
  }

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
    .slice(0, top);
}

function reportPathFor(pick) {
  const cleaned = pick.report.replace(/^reports[\\/]/, '');
  return join(paths.reportsDir, cleaned);
}

function findApplyPack(company, role) {
  if (!existsSync(applyPacksDir)) return null;

  const folders = readdirSync(applyPacksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const companySlug = slugify(company);
  const roleSlug = slugify(role);

  const ranked = folders
    .map((folder) => {
      let score = 0;
      if (folder.includes(companySlug)) score += 5;
      for (const part of roleSlug.split('-').filter((p) => p.length > 3)) {
        if (folder.includes(part)) score += 1;
      }
      return { folder, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0] ? join(applyPacksDir, ranked[0].folder) : null;
}

function classifyRole(company, role, reportText) {
  const title = `${company} ${role}`.toLowerCase();
  const report = String(reportText || '').toLowerCase();

  // Important: classify primarily by the opportunity title, not by Asad's AI-heavy CV/profile text inside reports.

  if (/logo.*brand style guide|brand style guide|brand kit|visual identity/.test(title)) return 'logo_brand_style';
  if (/quick.*logo|logo edit|logo design needed|design two logos|logo for|logo creator|logo design/.test(title)) return 'quick_logo';

  if (/thumbnail|thumbnail architect/.test(title)) return 'thumbnail_designer';

  if (/paid media|paid social|ad creative|performance creative/.test(title)) return 'paid_media_designer';

  if (/senior designer|senior graphic designer|freelance senior designer|design lead/.test(title)) return 'senior_designer';

  if (/creative strategist|creative strategy/.test(title)) return 'creative_strategist';

  if (/brand designer|brand builder|brand identity|brand system/.test(title)) return 'brand_designer';

  if (/canva/.test(title)) return 'canva_designer';

  if (/social media designer|social media visual|instagram|facebook|reels|tiktok/.test(title)) return 'social_media_designer';

  if (/content creator|digital content creator|video creator|short-form/.test(title)) return 'content_creator';

  if (/content writer|copywriter|writer/.test(title)) return 'content_writer';

  if (/product designer|ux designer|ui designer/.test(title)) return 'product_designer';

  if (/ai creative producer|generative ai creative|ai image designer|ai product visual|midjourney designer|comfyui designer/.test(title)) return 'ai_creative_producer';

  if (/graphic designer|freelance designer|designer/.test(title)) return 'freelance_graphic_designer';

  // Secondary fallback only, using report/JD language but avoiding candidate profile pollution.
  if (/paid media creative|ad creative|performance design/.test(report)) return 'paid_media_designer';
  if (/brand identity|brand system|style guide/.test(report)) return 'brand_designer';
  if (/social media|instagram|tiktok|reels/.test(report)) return 'social_media_designer';
  if (/graphic designer|freelance designer/.test(report)) return 'freelance_graphic_designer';

  return 'default';
}

function extractExplicitComp(text) {
  const patterns = [
    /[$€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:-|–|to)\s?[$€£]?\s?\d[\d,]*(?:\.\d+)?\s?(?:\/?\s?(?:hr|hour|day|month|year|yr|annum|annually))?/gi,
    /[$€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:\/?\s?(?:hr|hour|day|month|year|yr|annum|annually))/gi,
    /\d[\d,]*\s?(?:-|–|to)\s?\d[\d,]*\s?(?:USD|EUR|GBP|THB)\s?(?:\/?\s?(?:hr|hour|day|month|year|yr|annum|annually))?/gi,
  ];

  const found = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].replace(/\s+/g, ' ').trim();
      if (!found.includes(value)) found.push(value);
    }
  }

  return found.slice(0, 12);
}

function webQueriesFor(pick, roleClass) {
  const baseRole = pick.role.replace(/\([^)]*\)/g, '').replace(/remote|freelance|contract/gi, '').trim();

  const queries = [
    `${pick.company} ${baseRole} salary rate`,
    `${baseRole} freelance hourly rate remote`,
    `${baseRole} contractor rate ${roleClass.replace(/_/g, ' ')}`,
  ];

  return queries.slice(0, webQueriesPerRole);
}

async function fetchWebEvidence(pick, roleClass) {
  if (!useWeb) return [];

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [{ title: 'Web search skipped', snippet: 'SERPAPI_API_KEY missing.', link: '' }];

  const evidence = [];

  for (const query of webQueriesFor(pick, roleClass)) {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('hl', 'en');
    url.searchParams.set('gl', 'us');
    url.searchParams.set('api_key', apiKey);

    try {
      const res = await fetch(url.toString(), {
        headers: { 'user-agent': 'Mozilla/5.0 WorkOps pay estimate' },
      });

      if (!res.ok) {
        evidence.push({ title: `Search failed: ${query}`, snippet: `HTTP ${res.status}`, link: '' });
        continue;
      }

      const data = await res.json();
      const organic = data.organic_results || [];

      for (const item of organic.slice(0, 3)) {
        evidence.push({
          query,
          title: item.title || '',
          snippet: item.snippet || '',
          link: item.link || '',
        });
      }
    } catch (error) {
      evidence.push({ title: `Search failed: ${query}`, snippet: error.message, link: '' });
    }
  }

  return evidence;
}

function extractMoneyFromSnippets(evidence) {
  const text = evidence.map((item) => `${item.title} ${item.snippet}`).join('\n');
  return extractExplicitComp(text).slice(0, 10);
}

function estimateFor(pick, reportText, webEvidence) {
  const roleClass = classifyRole(pick.company, pick.role, reportText);
  const band = bands[roleClass] || defaultBand;

  const explicit = extractExplicitComp(reportText);
  const webMoney = extractMoneyFromSnippets(webEvidence);

  const hourly = band.hourly || defaultBand.hourly;
  const day = band.day || defaultBand.day;
  const project = band.project || defaultBand.project;
  const retainer = band.retainer || defaultBand.retainer;

  const targetHourly = midpoint(hourly);
  const anchorHourly = hourly ? hourly[1] : null;
  const floorHourly = hourly ? hourly[0] : null;

  let confidence = 'Medium';
  if (explicit.length && webMoney.length) confidence = 'High';
  else if (explicit.length || webMoney.length) confidence = 'Medium-High';

  const roleText = `${pick.company} ${pick.role}`.toLowerCase();
  let quoteMode = 'Hourly or project';
  if (/upwork|hourspent|logo|brand style guide|quick turnaround|two logos/.test(roleText)) quoteMode = 'Project quote first';
  if (/full-time|product designer|creative producer|junior creative strategist/.test(roleText)) quoteMode = 'Salary / monthly equivalent';
  if (/freelance|contract|part-time|part time/.test(roleText)) quoteMode = 'Hourly, day rate, or monthly retainer';

  return {
    roleClass,
    band,
    explicit,
    webMoney,
    hourly,
    day,
    project,
    retainer,
    targetHourly,
    anchorHourly,
    floorHourly,
    confidence,
    quoteMode,
  };
}

function writeEstimate(applyPackDir, pick, estimate, webEvidence) {
  mkdirSync(applyPackDir, { recursive: true });

  const file = join(applyPackDir, '10-compensation-estimate.md');

  const lines = [
    `# Compensation Estimate — ${pick.company} — ${pick.role}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Quick Recommendation',
    '',
    `- **Quote mode:** ${estimate.quoteMode}`,
    `- **Estimated hourly range:** ${rangeText(estimate.hourly, '/hr')}`,
    `- **Recommended target hourly:** ${estimate.targetHourly ? money(estimate.targetHourly) + '/hr' : 'Not estimated'}`,
    `- **Do not go below:** ${estimate.floorHourly ? money(estimate.floorHourly) + '/hr' : 'Not estimated'} unless strategically useful`,
    `- **Anchor high at:** ${estimate.anchorHourly ? money(estimate.anchorHourly) + '/hr' : 'Not estimated'} when negotiation room exists`,
    `- **Estimated project range:** ${rangeText(estimate.project)}`,
    `- **Estimated day rate:** ${rangeText(estimate.day, '/day')}`,
    `- **Estimated monthly retainer:** ${rangeText(estimate.retainer, '/month')}`,
    `- **Confidence:** ${estimate.confidence}`,
    '',
    '## Role Classification',
    '',
    `- **Class:** ${estimate.roleClass}`,
    `- **Band note:** ${estimate.band.note || 'No note.'}`,
    '',
    '## Company / Client Perspective',
    '',
    'This estimate is meant to help quote realistically from the buyer side, not just from your desired income side. For marketplace gigs, expect tighter budgets and faster decisions. For direct company roles, anchor higher and present your AI workflow as a production-speed advantage.',
    '',
    '## Explicit Compensation Found in Report / JD',
    '',
  ];

  if (estimate.explicit.length) {
    for (const item of estimate.explicit) lines.push(`- ${item}`);
  } else {
    lines.push('- No explicit compensation found in the saved report/JD.');
  }

  lines.push('', '## Online Salary / Rate Signals');

  if (estimate.webMoney.length) {
    for (const item of estimate.webMoney) lines.push(`- ${item}`);
  } else if (webEvidence.length) {
    lines.push('- Online snippets were checked, but no clean salary/rate figure was extracted.');
  } else {
    lines.push('- Web enrichment not used. Run with `--web` to add online snippets.');
  }

  if (webEvidence.length) {
    lines.push('', '## Web Evidence Snippets');
    for (const item of webEvidence.slice(0, 9)) {
      lines.push('');
      lines.push(`### ${item.title || 'Untitled result'}`);
      if (item.query) lines.push(`Query: ${item.query}`);
      if (item.snippet) lines.push(item.snippet);
      if (item.link) lines.push(item.link);
    }
  }

  lines.push('');
  lines.push('## Suggested Quoting Language');
  lines.push('');
  lines.push('For hourly roles:');
  lines.push('');
  lines.push(`> My rate for this kind of work is typically around ${estimate.targetHourly ? money(estimate.targetHourly) + '/hr' : rangeText(estimate.hourly, '/hr')}, depending on turnaround, number of concepts, revision scope, and whether AI-assisted production systems are included.`);
  lines.push('');
  lines.push('For project roles:');
  lines.push('');
  lines.push(`> For this scope, I would usually estimate ${rangeText(estimate.project)} depending on deliverables, revisions, and timeline. I can also structure this as a smaller first milestone if you want to test fit quickly.`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Treat this as a practical quote range, not guaranteed market truth.');
  lines.push('- If the client is a serious brand/company, anchor closer to the top half.');
  lines.push('- If the lead is a fast marketplace gig, quote quickly and reduce scope instead of lowering too much.');
  lines.push('- If they ask for AI workflows, speed, or multiple variations, charge for the production system value, not only manual design time.');
  lines.push('');

  writeFileSync(file, lines.join('\n'), 'utf8');

  const readmePath = join(applyPackDir, 'README.md');
  if (existsSync(readmePath)) {
    let readme = readFileSync(readmePath, 'utf8');

    if (!readme.includes('10-compensation-estimate.md')) {
      readme = readme.replace(
        '- `09-final-checklist.md` — submit checklist',
        '- `09-final-checklist.md` — submit checklist\n- `10-compensation-estimate.md` — pay/rate range and quoting guidance'
      );

      readme = readme.replace(
        '4. Submit only after `09-final-checklist.md` is complete.',
        '4. Check `10-compensation-estimate.md` before quoting or answering salary/rate questions.\n5. Submit only after `09-final-checklist.md` is complete.'
      );

      writeFileSync(readmePath, readme, 'utf8');
    }
  }

  return file;
}

const picks = parseTopPicks();
const summary = [
  '# WorkOps Pay Estimates',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Web enrichment: ${useWeb ? 'yes' : 'no'}`,
  '',
  '| Rank | Company | Role | Class | Hourly | Target | Project | Retainer | Confidence | Apply Pack |',
  '|---:|---|---|---|---|---|---|---|---|---|',
];

for (const pick of picks) {
  const reportPath = reportPathFor(pick);
  const reportText = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : '';

  const roleClass = classifyRole(pick.company, pick.role, reportText);
  const webEvidence = await fetchWebEvidence(pick, roleClass);
  const estimate = estimateFor(pick, reportText, webEvidence);

  const applyPack = findApplyPack(pick.company, pick.role);

  if (!applyPack) {
    console.warn(`Apply pack not found for ${pick.company} — ${pick.role}`);
    continue;
  }

  const estimateFile = writeEstimate(applyPack, pick, estimate, webEvidence);

  const safe = (value) => String(value || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

  summary.push(
    `| ${safe(pick.rank)} | ${safe(pick.company)} | ${safe(pick.role)} | ${safe(estimate.roleClass)} | ${safe(rangeText(estimate.hourly, '/hr'))} | ${safe(estimate.targetHourly ? money(estimate.targetHourly) + '/hr' : '')} | ${safe(rangeText(estimate.project))} | ${safe(rangeText(estimate.retainer, '/mo'))} | ${safe(estimate.confidence)} | ${safe(estimateFile)} |`
  );

  console.log(`Estimated: ${pick.company} — ${pick.role}`);
}

writeFileSync(summaryPath, summary.join('\n'), 'utf8');

console.log('');
console.log(`Saved: ${summaryPath}`);
