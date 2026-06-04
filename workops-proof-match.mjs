#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const RUNS_DIR = 'D:\\WorkOps\\runs';
const DATA_DIR = join(RUNS_DIR, 'data');

const queuePath = join(RUNS_DIR, 'today-apply-queue.json');
const moneyPath = join(RUNS_DIR, 'money-plan.json');
const proofPath = join(DATA_DIR, 'proof-library', 'proof-library.json');

const outJson = join(RUNS_DIR, 'proof-match.json');
const outMd = join(RUNS_DIR, 'proof-match.md');

const fallbackProofs = [
  {
    id: 'world-of-sports',
    name: 'World of Sports',
    url: 'https://www.behance.net/asad_raza',
    tags: ['thumbnail', 'sports', 'content packaging', 'social media', 'youtube', 'visual hierarchy'],
    why: 'Shows punchy layout, hierarchy, and content-first design.'
  },
  {
    id: 'space-cats',
    name: 'Space Cats',
    url: 'https://www.behance.net/asad_raza',
    tags: ['motion', 'social', 'youtube', 'playful campaign', 'content packaging'],
    why: 'Shows creative range and scroll-stopping visuals.'
  },
  {
    id: 'farida-waller',
    name: 'Farida Waller',
    url: 'https://www.behance.net/asad_raza',
    tags: ['fashion', 'luxury', 'ecommerce', 'product visuals', 'premium brand', 'lifestyle', 'beauty'],
    why: 'Shows premium product direction and ecommerce-ready presentation.'
  },
  {
    id: 'zaha-vintage',
    name: 'Zaha Vintage / Vintage Visuals',
    url: 'https://www.behance.net/asad_raza',
    tags: ['fashion', 'vintage', 'ecommerce', 'social media', 'brand direction', 'resale'],
    why: 'Shows practical fashion/resale brand-building sense.'
  },
  {
    id: 'ifma-mtg-wmc',
    name: 'IFMA / MTG Fight Gear / World Muaythai Council',
    url: 'https://www.behance.net/asad_raza',
    tags: ['sports', 'apparel', 'gear', 'event design', 'production-ready', 'international'],
    why: 'Shows real-world production ability and sports industry experience.'
  },
  {
    id: 'rxstat-pulse',
    name: 'RxStat Pharmacy / Active by Pulse',
    url: 'https://www.behance.net/asad_raza',
    tags: ['logo', 'brand identity', 'brand guide', 'clean systems', 'usable deliverables'],
    why: 'Shows clear usable brand systems beyond a logo mark.'
  },
  {
    id: 'ai-workflows',
    name: 'AI Creative Workflows',
    url: 'https://www.behance.net/asad_raza',
    tags: ['ai', 'comfyui', 'midjourney', 'automation', 'creative production', 'workflow'],
    why: 'Shows modern AI-assisted production and faster creative iteration.'
  }
];

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

function normalizedProofs(raw) {
  const source = Array.isArray(raw?.proofs) && raw.proofs.length ? raw.proofs : fallbackProofs;

  return source.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url || 'https://www.behance.net/asad_raza',
    tags: p.tags || p.best_for || [],
    why: p.why || p.why_it_works || p.use_when || '',
  }));
}

function textFor(row, money) {
  return [
    row.company,
    row.role,
    row.roleClass,
    row.humanSignal,
    row.personalizationAngle,
    row.suggestedProof,
    row.submissionStyle,
    row.linkRisk,
    money?.recommendedOffer,
    money?.quoteStrategy,
    money?.moneyLane,
    money?.workTypeLabel
  ].join(' ').toLowerCase();
}

