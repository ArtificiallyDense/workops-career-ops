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
  const title = safe(job.title).toLowerCase();

  if (/hotel|resort|f&b leadership|outlets|food and beverage/.test(proof) || /director of food|food and beverage director|outlets manager/.test(title)) {
    return [
      'Shangrila Resorts & Hotel: Acting GM / F&B Manager experience across F&B operations, guest service, staffing, daily hotel operations, and service quality.',
      'IRIS Eco Resort and Pinnacle Executive Lodges: resort/property operations, guest satisfaction, maintenance coordination, staff supervision, and operational efficiency.',
      'Food Fund International / The Meat Co Dubai: premium restaurant operations, stock control, internal audit, inventory reporting, and brand-opening exposure.',
      'Regulus Restaurants UAE: procurement, sourcing, vendor coordination, inventory reporting, warehouse support, and cost-control processes.',
      'Burgerizzer Riyadh: supported multi-branch restaurant operations and improved kitchen workflow/cooking time.',
      '20+ years across hospitality operations, F&B, restaurants, hotels/resorts, procurement, cost control, and team leadership.'
    ];
  }

  if (/multi-unit|burgerizzer|restaurant operations|cluster/.test(proof) || /cluster|restaurant managers|restaurant manager/.test(title)) {
    return [
      'Burgerizzer Riyadh: supported regional operations and development, including the opening of 12 branches.',
      'Improved kitchen workflow and reduced cooking time from 20 minutes to 7 minutes through operational process improvement.',
      'Regulus Restaurants UAE: procurement, admin, HR support, vendor coordination, inventory, warehouse, and pre-opening support.',
      'Food Fund International / The Meat Co Dubai: stock control, internal audit, BOH systems, and opening support for multiple restaurant brands.',
      'Experience managing multicultural teams, daily service standards, operational readiness, cost awareness, and branch-level performance.',
      '20+ years across restaurant operations, F&B, hotel/resort operations, procurement, inventory, and cost control.'
    ];
  }

  if (/procurement|cost control|inventory|sourcing/.test(proof) || /procurement|supply chain|inventory|cost control/.test(title)) {
    return [
      'Regulus Restaurants UAE: procurement, sourcing, food/equipment purchasing, vendor coordination, inventory, and warehouse support.',
      'Food Fund / The Meat Co Dubai: stock control, internal audit, inventory reporting, and operational controls.',
      'Data Sweets & Bakers: operational turnaround using ERP, staff training, process control, recipe improvements, and cost/performance improvement.',
      'Practical experience across front-of-house, back-of-house, purchasing, inventory, reporting, and operations.',
      'GCC hospitality experience across UAE and Saudi Arabia with demanding restaurant and F&B environments.'
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
  const title = safe(job.title);
  const company = safe(job.company);
  const proof = safe(job.proofAngle);
  const lowerTitle = title.toLowerCase();

  if (/director of food|food and beverage director|outlets manager|hotel|resort|f&b/.test(lowerTitle)) {
    return `Dear Hiring Team,

I am applying for the ${title} role at ${company}. I am a senior hospitality operations and F&B management professional with 20+ years of experience across UAE, Saudi Arabia, and Pakistan, with a practical background in hotel/resort operations, F&B leadership, restaurant operations, procurement, cost control, guest experience, and team supervision.

For this role, my strongest match is ${proof}. I have held hotel/resort and F&B management responsibilities, supported premium restaurant operations in Dubai, worked across stock control and internal audit, and contributed to pre-opening and operational setup for multiple restaurant brands in the UAE.

I would bring hands-on operational discipline, service-quality focus, cost awareness, team leadership, and GCC hospitality experience to your F&B operation.

Kind regards,
Babar Aslam Abbasi`;
  }

  if (/cluster|restaurant manager|restaurant managers|general manager/.test(lowerTitle)) {
    return `Dear Hiring Team,

I am applying for the ${title} role with ${company}. My background is strongest in multi-unit restaurant operations, pre-opening execution, team development, cost control, and practical restaurant systems across Saudi Arabia, UAE, and Pakistan.

In Riyadh, I supported regional operations and development for Burgerizzer, including the opening of 12 branches and workflow improvements that reduced kitchen cooking time from 20 minutes to 7 minutes. In the UAE, I worked across procurement, administration, HR support, stock control, internal audit, and pre-opening operations with Regulus Restaurants and Food Fund International / The Meat Co.

For this role, I would bring hands-on experience in branch readiness, service standards, BOH/FOH coordination, staff training, vendor coordination, cost control, and day-to-day operational discipline.

Kind regards,
Babar Aslam Abbasi`;
  }

  return `Dear Hiring Team,

I am writing to apply for the ${title} role at ${company}. I am a senior hospitality operations and F&B management professional with 20+ years of experience across UAE, Saudi Arabia, and Pakistan, including restaurant operations, hotel/resort operations, pre-opening projects, procurement, cost control, team training, and multi-unit leadership.

For this role, my strongest match is ${proof}. I would welcome the opportunity to discuss how my background can support your operation, team performance, guest experience, and profitability.

Kind regards,
Babar Aslam Abbasi`;
}

function recruiterMessage(job) {
  return `Hello,

I am interested in the ${safe(job.title)} opportunity with ${safe(job.company)}. I have 20+ years of hospitality operations and F&B management experience across UAE, Saudi Arabia, and Pakistan, including restaurant operations, hotel/resort operations, pre-opening, procurement, cost control, team leadership, and multi-unit operations.

My strongest match for this role is ${safe(job.proofAngle)}. I would be happy to share my CV and discuss whether my background fits the role requirements.

Best regards,
Babar Aslam Abbasi`;
}

function shortFormAnswers(job) {
  return `# Short Form Answers

## Why are you a good fit for this role?

I have 20+ years of hospitality operations and F&B management experience across UAE, Saudi Arabia, and Pakistan. My background includes restaurant operations, hotel/resort operations, pre-opening projects, procurement, cost control, team training, stock control, internal audit, and multi-unit operations. For this role, my strongest match is ${safe(job.proofAngle)}.

## Most relevant achievements

- Supported opening of 12 Burgerizzer branches in Riyadh.
- Improved kitchen workflow and reduced cooking time from 20 minutes to 7 minutes.
- Supported pre-opening and operational setup for restaurant brands in the UAE.
- Worked across procurement, stock control, internal audit, inventory, warehouse, and operational reporting.
- Managed hotel/resort and F&B operations with focus on guest satisfaction, team leadership, service standards, and operational efficiency.

## Salary expectation

Open to a fair market package based on role scope, country, visa support, accommodation/benefits, and total responsibility. Current estimate for this role: ${safe(job.payEstimate)}.

## Visa / relocation

Open to relocation for the right international hospitality opportunity. Visa sponsorship or company visa support can be discussed during the process.

## 500-character summary

Senior hospitality operations and F&B management professional with 20+ years across UAE, Saudi Arabia, and Pakistan. Experience includes multi-unit restaurant operations, hotel/resort operations, pre-opening, procurement, cost control, team leadership, stock control, internal audit, and operational turnaround.
`;
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

  writeFileSync(join(folder, '07-short-form-answers.md'), shortFormAnswers(job), 'utf8');

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
