#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const root = 'D:/WorkOps';
const runsRoot = join(root, 'runs', 'babar-hospitality-global');
const cvRoot = join(root, 'data', 'babar-hospitality-global', 'cv');
const applyRoot = join(runsRoot, 'apply-packs');
const leadsPath = join(runsRoot, 'babar-leads-polished.json');

if (!existsSync(leadsPath)) {
  console.error('Missing polished leads. Run: npm run workops:babar-polish -- --max-rows 35');
  process.exit(1);
}

mkdirSync(applyRoot, { recursive: true });

const data = JSON.parse(readFileSync(leadsPath, 'utf8'));
const queue = data.queue || [];
const aList = queue.filter((job) => job.priority === 'A');

function safe(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/â€“|â€”/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value) {
  return safe(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function md(value) {
  return safe(value).replaceAll('|', '\\|');
}

function cvChoice(job) {
  const text = [job.company, job.title, job.proofAngle].join(' ').toLowerCase();

  if (/director of food|food and beverage director|f&b director|hotel|resort|outlets|hilton|marriott|wyndham/.test(text)) {
    return {
      label: 'Hotel / Resort / F&B CV',
      path: join(cvRoot, 'babar-cv-hotel-resort-fnb.md'),
      file: 'CV-babar-hotel-resort-fnb.md'
    };
  }

  return {
    label: 'Hospitality Operations CV',
    path: join(cvRoot, 'babar-cv-hospitality-operations.md'),
    file: 'CV-babar-hospitality-operations.md'
  };
}

function proofBullets(job) {
  const proof = safe(job.proofAngle).toLowerCase();

  if (/hotel|resort|f&b leadership|outlets/.test(proof)) {
    return [
      'Shangrila Resorts & Hotel: Acting GM / F&B Manager experience covering F&B operations, guest service, staffing, and daily hotel operations.',
      'IRIS Eco Resort and Pinnacle Executive Lodges: resort/property operations, guest satisfaction, maintenance coordination, and team leadership.',
      'Food Fund International / The Meat Co Dubai: premium restaurant operations, stock control, internal audit, and brand-opening exposure.',
      'GCC experience across UAE and Saudi Arabia with multicultural teams and demanding hospitality environments.'
    ];
  }

  if (/multi-unit|burgerizzer|restaurant operations/.test(proof)) {
    return [
      'Burgerizzer Riyadh: opened 12 branches and supported regional operations/development.',
      'Reduced kitchen cooking time from 20 minutes to 7 minutes through workflow improvement.',
      'Regulus Restaurants UAE and Food Fund / Meat Co Dubai: pre-opening, multi-brand restaurant operations, procurement, and BOH systems.',
      '20+ years across hospitality operations, F&B, restaurants, hotels/resorts, procurement, and cost control.'
    ];
  }

  if (/procurement|cost control|inventory|sourcing/.test(proof)) {
    return [
      'Regulus Restaurants UAE: procurement, sourcing, food/equipment purchasing, vendor coordination, inventory, and warehouse support.',
      'Food Fund / Meat Co Dubai: stock control, internal audit, inventory reporting, and operational controls.',
      'Data Sweets & Bakers: operational turnaround using ERP, staff training, process control, and cost/performance improvement.',
      'Hands-on experience across front-of-house, back-of-house, procurement, cost control, and operations.'
    ];
  }

  return [
    'Burgerizzer Riyadh: opened 12 branches and improved kitchen workflow/cooking time.',
    'Regulus / Food Fund UAE: pre-opening, procurement, admin, HR, and multi-brand restaurant operations.',
    'IRIS / Pinnacle / Shangrila: hotel/resort operations, guest experience, revenue, maintenance, and team leadership.',
    'Data Sweets & Bakers: turnaround of a loss-making business into a profitable operation.'
  ];
}

function coverOpening(job) {
  return `Dear Hiring Team,

I am writing to apply for the ${safe(job.title)} role at ${safe(job.company)}. I am a senior hospitality operations and F&B management professional with 20+ years of experience across UAE, Saudi Arabia, and Pakistan, including restaurant operations, hotel/resort operations, pre-opening projects, procurement, cost control, team training, and multi-unit leadership.

For this role, my strongest match is ${safe(job.proofAngle)}. I have opened and supported multiple hospitality operations, including 12 Burgerizzer branches in Riyadh, pre-opening work for restaurant brands in the UAE, and hotel/resort operations experience focused on guest satisfaction, team leadership, operational efficiency, and cost control.

I would welcome the opportunity to discuss how my background can support your operation, team performance, guest experience, and profitability.

Kind regards,
Babar Aslam Abbasi`;
}

function recruiterMessage(job) {
  return `Hello,

I am interested in the ${safe(job.title)} opportunity with ${safe(job.company)}. I have 20+ years of hospitality operations and F&B management experience across UAE, Saudi Arabia, and Pakistan, with strengths in restaurant operations, hotel/resort operations, pre-opening, procurement, cost control, team leadership, and multi-unit operations.

My strongest match for this role is ${safe(job.proofAngle)}. I would be happy to share my CV and discuss whether my background fits the role requirements.

Best regards,
Babar Aslam Abbasi`;
}

function writePack(job, index) {
  const folder = join(applyRoot, `${String(index + 1).padStart(2, '0')}-${slug(job.company)}-${slug(job.title)}`);
  mkdirSync(folder, { recursive: true });

  const cv = cvChoice(job);

  if (existsSync(cv.path)) {
    copyFileSync(cv.path, join(folder, cv.file));
  }

  writeFileSync(join(folder, '01-role-brief.md'), `# Role Brief

## ${safe(job.company)} - ${safe(job.title)}

- Priority: ${job.priority}
- Score: ${job.polishedScore || job.score}
- Source quality: ${safe(job.sourceQuality)}
- Region: ${safe(job.regionType)}
- Visa risk: ${safe(job.visaRisk)}
- Role tier: ${safe(job.roleTier)}
- Pay estimate: ${safe(job.payEstimate)}
- Apply URL: ${safe(job.applyUrl)}

## Why this fits

${safe(job.proofAngle)}

## Quality flags

${(job.qualityFlags || []).length ? job.qualityFlags.map((x) => `- ${safe(x)}`).join('\n') : '- None'}
`, 'utf8');

  writeFileSync(join(folder, '02-cv-to-use.md'), `# CV To Use

Recommended CV: **${cv.label}**

Copied file:

\`${cv.file}\`

Original CV path:

\`${cv.path}\`

## Suggested first proof

${safe(job.proofAngle)}
`, 'utf8');

  writeFileSync(join(folder, '03-cover-note.md'), `# Cover Note

${coverOpening(job)}
`, 'utf8');

  writeFileSync(join(folder, '04-proof-bullets.md'), `# Proof Bullets

Use these bullets in the application form, cover note, or recruiter message:

${proofBullets(job).map((x) => `- ${x}`).join('\n')}
`, 'utf8');

  writeFileSync(join(folder, '05-application-checklist.md'), `# Application Checklist

- [ ] Open role URL
- [ ] Confirm job is still active
- [ ] Confirm source is acceptable: ${safe(job.sourceQuality)}
- [ ] Check whether visa/sponsorship/local availability is mentioned
- [ ] Use recommended CV: ${cv.file}
- [ ] Customize first paragraph using: ${safe(job.proofAngle)}
- [ ] Submit application or save reason
- [ ] Record status manually

## Caution

Visa risk: ${safe(job.visaRisk)}

${job.visaRisk === 'Medium' ? 'Visa/sponsorship is not clearly stated. Do not assume sponsorship; apply professionally and verify during screening.' : 'Check visa/work authorization requirements before applying.'}
`, 'utf8');

  writeFileSync(join(folder, '06-recruiter-message.md'), `# Recruiter / LinkedIn Message

${recruiterMessage(job)}
`, 'utf8');

  return {
    folder,
    company: safe(job.company),
    title: safe(job.title),
    cv: cv.file,
    url: safe(job.applyUrl)
  };
}

const packs = aList.map(writePack);

const indexMd = [
  '# Babar A-List Apply Packs',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '| Rank | Company | Role | CV | Folder | URL |',
  '|---:|---|---|---|---|---|',
  ...packs.map((pack, index) =>
    `| ${index + 1} | ${md(pack.company)} | ${md(pack.title)} | ${md(pack.cv)} | ${md(pack.folder)} | ${md(pack.url)} |`
  )
].join('\n');

writeFileSync(join(applyRoot, 'INDEX.md'), indexMd, 'utf8');

console.log(`Babar apply packs generated: ${packs.length}`);
console.log(`Saved: ${join(applyRoot, 'INDEX.md')}`);

for (const pack of packs) {
  console.log(`- ${pack.company} — ${pack.title}`);
}
