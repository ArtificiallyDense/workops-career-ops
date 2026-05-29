#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const top = Number.parseInt(argValue('--top', '12'), 10);
const aLimit = Number.parseInt(argValue('--a-limit', '3'), 10);
const bLimit = Number.parseInt(argValue('--b-limit', '6'), 10);

const runsRoot = dirname(paths.reportsDir);
const topPicksPath = join(runsRoot, 'opportunity-top-picks.md');
const payEstimatesPath = join(runsRoot, 'pay-estimates.md');
const applyPacksDir = join(runsRoot, 'apply-packs');
const mdOutputPath = join(runsRoot, 'today-apply-queue.md');
const jsonOutputPath = join(runsRoot, 'today-apply-queue.json');

function clean(value) {
  return String(value || '')
    .replace(/â€“|â€”|–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeCell(value) {
  return clean(value).replace(/\|/g, '/');
}

function normalizeApplyPackPath(value) {
  const cleaned = clean(value);
  if (!cleaned) return '';
  return cleaned.endsWith('10-compensation-estimate.md')
    ? cleaned.replace(/\\10-compensation-estimate\.md$/, '').replace(/\/10-compensation-estimate\.md$/, '')
    : cleaned;
}

function compensationPathFor(applyPack) {
  if (!applyPack) return '';
  if (applyPack.endsWith('10-compensation-estimate.md')) return applyPack;
  return join(applyPack, '10-compensation-estimate.md');
}

function linkRisk(url) {
  const value = clean(url).toLowerCase();
  if (!value) return 'Missing apply URL - open report/apply pack.';
  if (value.includes('indeed.com')) return 'Indeed link may be gated/blocked - search company careers if it fails.';
  if (value.includes('google.com/search')) return 'Google Jobs link - prefer direct apply URL if available.';
  if (value.includes('upwork.com')) return 'Marketplace link - use short proposal and verify client/budget.';
  if (value.includes('linkedin.com')) return 'LinkedIn link - may require login; verify posting freshness.';
  return 'Normal link.';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/â€“|â€”|–|—/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function parseMarkdownTable(path) {
  if (!existsSync(path)) return [];

  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !line.includes('---:') && !line.includes('Rank |'))
    .map((line) => line.split('|').map((part) => part.trim()).filter(Boolean));
}

function parseTopPicks() {
  return parseMarkdownTable(topPicksPath)
    .map((parts) => ({
      rank: Number.parseInt(parts[0], 10),
      company: clean(parts[1]),
      role: clean(parts[2]),
      score: clean(parts[3]),
      decision: clean(parts[4]),
      why: clean(parts[5]),
      report: clean(parts[6]),
    }))
    .filter((row) => row.report && row.report.endsWith('.md'))
    .slice(0, top);
}

function parsePayEstimates() {
  const map = new Map();

  for (const parts of parseMarkdownTable(payEstimatesPath)) {
    const row = {
      rank: clean(parts[0]),
      company: clean(parts[1]),
      role: clean(parts[2]),
      roleClass: clean(parts[3]),
      hourly: clean(parts[4]),
      target: clean(parts[5]),
      project: clean(parts[6]),
      retainer: clean(parts[7]),
      confidence: clean(parts[8]),
      applyPack: clean(parts[9]),
    };

    map.set(`${row.company}||${row.role}`.toLowerCase(), row);
  }

  return map;
}

function reportPathFor(pick) {
  return join(paths.reportsDir, pick.report.replace(/^reports[\\/]/, ''));
}

function extractUrlFromReport(pick) {
  const reportPath = reportPathFor(pick);
  if (!existsSync(reportPath)) return '';

  const text = readFileSync(reportPath, 'utf8');
  const match =
    text.match(/\*\*URL:\*\*\s*(https?:\/\/\S+)/i) ||
    text.match(/^URL:\s*(https?:\/\/\S+)/im) ||
    text.match(/Apply URL:\s*(https?:\/\/\S+)/i);

  return match ? match[1].trim() : '';
}

function findApplyPack(company, role) {
  if (!existsSync(applyPacksDir)) return '';

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

  return ranked[0] ? join(applyPacksDir, ranked[0].folder) : '';
}

function priorityFor(pick, index) {
  const score = Number.parseFloat(pick.score) || 0;
  const decision = pick.decision.toLowerCase();

  if (index < aLimit && decision.includes('act now') && score >= 4.5) return 'A';
  if (index < bLimit && (decision.includes('act now') || decision.includes('strong maybe')) && score >= 4.1) return 'B';
  return 'C';
}

function submissionStyle(priority, row) {
  const text = `${row.company} ${row.role}`.toLowerCase();

  if (priority === 'A') return 'Highly personalized application / proposal';
  if (/upwork|hourspent|logo|brand style/.test(text)) return 'Short marketplace proposal';
  if (priority === 'B') return 'Semi-personalized application';
  return 'Backlog / save for later';
}

function actionFor(priority, row) {
  const text = `${row.company} ${row.role}`.toLowerCase();

  if (priority === 'A' && /indeed|google jobs/.test(text)) return 'Verify direct apply link, then customize and apply today';
  if (priority === 'A') return 'Apply today after customizing opening paragraph';
  if (priority === 'B' && /upwork|hourspent|logo|canva|freelance/.test(text)) return 'Quick pitch if link is easy';
  if (priority === 'B') return 'Review after A-list';
  return 'Do not apply today unless very fast';
}

function suggestedProof(row) {
  const text = `${row.company} ${row.role} ${row.why} ${row.roleClass}`.toLowerCase();

  if (/thumbnail|youtube|podcast|sweet fish/.test(text)) return 'World of Sports + Space Cats motion/social examples + thumbnail-style layout proof';
  if (/linjer|tarte|fable|fashion|cosmetic|beauty|skincare|jewelry|bag|home/.test(text)) return 'Farida Waller + Zaha Vintage + premium ecommerce/product visuals';
  if (/logo|brand style|brand guide|brand kit/.test(text)) return 'Best logo/brand identity examples + one clean brand-system mockup';
  if (/canva|social media|instagram|facebook|reels|tiktok/.test(text)) return 'Social media post pack, reel cover, Canva/Adobe template examples';
  if (/ai creative|elevenlabs|generative|midjourney|comfyui/.test(text)) return 'AI workflow proof: ComfyUI/Midjourney/Adobe pipeline + before/after visuals';
  if (/writer|content/.test(text)) return 'Visual-first LinkedIn carousel or AI workflow explainer';
  return 'Pick 1-2 closest Behance examples and mention exact relevance';
}

function personalizationAngle(row) {
  const text = `${row.company} ${row.role} ${row.why}`.toLowerCase();

  if (/sweet fish|thumbnail/.test(text)) {
    return 'Mention brand-building thumbnails/content packaging and how you can create repeatable visual systems.';
  }

  if (/linjer|tarte|fable|fashion|cosmetic|beauty|skincare|jewelry|bags|home brand/.test(text)) {
    return 'Mention premium ecommerce/lifestyle visuals and connect Farida Waller or Zaha Vintage to their product category.';
  }

  if (/logo|brand style|brand guide/.test(text)) {
    return 'Mention logo system, brand guide, usable deliverables, and fast first concepts.';
  }

  if (/canva|social media|instagram|facebook|reels|tiktok/.test(text)) {
    return 'Mention fast social pack production, templates, platform formats, and quick turnaround.';
  }

  if (/ai creative|elevenlabs|generative/.test(text)) {
    return 'Mention AI-assisted creative production systems, not just design tools.';
  }

  if (/writer|content/.test(text)) {
    return 'Mention visual-first content and your ability to turn complex ideas into clean, readable assets.';
  }

  return 'Add one company-specific sentence and one concrete deliverable.';
}

function humanSignal(row) {
  const text = `${row.company} ${row.role}`.toLowerCase();

  if (/upwork|hourspent/.test(text)) {
    return 'Reference the exact deliverable they requested and propose a first milestone.';
  }

  if (/tarte|linjer|fable|parachute|home|cosmetic|beauty|fashion/.test(text)) {
    return 'Mention their product/category aesthetic before talking about your tools.';
  }

  if (/sweet fish|media|thumbnail/.test(text)) {
    return 'Mention content packaging, hooks, and repeatable thumbnail systems.';
  }

  return 'Mention one specific thing about their project/company before introducing yourself.';
}

function statusFor(priority) {
  if (priority === 'A') return 'Not started - apply today';
  if (priority === 'B') return 'Review after A-list';
  return 'Backlog';
}

const picks = parseTopPicks();
const payMap = parsePayEstimates();

const rows = picks.map((pick, index) => {
  const pay = payMap.get(`${pick.company}||${pick.role}`.toLowerCase()) || {};
  const base = { ...pick, ...pay };
  const priority = priorityFor(pick, index);
  const applyPack = normalizeApplyPackPath(pay.applyPack || findApplyPack(pick.company, pick.role));
  const url = extractUrlFromReport(pick);

  return {
    priority,
    rank: pick.rank,
    company: pick.company,
    role: pick.role,
    score: pick.score,
    decision: pick.decision,
    why: pick.why,
    roleClass: pay.roleClass || '',
    payTarget: pay.target || '',
    hourly: pay.hourly || '',
    project: pay.project || '',
    retainer: pay.retainer || '',
    compensationConfidence: pay.confidence || '',
    action: actionFor(priority, base),
    submissionStyle: submissionStyle(priority, base),
    status: statusFor(priority),
    humanSignal: humanSignal(base),
    personalizationAngle: personalizationAngle(base),
    suggestedProof: suggestedProof(base),
    applyUrl: url,
    linkRisk: linkRisk(url),
    applyPack,
    compensationFile: compensationPathFor(applyPack),
    report: pick.report,
  };
});

const md = [
  '# WorkOps Apply Queue',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Daily Rule',
  '',
  'Apply well, not everywhere. A good application must include one human signal, one relevant proof, and one clear deliverable.',
  '',
  '## Priority System',
  '',
  '- **A:** Apply today with real personalization. Limit: top 3 by default.',
  '- **B:** Good lead. Semi-personalize or apply after A-list.',
  '- **C:** Backlog. Save unless it is very fast.',
  '',
  '## Today Queue',
  '',
  '| Priority | Rank | Company | Role | Score | Pay Target | Submission Style | Link Risk | Status |',
  '|---|---:|---|---|---:|---|---|---|---|',
];

for (const row of rows) {
  md.push(`| ${safeCell(row.priority)} | ${safeCell(row.rank)} | ${safeCell(row.company)} | ${safeCell(row.role)} | ${safeCell(row.score)} | ${safeCell(row.payTarget)} | ${safeCell(row.submissionStyle)} | ${safeCell(row.linkRisk)} | ${safeCell(row.status)} |`);
}

md.push('');
md.push('## Detailed Notes');
md.push('');

for (const row of rows) {
  md.push(`### ${row.priority}${row.rank} - ${row.company} - ${row.role}`);
  md.push('');
  md.push(`- **Decision:** ${row.decision}`);
  md.push(`- **Score:** ${row.score}`);
  md.push(`- **Role class:** ${row.roleClass || 'Not estimated'}`);
  md.push(`- **Pay target:** ${row.payTarget || 'Not estimated'}`);
  md.push(`- **Hourly range:** ${row.hourly || 'Not estimated'}`);
  md.push(`- **Project range:** ${row.project || 'Not estimated'}`);
  md.push(`- **Human signal:** ${row.humanSignal}`);
  md.push(`- **Personalization angle:** ${row.personalizationAngle}`);
  md.push(`- **Suggested proof:** ${row.suggestedProof}`);
  md.push(`- **Action:** ${row.action}`);
  md.push(`- **Apply URL:** ${row.applyUrl || 'Check report/apply pack'}`);
  md.push(`- **Link risk:** ${row.linkRisk}`);
  md.push(`- **Apply pack folder:** ${row.applyPack || 'Not found'}`);
  md.push(`- **Compensation file:** ${row.compensationFile || 'Not found'}`);
  md.push(`- **Report:** ${row.report}`);
  md.push('');
  md.push('Checklist:');
  md.push('');
  md.push('- [ ] Open apply pack folder');
  md.push('- [ ] Read compensation estimate');
  md.push('- [ ] Customize first paragraph / proposal opening');
  md.push('- [ ] Pick 1-2 relevant portfolio links');
  md.push('- [ ] Verify apply link / direct company page');
  md.push('- [ ] Submit or save with reason');
  md.push('- [ ] Update status manually here');
  md.push('');
}

writeFileSync(mdOutputPath, md.join('\n'), 'utf8');
writeFileSync(jsonOutputPath, JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2) + '\n', 'utf8');

console.log(`Apply queue saved: ${mdOutputPath}`);
console.log(`Apply queue JSON saved: ${jsonOutputPath}`);
