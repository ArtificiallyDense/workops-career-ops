#!/usr/bin/env node

import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] || fallback;
}

const top = Number(argValue('--top', '30'));
const model = argValue('--model', 'gemini-3-pro-thinking');

const apiKey =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  '';

const runsRoot = 'D:/WorkOps/runs/babar-hospitality-global';
const polishedPath = join(runsRoot, 'babar-leads-polished.json');
const reviewedPath = join(runsRoot, 'babar-ai-reviewed.json');
const reviewMdPath = join(runsRoot, 'babar-ai-review.md');

if (!apiKey) {
  console.error('Missing GEMINI_API_KEY / GOOGLE_API_KEY in .env');
  process.exit(1);
}

if (!existsSync(polishedPath)) {
  console.error('Missing polished leads. Run: npm run workops:babar-polish -- --max-rows 30');
  process.exit(1);
}

function safe(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/â€“|â€”/g, '-')
    .replace(/MeliÃ¡/g, 'Meliá')
    .replace(/\s+/g, ' ')
    .trim();
}

function md(value) {
  return safe(value).replaceAll('|', '\\|');
}

function priorityRank(p) {
  if (p === 'A') return 1;
  if (p === 'B') return 2;
  if (p === 'C') return 3;
  return 4;
}

function stripJson(text) {
  const raw = String(text || '').trim();

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');

  if (first !== -1 && last !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.15,
      topP: 0.9
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}:\n${text}`);
  }

  const data = JSON.parse(text);
  const output = (data.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();

  if (!output) {
    throw new Error('Gemini returned empty output.');
  }

  return output;
}

const source = JSON.parse(readFileSync(polishedPath, 'utf8'));
const jobs = (source.queue || [])
  .filter((job) => ['A', 'B', 'C'].includes(job.priority))
  .sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.polishedScore || b.score || 0) - Number(a.polishedScore || a.score || 0)
  )
  .slice(0, top)
  .map((job, idx) => ({
    idx,
    currentPriority: job.priority,
    company: safe(job.company),
    title: safe(job.title),
    location: safe(job.location),
    sourceQuality: safe(job.sourceQuality),
    visaRisk: safe(job.visaRisk),
    regionType: safe(job.regionType),
    score: Number(job.polishedScore || job.score || 0),
    roleTier: safe(job.roleTier),
    payEstimate: safe(job.payEstimate),
    proofAngle: safe(job.proofAngle),
    qualityFlags: job.qualityFlags || [],
    applyUrl: safe(job.applyUrl),
    reasons: job.reasons || [],
    description: safe(job.description).slice(0, 900)
  }));

if (!jobs.length) {
  console.error('No jobs found for AI review.');
  process.exit(1);
}

const prompt = `You are a senior international hospitality recruitment analyst.

Candidate:
Babar Aslam Abbasi.
Senior Hospitality Operations and F&B Management professional with 20+ years across UAE, Saudi Arabia, and Pakistan.
Strengths: restaurant operations, F&B operations, hotel/resort operations, pre-opening, procurement, cost control, multi-unit operations, kitchen workflow, stock control, internal audit, staff training, turnaround management.
Strong proof:
- Burgerizzer Riyadh: opened 12 branches; reduced kitchen cooking time from 20 minutes to 7 minutes.
- Regulus Restaurants UAE: procurement/admin/HR/pre-opening support.
- Food Fund International / The Meat Co Dubai: premium restaurant operations, stock control, internal audit, brand openings.
- Shangrila / IRIS / Pinnacle: hotel/resort/F&B/property operations.
- Data Sweets & Bakers: turnaround of a loss-making business.

Task:
Review these jobs with strict judgment. Do not be generous.

Reject jobs that are:
- Finance/accounting/CFO/controller roles.
- Sales-only roles.
- Junior restaurant supervisor/assistant roles unless still a realistic stepping stone.
- Chef-only/cook-only/waiter/cashier/barista/front desk/housekeeping roles.
- Suspicious/vague sources that are not worth Babar's time.
- Jobs that require local-only work authorization or impossible visa fit.

Decision rules:
- A = apply first, strong realistic fit, source is acceptable.
- B = verify/apply next, good but needs source or visa checking.
- C = backup only.
- REJECT = remove from final application pack.

Do not give more than 5 A decisions.

For each job, choose the best CV:
- hotel-resort-fnb
- hospitality-operations

Return ONLY valid JSON with this schema:
{
  "reviews": [
    {
      "idx": 0,
      "decision": "APPLY_NOW | VERIFY_FIRST | BACKUP | REJECT",
      "priority": "A | B | C | REJECT",
      "fitScore": 0,
      "cvVersion": "hotel-resort-fnb | hospitality-operations",
      "proofAngle": "short best proof angle",
      "sourceRisk": "low | medium | high",
      "visaRisk": "low | medium | high",
      "reason": "1-2 sentence practical reason",
      "openingAngle": "one tailored opening paragraph angle",
      "redFlags": ["..."]
    }
  ]
}

Jobs:
${JSON.stringify(jobs, null, 2)}
`;

console.log(`Running Babar AI review with model: ${model}`);
console.log(`Jobs sent: ${jobs.length}`);

const aiText = await callGemini(prompt);

let parsed;

try {
  parsed = JSON.parse(stripJson(aiText));
} catch (error) {
  writeFileSync(join(runsRoot, 'babar-ai-review-raw.txt'), aiText, 'utf8');
  throw new Error(`Could not parse Gemini JSON. Raw saved to babar-ai-review-raw.txt\n${error.message}`);
}

const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];

if (!reviews.length) {
  writeFileSync(join(runsRoot, 'babar-ai-review-raw.txt'), aiText, 'utf8');
  throw new Error('Gemini JSON had no reviews array. Raw saved to babar-ai-review-raw.txt');
}

const byIdx = new Map();

for (const review of reviews) {
  byIdx.set(Number(review.idx), review);
}

const originalJobs = (source.queue || [])
  .filter((job) => ['A', 'B', 'C'].includes(job.priority))
  .sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.polishedScore || b.score || 0) - Number(a.polishedScore || a.score || 0)
  )
  .slice(0, top);

const reviewed = [];
const rejected = [];

for (const [idx, job] of originalJobs.entries()) {
  const review = byIdx.get(idx);

  if (!review) {
    rejected.push({
      ...job,
      aiDecision: 'REJECT',
      aiReason: 'No AI review returned for this row.'
    });
    continue;
  }

  const aiPriority = ['A', 'B', 'C'].includes(review.priority) ? review.priority : 'REJECT';

  const merged = {
    ...job,
    originalPriority: job.priority,
    priority: aiPriority,
    aiDecision: safe(review.decision),
    aiFitScore: Number(review.fitScore || 0),
    aiCvVersion: safe(review.cvVersion),
    aiSourceRisk: safe(review.sourceRisk),
    aiVisaRisk: safe(review.visaRisk),
    aiReason: safe(review.reason),
    aiOpeningAngle: safe(review.openingAngle),
    aiRedFlags: Array.isArray(review.redFlags) ? review.redFlags.map(safe) : [],
    proofAngle: safe(review.proofAngle) || job.proofAngle
  };

  if (aiPriority === 'REJECT') {
    rejected.push(merged);
  } else {
    reviewed.push(merged);
  }
}

// Enforce max 5 A-list after AI review.
let aCount = 0;
const finalQueue = reviewed
  .sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.aiFitScore || 0) - Number(a.aiFitScore || 0) ||
    Number(b.polishedScore || b.score || 0) - Number(a.polishedScore || a.score || 0)
  )
  .map((job) => {
    if (job.priority !== 'A') return job;

    aCount += 1;

    if (aCount > 5) {
      return {
        ...job,
        priority: 'B',
        aiDecision: 'VERIFY_FIRST',
        aiReason: `${job.aiReason} Demoted because A-list is capped at 5.`
      };
    }

    return job;
  })
  .sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.aiFitScore || 0) - Number(a.aiFitScore || 0) ||
    Number(b.polishedScore || b.score || 0) - Number(a.polishedScore || a.score || 0)
  );

const counts = {
  total: finalQueue.length,
  a: finalQueue.filter((j) => j.priority === 'A').length,
  b: finalQueue.filter((j) => j.priority === 'B').length,
  c: finalQueue.filter((j) => j.priority === 'C').length,
  rejected: rejected.length
};

const result = {
  generated: new Date().toISOString(),
  model,
  source: polishedPath,
  counts,
  queue: finalQueue,
  rejected
};

writeFileSync(reviewedPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

const mdLines = [
  '# Babar AI Review',
  '',
  `Generated: ${result.generated}`,
  `Model: ${model}`,
  '',
  '## Summary',
  '',
  `- Final rows: ${counts.total}`,
  `- A-list: ${counts.a}`,
  `- B-list: ${counts.b}`,
  `- C-list: ${counts.c}`,
  `- Rejected: ${counts.rejected}`,
  '',
  '## Final Queue',
  '',
  '| Rank | Priority | AI Score | Company | Role | CV | Source Risk | Visa Risk | Reason |',
  '|---:|---|---:|---|---|---|---|---|---|',
  ...finalQueue.map((job, index) =>
    `| ${index + 1} | ${job.priority} | ${job.aiFitScore || ''} | ${md(job.company)} | ${md(job.title)} | ${md(job.aiCvVersion)} | ${md(job.aiSourceRisk)} | ${md(job.aiVisaRisk)} | ${md(job.aiReason)} |`
  ),
  '',
  '## Rejected / Removed',
  '',
  ...(rejected.length
    ? rejected.map((job) => `- **${md(job.company)} — ${md(job.title)}:** ${md(job.aiReason || 'Rejected by AI review')}`)
    : ['- None'])
];

writeFileSync(reviewMdPath, mdLines.join('\n'), 'utf8');

console.log('');
console.log(`Saved: ${reviewedPath}`);
console.log(`Saved: ${reviewMdPath}`);
console.log(`Final rows: ${counts.total} | A: ${counts.a} | B: ${counts.b} | C: ${counts.c} | Rejected: ${counts.rejected}`);
