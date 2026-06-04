#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const RUNS_DIR = 'D:\\WorkOps\\runs';
const DATA_DIR = join(RUNS_DIR, 'data');

const queuePath = join(RUNS_DIR, 'today-apply-queue.json');
const statusPath = join(DATA_DIR, 'dashboard', 'apply-status.json');
const outJson = join(RUNS_DIR, 'money-plan.json');
const outMd = join(RUNS_DIR, 'money-plan.md');

mkdirSync(join(DATA_DIR, 'dashboard'), { recursive: true });

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function keyFor(row) {
  return clean(row.key || row.report || `${row.company || ''}|${row.role || ''}`).toLowerCase();
}

function workType(row) {
  const text = [
    row.company,
    row.role,
    row.submissionStyle,
    row.linkRisk,
    row.applyUrl,
    row.roleClass,
    row.action,
    row.report,
  ].join(' ').toLowerCase();

  if (/upwork|contra|twine|marketplace|freelance|freelancer|contractor|short-term|project|gig|logo creator|brand style guide|brand guide|canva designer needed/.test(text)) {
    return 'freelance_gig';
  }

  if (/part-time|full-time \/ part-time|contract-to-hire|temporary|contract/.test(text)) {
    return 'mixed_contract';
  }

  return 'career_job';
}

function workTypeLabel(type) {
  if (type === 'freelance_gig') return 'Freelance Gig';
  if (type === 'career_job') return 'Career Job';
  return 'Mixed / Contract';
}

function recommendedOffer(row, type) {
  const text = `${row.company} ${row.role} ${row.suggestedProof || ''} ${row.roleClass || ''}`.toLowerCase();

  if (/logo|brand style|brand guide|brand designer/.test(text)) return 'Logo + Mini Brand Guide';
  if (/thumbnail|youtube|content packaging|sweet fish/.test(text)) return 'Thumbnail / Content Packaging System';
  if (/social|canva|instagram|tiktok|paid media/.test(text)) return 'Social Media / Paid Creative Pack';
  if (/ecommerce|fashion|beauty|cosmetic|linjer|tarte|parachute|product/.test(text)) return 'Ecommerce Ad Creative Pack';
  if (/ai|generative|elevenlabs|automation|workflow/.test(text)) return 'AI Visual Production Pipeline';

  if (type === 'freelance_gig') return 'Fast Design Delivery Package';
  return 'Custom Creative Application';
}

function quoteStrategy(row, type, offer) {
  const target = clean(row.payTarget || '');

  if (/Logo \+ Mini Brand Guide/i.test(offer)) {
    return 'Quote first milestone: $250-$500 for 2-3 logo directions + mini style guide. Upsell full brand system later.';
  }

  if (/Thumbnail|Content Packaging/i.test(offer)) {
    return 'Quote $40/hr or $300-$900 for first batch / repeatable visual system.';
  }

  if (/Social Media|Paid Creative/i.test(offer)) {
    return 'Quote $300-$1,000 per creative pack depending on number of formats.';
  }

  if (/Ecommerce Ad/i.test(offer)) {
    return 'Quote $500-$2,000 for product/ad creative package, or hourly for ongoing support.';
  }

  if (/AI Visual Production/i.test(offer)) {
    return 'Start with discovery + prototype milestone. Move to project or monthly retainer if fit is strong.';
  }

  if (type === 'freelance_gig') return `Use short project quote. Target: ${target || '$40-$60/hr'}.`;
  return `Use professional rate language. Target: ${target || 'market-aligned rate'}.`;
}

function estimatedApplyMinutes(row, type) {
  const p = clean(row.priority);

  if (type === 'freelance_gig') {
    if (p === 'A') return 25;
    if (p === 'B') return 18;
    return 10;
  }

  if (type === 'career_job') {
    if (p === 'A') return 50;
    if (p === 'B') return 35;
    return 18;
  }

  if (p === 'A') return 35;
  if (p === 'B') return 25;
  return 12;
}