function scoreProof(row, money, proof) {
  const text = textFor(row, money);
  const tags = proof.tags.join(' ').toLowerCase();
  let score = 0;
  const matched = [];

  for (const term of proof.tags) {
    const t = clean(term).toLowerCase();
    if (t && text.includes(t)) {
      score += 14;
      matched.push(term);
    }
  }

  const rules = [
    [/sweet fish|thumbnail|youtube|content packaging|brand builder/, /thumbnail|content packaging|youtube|social media/, 55],
    [/logo|brand style|brand guide|identity|brand designer/, /logo|brand identity|brand guide|clean systems/, 55],
    [/linjer|tarte|parachute|fashion|beauty|cosmetic|ecommerce|product|premium|lifestyle/, /fashion|luxury|ecommerce|product|premium|beauty/, 45],
    [/sports|apparel|gear|muaythai|event|worksheet/, /sports|apparel|gear|event|production-ready/, 35],
    [/ai|automation|generative|workflow|elevenlabs|mindrift/, /ai|automation|workflow|creative production/, 45],
    [/canva|social|paid media|digital social|content creator|instagram|tiktok/, /social media|content packaging|ecommerce|playful campaign/, 35],
    [/vintage|resale|fable england/, /vintage|fashion|resale|brand direction/, 35]
  ];

  for (const [need, has, points] of rules) {
    if (need.test(text) && has.test(tags)) score += points;
  }

  return { ...proof, matchScore: score, matched_terms: matched };
}

function readiness(row, money, proofs) {
  let score = 45;
  const missing = [];

  if (row.humanSignal) score += 10;
  else missing.push('specific human signal');

  if (proofs.length) score += 25;
  else missing.push('matched portfolio proof');

  if (money?.quoteStrategy) score += 10;
  else missing.push('quote strategy');

  if (row.applyUrl) score += 10;
  else missing.push('apply URL');

  if (/missing apply url/i.test(row.linkRisk || '')) score -= 25;
  if (/gated|login/i.test(row.linkRisk || '')) score -= 8;
  if ((row.priority || '') === 'A') score += 5;

  const readyScore = Math.max(0, Math.min(100, score));

  return {
    readyScore,
    missing,
    readyLabel: readyScore >= 85 ? 'Ready' : readyScore >= 70 ? 'Almost Ready' : 'Needs Prep'
  };
}

function openingLine(row, proofs) {
  const company = clean(row.company || 'your team');
  const role = clean(row.role || 'this role');
  const proof = proofs[0]?.name || 'my portfolio';

  if (/upwork|marketplace/i.test(row.linkRisk || row.applyUrl || '')) {
    return `I can help with ${role} by starting with a clear first milestone, using relevant proof from ${proof}.`;
  }

  return `I am interested in ${role} at ${company} because it connects directly with the kind of visual systems I have built in ${proof}.`;
}

function customizeMinutes(row, money) {
  const base = money?.estimatedApplyMinutes || 25;
  const proofPenalty = row.applyUrl ? 0 : 8;
  return Math.max(8, Math.round(base + proofPenalty));
}

const queue = readJson(queuePath, { rows: [] });
const money = readJson(moneyPath, { rows: [] });
const proofLib = readJson(proofPath, { proofs: fallbackProofs });
const proofs = normalizedProofs(proofLib);

const moneyMap = new Map((money.rows || []).map((row) => [keyFor(row), row]));

const rows = (queue.rows || []).map((row) => {
  const key = keyFor(row);
  const moneyRow = moneyMap.get(key) || null;

  const rankedProofs = proofs
    .map((proof) => scoreProof(row, moneyRow, proof))
    .filter((proof) => proof.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);

  const ready = readiness(row, moneyRow, rankedProofs);

  return {
    key,
    priority: row.priority,
    rank: row.rank,
    company: row.company,
    role: row.role,
    matchedProofs: rankedProofs,
    recommendedProofNames: rankedProofs.map((p) => p.name),
    openingLine: openingLine(row, rankedProofs),
    customizeMinutes: customizeMinutes(row, moneyRow),
    ...ready
  };
});

const md = [
  '# WorkOps Proof Match',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Priority | Company | Role | Ready | Proofs | Opening Line |',
  '|---|---|---|---:|---|---|'
];

for (const row of rows) {
  md.push(`| ${row.priority || ''} | ${row.company || ''} | ${row.role || ''} | ${row.readyScore} | ${row.recommendedProofNames.join(', ')} | ${row.openingLine} |`);
}

writeFileSync(outJson, JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2) + '\n', 'utf8');
writeFileSync(outMd, md.join('\n'), 'utf8');

console.log(`Proof matches: ${rows.length}`);
console.log(`Rows with proofs: ${rows.filter(r => r.recommendedProofNames.length).length}`);
console.log(`Saved: ${outJson}`);
console.log(`Saved: ${outMd}`);