function cashSpeed(type, row) {
  const text = `${row.company} ${row.role} ${row.submissionStyle || ''}`.toLowerCase();

  if (type === 'freelance_gig') return 'Fast';
  if (/short-term|contractor|freelance|project/.test(text)) return 'Medium-Fast';
  if (type === 'mixed_contract') return 'Medium';
  return 'Slow';
}

function closeProbability(row, type) {
  const risk = clean(row.linkRisk || '').toLowerCase();
  const fit = Number.parseFloat(row.score) || 0;

  let p = 42;

  if (type === 'freelance_gig') p += 10;
  if (fit >= 4.7) p += 14;
  else if (fit >= 4.4) p += 8;
  else if (fit >= 4.1) p += 3;

  if (risk.includes('missing')) p -= 24;
  if (risk.includes('gated') || risk.includes('login')) p -= 10;
  if (risk.includes('marketplace')) p += 5;
  if (risk.includes('normal')) p += 8;

  return Math.max(5, Math.min(90, p));
}

function moneyScore(row, type, minutes) {
  const p = clean(row.priority);
  const risk = clean(row.linkRisk || '').toLowerCase();
  const fit = Number.parseFloat(row.score) || 0;

  let score = 40;

  if (p === 'A') score += 28;
  else if (p === 'B') score += 14;
  else score += 2;

  if (type === 'freelance_gig') score += 9;
  if (type === 'career_job') score += 5;
  if (type === 'mixed_contract') score += 4;

  if (fit >= 4.8) score += 18;
  else if (fit >= 4.7) score += 14;
  else if (fit >= 4.4) score += 8;
  else if (fit >= 4.1) score += 3;

  if (risk.includes('normal')) score += 8;
  if (risk.includes('marketplace')) score += 6;
  if (risk.includes('missing')) score -= 25;
  if (risk.includes('gated') || risk.includes('login')) score -= 10;

  if (minutes <= 15) score += 4;
  if (minutes > 45) score -= 5;

  if (p === 'C') score = Math.min(score, 76);
  if (risk.includes('missing')) score = Math.min(score, 58);
  if (risk.includes('gated') || risk.includes('login')) score = Math.min(score, 74);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function moneyLane(row, type, score) {
  const p = clean(row.priority);
  const text = `${row.company} ${row.role} ${row.linkRisk || ''}`.toLowerCase();

  if (/missing apply url/.test(text)) return 'Backlog';

  if (p === 'A') {
    if (type === 'freelance_gig') return 'Fast Cash';
    if (type === 'career_job') return 'Strategic Career';
    return 'High Value';
  }

  if (p === 'B') {
    if (/elevenlabs|linjer|creative producer|strategist/.test(text)) return 'Strategic Career';
    if (score >= 78) return 'High Value';
    return 'Backlog';
  }

  if (p === 'C') {
    if (/upwork|contra/.test(text) && type === 'freelance_gig' && score >= 72) return 'Fast Cash';
    return 'Backlog';
  }

  return 'Backlog';
}

function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function followUpInfo(row, type, statusObj) {
  const status = clean(statusObj?.status || row.status || 'Not started');
  const updated = statusObj?.updated ? new Date(statusObj.updated) : new Date();
  const company = clean(row.company || 'there');
  const role = clean(row.role || 'the role');

  if (!/applied|waiting reply/i.test(status)) {
    return {
      needed: false,
      dueDate: '',
      minutes: 0,
      tone: 'No follow-up needed yet.',
      message: '',
    };
  }

  const due = addDays(updated, type === 'freelance_gig' ? 2 : 5);

  const message = type === 'freelance_gig'
    ? `Hi ${company} team,

I hope you are well. I wanted to quickly follow up on my proposal for ${role}. I am still interested and would be happy to help with a clear first milestone so you can review direction before committing to the full scope.

Best,
Asad`
    : `Dear ${company} team,

I hope you are well. I wanted to politely follow up on my application for ${role}. I remain very interested in the opportunity and would be glad to share any additional portfolio examples or details that may help with your review.

Warm regards,
Asad Raza`;

  return {
    needed: true,
    dueDate: dateOnly(due),
    minutes: 6,
    tone: type === 'freelance_gig'
      ? 'Short, confident, useful. Offer a clear first milestone. Do not sound needy.'
      : 'Polite, calm, professional. One follow-up only unless they respond.',
    message,
  };
}

const queue = readJson(queuePath, { rows: [] });
const statuses = readJson(statusPath, {});

const rows = (queue.rows || []).map((row) => {
  const key = keyFor(row);
  const statusObj = statuses[key] || {};
  const type = workType(row);
  const minutes = estimatedApplyMinutes(row, type);
  const offer = recommendedOffer(row, type);
  const score = moneyScore(row, type, minutes);

  return {
    key,
    priority: row.priority,
    rank: row.rank,
    company: row.company,
    role: row.role,
    fitScore: row.score,
    payTarget: row.payTarget,
    workType: type,
    workTypeLabel: workTypeLabel(type),
    moneyLane: moneyLane(row, type, score),
    moneyScore: score,
    cashSpeed: cashSpeed(type, row),
    closeProbability: closeProbability(row, type),
    estimatedApplyMinutes: minutes,
    estimatedFollowUpMinutes: 6,
    recommendedOffer: offer,
    quoteStrategy: quoteStrategy(row, type, offer),
    followUp: followUpInfo(row, type, statusObj),
  };
}).sort((a, b) => {
  const order = { 'Fast Cash': 0, 'High Value': 1, 'Strategic Career': 2, 'Backlog': 3 };
  return (order[a.moneyLane] ?? 9) - (order[b.moneyLane] ?? 9)
    || b.moneyScore - a.moneyScore;
});

const summary = {
  generated: new Date().toISOString(),
  source: queuePath,
  rows: rows.length,
  lanes: {
    fastCash: rows.filter(r => r.moneyLane === 'Fast Cash').length,
    highValue: rows.filter(r => r.moneyLane === 'High Value').length,
    strategicCareer: rows.filter(r => r.moneyLane === 'Strategic Career').length,
    backlog: rows.filter(r => r.moneyLane === 'Backlog').length,
  },
};

const md = [
  '# WorkOps Money Plan',
  '',
  `Generated: ${summary.generated}`,
  '',
  '## Today Money Lanes',
  '',
  `- Fast Cash: ${summary.lanes.fastCash}`,
  `- High Value: ${summary.lanes.highValue}`,
  `- Strategic Career: ${summary.lanes.strategicCareer}`,
  `- Backlog: ${summary.lanes.backlog}`,
  '',
  '| Lane | Priority | Company | Role | Money | Type | Cash Speed | Apply Time | Offer |',
  '|---|---|---|---|---:|---|---|---:|---|',
];

for (const row of rows) {
  md.push(`| ${row.moneyLane} | ${row.priority} | ${row.company} | ${row.role} | ${row.moneyScore} | ${row.workTypeLabel} | ${row.cashSpeed} | ${row.estimatedApplyMinutes} min | ${row.recommendedOffer} |`);
}

writeFileSync(outJson, JSON.stringify({ ...summary, rows }, null, 2) + '\n', 'utf8');
writeFileSync(outMd, md.join('\n'), 'utf8');

console.log(`Money plan rows: ${rows.length}`);
console.log(`Fast Cash: ${summary.lanes.fastCash}`);
console.log(`High Value: ${summary.lanes.highValue}`);
console.log(`Strategic Career: ${summary.lanes.strategicCareer}`);
console.log(`Backlog: ${summary.lanes.backlog}`);
console.log(`Saved: ${outJson}`);
console.log(`Saved: ${outMd}`);