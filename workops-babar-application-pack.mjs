#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, renameSync } from 'fs';
import { join, basename, dirname } from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] || fallback;
}

const top = Number(argValue('--top', '30'));
const packName = argValue('--name', new Date().toISOString().slice(0, 10));

const root = 'D:/WorkOps';
const runsRoot = join(root, 'runs', 'babar-hospitality-global');
const cvRoot = join(root, 'data', 'babar-hospitality-global', 'cv');
const packageRoot = join(runsRoot, 'application-packs', packName);
const polishedPath = join(runsRoot, 'babar-leads-polished.json');
const aiReviewedPath = join(runsRoot, 'babar-ai-reviewed.json');
const leadsPath = existsSync(aiReviewedPath) ? aiReviewedPath : polishedPath;

if (!existsSync(leadsPath)) {
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

function slug(value) {
  return safe(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function shortSlug(value, max = 36) {
  return safe(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function html(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function priorityRank(p) {
  if (p === 'A') return 1;
  if (p === 'B') return 2;
  if (p === 'C') return 3;
  return 4;
}

function browserPath() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];

  return candidates.find(existsSync);
}

function fileUrl(path) {
  return 'file:///' + path.replaceAll('\\', '/').replaceAll(' ', '%20');
}

function exportPdf(htmlPath, pdfPath) {
  const browser = browserPath();

  if (!browser) {
    console.warn('PDF skipped - could not find Microsoft Edge or Chrome:', pdfPath);
    return false;
  }

  const result = spawnSync(browser, [
    '--headless',
    '--disable-gpu',
    `--print-to-pdf=${pdfPath}`,
    fileUrl(htmlPath)
  ], {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.status !== 0 || !existsSync(pdfPath)) {
    console.warn('PDF skipped - export failed:', pdfPath);
    console.warn(result.stderr || result.stdout || 'No browser output.');
    return false;
  }

  return true;
}

function simpleHtml(title, body) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${html(title)}</title>
<style>
@page { size: A4; margin: 13mm; }
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #171512;
  background: #eee9df;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10.5pt;
  line-height: 1.45;
}
.page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: white;
  padding: 13mm;
}
h1 {
  margin: 0 0 10px;
  font-size: 22pt;
  letter-spacing: -0.04em;
}
h2 {
  margin: 16px 0 7px;
  padding-top: 8px;
  border-top: 1px solid #ded8ce;
  font-size: 12pt;
  color: #594633;
}
p { margin: 0 0 8px; }
ul { margin: 0 0 8px 18px; padding: 0; }
li { margin: 0 0 4px; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th, td { border: 1px solid #ddd7ce; padding: 6px; text-align: left; vertical-align: top; }
th { background: #f3efe7; }
.small { color: #666; font-size: 9pt; }
@media print {
  body { background: white; }
  .page { width: auto; min-height: auto; margin: 0; padding: 0; }
}
</style>
</head>
<body>
<main class="page">
${body}
</main>
</body>
</html>`;
}

function textToHtml(title, text) {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

      if (lines.every((x) => x.startsWith('- '))) {
        return `<ul>${lines.map((x) => `<li>${html(x.slice(2))}</li>`).join('')}</ul>`;
      }

      return `<p>${lines.map(html).join('<br>')}</p>`;
    })
    .join('\n');

  return simpleHtml(title, `<h1>${html(title)}</h1>${paragraphs}`);
}

function markdownCvToHtml(md, title) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;

  function closeList() {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line === '---') {
      closeList();
      out.push('<hr>');
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      out.push(`<h1>${html(line.slice(2)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h1>`);
      continue;
    }

    if (line.startsWith('## ')) {
      closeList();
      out.push(`<h2>${html(line.slice(3)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h2>`);
      continue;
    }

    if (line.startsWith('### ')) {
      closeList();
      out.push(`<h2>${html(line.slice(4)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h2>`);
      continue;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${html(line.slice(2)).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${html(line).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`);
  }

  closeList();

  return simpleHtml(title, out.join('\n'));
}

function zipFolder(sourceDir, outFile) {
  const zipTemp = `${outFile}.ziptemp.zip`;
  rmSync(zipTemp, { force: true });
  rmSync(outFile, { force: true });

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${zipTemp}" -Force`
  ], {
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.status !== 0 || !existsSync(zipTemp)) {
    throw new Error(`Zip failed: ${outFile}\n${result.stderr || result.stdout}`);
  }

  renameSync(zipTemp, outFile);
}

function makeDocx(outPath, title, bodyText) {
  const temp = `${outPath}.tmp`;
  rmSync(temp, { recursive: true, force: true });
  ensureDir(join(temp, '_rels'));
  ensureDir(join(temp, 'word'));
  ensureDir(join(temp, 'word', '_rels'));

  const paragraphs = [
    { text: title, heading: true },
    ...String(bodyText).split(/\r?\n/).map((line) => ({ text: line, heading: false }))
  ];

  const body = paragraphs.map((p) => {
    if (!p.text.trim()) return '<w:p/>';

    const style = p.heading ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : '';
    const bold = p.heading ? '<w:rPr><w:b/></w:rPr>' : '';

    return `<w:p>${style}<w:r>${bold}<w:t xml:space="preserve">${xml(p.text)}</w:t></w:r></w:p>`;
  }).join('\n');

  writeFileSync(join(temp, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, 'utf8');

  writeFileSync(join(temp, '_rels', '.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf8');

  writeFileSync(join(temp, 'word', 'document.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
</w:body>
</w:document>`, 'utf8');

  zipFolder(temp, outPath);
  rmSync(temp, { recursive: true, force: true });
}

function colName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function makeXlsx(outPath, rows) {
  const temp = `${outPath}.tmp`;
  rmSync(temp, { recursive: true, force: true });
  ensureDir(join(temp, '_rels'));
  ensureDir(join(temp, 'xl', '_rels'));
  ensureDir(join(temp, 'xl', 'worksheets'));

  const sheetRows = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = `${colName(c + 1)}${r + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
    }).join('');

    return `<row r="${r + 1}">${cells}</row>`;
  }).join('\n');

  writeFileSync(join(temp, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`, 'utf8');

  writeFileSync(join(temp, '_rels', '.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`, 'utf8');

  writeFileSync(join(temp, 'xl', 'workbook.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Apply Tracker" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, 'utf8');

  writeFileSync(join(temp, 'xl', '_rels', 'workbook.xml.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`, 'utf8');

  writeFileSync(join(temp, 'xl', 'worksheets', 'sheet1.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${sheetRows}</sheetData>
</worksheet>`, 'utf8');

  zipFolder(temp, outPath);
  rmSync(temp, { recursive: true, force: true });
}

function pdfAudit(pdfPath) {
  if (!existsSync(pdfPath)) return { verdict: 'FAIL', score: 0, notes: 'PDF missing.' };

  const bytes = readFileSync(pdfPath);
  const text = bytes.toString('latin1');
  const pages = Math.max(1, (text.match(/\/Type\s*\/Page\b/g) || []).length);
  const kb = Math.round(bytes.length / 1024);
  let score = 100;
  const notes = [];

  if (pages > 4) {
    score -= 25;
    notes.push(`Long CV: ${pages} pages.`);
  } else {
    notes.push(`Pages OK: ${pages}.`);
  }

  if (kb < 40) {
    score -= 15;
    notes.push(`Small PDF: ${kb} KB.`);
  } else {
    notes.push(`Size OK: ${kb} KB.`);
  }

  if (!text.includes('/Font')) {
    score -= 15;
    notes.push('Fonts not clearly detected.');
  } else {
    notes.push('Fonts detected.');
  }

  return {
    verdict: score >= 80 ? 'GOOD' : score >= 60 ? 'CHECK' : 'FIX',
    score,
    notes: notes.join(' ')
  };
}

function cvChoice(job) {
  const text = [job.company, job.title, job.proofAngle].join(' ').toLowerCase();

  if (/director of food|food and beverage director|f&b director|hotel|resort|outlets|hilton|marriott|wyndham|jumeirah|meli/.test(text)) {
    return {
      label: 'Hotel / Resort / F&B CV',
      md: join(cvRoot, 'babar-cv-hotel-resort-fnb.md'),
      html: join(packageRoot, '99_MASTER_FILES', 'babar-cv-hotel-resort-fnb.html'),
      pdf: join(packageRoot, '99_MASTER_FILES', 'Babar_Aslam_Abbasi_Hotel_Resort_FNB_CV.pdf'),
      pdfName: 'Babar_Aslam_Abbasi_Hotel_Resort_FNB_CV.pdf'
    };
  }

  return {
    label: 'Hospitality Operations CV',
    md: join(cvRoot, 'babar-cv-hospitality-operations.md'),
    html: join(packageRoot, '99_MASTER_FILES', 'babar-cv-hospitality-operations.html'),
    pdf: join(packageRoot, '99_MASTER_FILES', 'Babar_Aslam_Abbasi_Hospitality_Operations_CV.pdf'),
    pdfName: 'Babar_Aslam_Abbasi_Hospitality_Operations_CV.pdf'
  };
}

function createCv(cv) {
  if (!existsSync(cv.md)) throw new Error(`Missing CV markdown: ${cv.md}`);

  const md = readFileSync(cv.md, 'utf8');
  const htmlCv = markdownCvToHtml(md, cv.label);
  writeFileSync(cv.html, htmlCv, 'utf8');
  exportPdf(cv.html, cv.pdf);
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
      'Burgerizzer Riyadh: supported multi-branch restaurant operations and improved kitchen workflow/cooking time.'
    ];
  }

  return [
    'Burgerizzer Riyadh: supported regional operations and development, including the opening of 12 branches.',
    'Improved kitchen workflow and reduced cooking time from 20 minutes to 7 minutes through operational process improvement.',
    'Regulus Restaurants UAE: procurement, admin, HR support, vendor coordination, inventory, warehouse, and pre-opening support.',
    'Food Fund International / The Meat Co Dubai: stock control, internal audit, BOH systems, and opening support for multiple restaurant brands.',
    'Experience managing multicultural teams, daily service standards, operational readiness, cost awareness, and branch-level performance.'
  ];
}

function coverNote(job) {
  const title = safe(job.title);
  const company = safe(job.company);
  const proof = safe(job.proofAngle);
  const lower = title.toLowerCase();

  if (/director of food|food and beverage director|outlets manager|hotel|resort|f&b/.test(lower)) {
    return `Dear Hiring Team,

I am applying for the ${title} role at ${company}. I am a senior hospitality operations and F&B management professional with 20+ years of experience across UAE, Saudi Arabia, and Pakistan, with a practical background in hotel/resort operations, F&B leadership, restaurant operations, procurement, cost control, guest experience, and team supervision.

For this role, my strongest match is ${proof}. I have held hotel/resort and F&B management responsibilities, supported premium restaurant operations in Dubai, worked across stock control and internal audit, and contributed to pre-opening and operational setup for multiple restaurant brands in the UAE.

I would bring hands-on operational discipline, service-quality focus, cost awareness, team leadership, and GCC hospitality experience to your F&B operation.

Kind regards,
Babar Aslam Abbasi`;
  }

  return `Dear Hiring Team,

I am applying for the ${title} role with ${company}. My background is strongest in multi-unit restaurant operations, pre-opening execution, team development, cost control, and practical restaurant systems across Saudi Arabia, UAE, and Pakistan.

In Riyadh, I supported regional operations and development for Burgerizzer, including the opening of 12 branches and workflow improvements that reduced kitchen cooking time from 20 minutes to 7 minutes. In the UAE, I worked across procurement, administration, HR support, stock control, internal audit, and pre-opening operations with Regulus Restaurants and Food Fund International / The Meat Co.

For this role, I would bring hands-on experience in branch readiness, service standards, BOH/FOH coordination, staff training, vendor coordination, cost control, and day-to-day operational discipline.

Kind regards,
Babar Aslam Abbasi`;
}

function shortAnswers(job) {
  return `Why are you a good fit for this role?

I have 20+ years of hospitality operations and F&B management experience across UAE, Saudi Arabia, and Pakistan. My background includes restaurant operations, hotel/resort operations, pre-opening projects, procurement, cost control, team training, stock control, internal audit, and multi-unit operations. For this role, my strongest match is ${safe(job.proofAngle)}.

Most relevant achievements:

- Supported opening of 12 Burgerizzer branches in Riyadh.
- Improved kitchen workflow and reduced cooking time from 20 minutes to 7 minutes.
- Supported pre-opening and operational setup for restaurant brands in the UAE.
- Worked across procurement, stock control, internal audit, inventory, warehouse, and operational reporting.
- Managed hotel/resort and F&B operations with focus on guest satisfaction, team leadership, service standards, and operational efficiency.

Salary expectation:

Open to a fair market package based on role scope, country, visa support, accommodation/benefits, and total responsibility. Current estimate for this role: ${safe(job.payEstimate)}.

Visa / relocation:

Open to relocation for the right international hospitality opportunity. Visa sponsorship or company visa support can be discussed during the process.

500-character summary:

Senior hospitality operations and F&B management professional with 20+ years across UAE, Saudi Arabia, and Pakistan. Experience includes multi-unit restaurant operations, hotel/resort operations, pre-opening, procurement, cost control, team leadership, stock control, internal audit, and operational turnaround.`;
}

function recruiterMessage(job) {
  return `Hello,

I am interested in the ${safe(job.title)} opportunity with ${safe(job.company)}. I have 20+ years of hospitality operations and F&B management experience across UAE, Saudi Arabia, and Pakistan, including restaurant operations, hotel/resort operations, pre-opening, procurement, cost control, team leadership, and multi-unit operations.

My strongest match for this role is ${safe(job.proofAngle)}. I would be happy to share my CV and discuss whether my background fits the role requirements.

Best regards,
Babar Aslam Abbasi`;
}

function priorityFolder(job) {
  if (job.priority === 'A') return '01_APPLY_FIRST_A';
  if (job.priority === 'B') return '02_VERIFY_AND_APPLY_B';
  return '03_BACKUP_C';
}

function instructions(job) {
  if (job.priority === 'A') return 'Apply these first. These are the strongest matches.';
  if (job.priority === 'B') return 'Verify the original company/source first. Apply if the job is still active and looks real.';
  return 'Backup only. Do not prioritize unless there is extra time.';
}

const raw = JSON.parse(readFileSync(leadsPath, 'utf8'));
const queue = (raw.queue || [])
  .filter((job) => ['A', 'B', 'C'].includes(job.priority))
  .sort((a, b) =>
    priorityRank(a.priority) - priorityRank(b.priority) ||
    Number(b.polishedScore || b.score || 0) - Number(a.polishedScore || a.score || 0)
  )
  .slice(0, top);

if (!queue.length) {
  console.error('No A/B/C jobs found in polished queue.');
  process.exit(1);
}

rmSync(packageRoot, { recursive: true, force: true });
ensureDir(packageRoot);
ensureDir(join(packageRoot, '00_READ_FIRST'));
ensureDir(join(packageRoot, '01_APPLY_FIRST_A'));
ensureDir(join(packageRoot, '02_VERIFY_AND_APPLY_B'));
ensureDir(join(packageRoot, '03_BACKUP_C'));
ensureDir(join(packageRoot, '99_MASTER_FILES'));

const masterCvs = [
  cvChoice({ title: 'Hotel F&B Director', company: 'Hotel Resort', proofAngle: 'Hotel/resort F&B leadership' }),
  cvChoice({ title: 'Cluster Restaurant General Manager', company: 'Restaurant Group', proofAngle: 'multi-unit restaurant operations' })
];

console.log('Application pack source:', leadsPath);
console.log('Creating CV PDFs...');
for (const cv of masterCvs) createCv(cv);

const cvAudits = masterCvs.map((cv) => ({
  name: cv.pdfName,
  ...pdfAudit(cv.pdf)
}));

const rows = [];

for (const [i, job] of queue.entries()) {
  const rank = String(i + 1).padStart(2, '0');
  const folderName = `${rank}_${job.priority}_${shortSlug(job.company, 32)}_${shortSlug(job.title, 42)}`;
  const folder = join(packageRoot, priorityFolder(job), folderName);
  const cv = cvChoice(job);

  console.log(`Building job folder: ${rank} ${job.priority} - ${safe(job.company)} - ${safe(job.title)}`);

  ensureDir(folder);

  if (existsSync(cv.pdf)) {
    copyFileSync(cv.pdf, join(folder, cv.pdfName));
  } else {
    console.warn('CV PDF missing, copying CV HTML fallback instead:', cv.pdf);
    copyFileSync(cv.html, join(folder, cv.pdfName.replace(/\.pdf$/i, '.html')));
  }

  copyFileSync(cv.html, join(folder, basename(cv.html)));

  const readmeText = `${safe(job.company)} - ${safe(job.title)}

Priority: ${job.priority}
Score: ${job.polishedScore || job.score}
Source: ${safe(job.sourceQuality)}
Visa risk: ${safe(job.visaRisk)}
Pay estimate: ${safe(job.payEstimate)}

What to do:

${instructions(job)}

1. Open APPLY_LINK.url or copy the link below.
2. Confirm the job is still active.
3. Upload the included CV PDF.
4. Use the cover note / short answers only where needed.
5. Submit only if the role/source looks real.
6. Tell Asad when submitted.

Apply link:
${safe(job.applyUrl)}

CV to upload:
${cv.pdfName}

Main proof angle:
${safe(job.proofAngle)}
`;

  writeFileSync(join(folder, '00_READ_ME_FIRST.txt'), readmeText, 'utf8');

  const readmeHtml = textToHtml(`${safe(job.company)} - ${safe(job.title)}`, readmeText);
  writeFileSync(join(folder, '00_READ_ME_FIRST.html'), readmeHtml, 'utf8');
  exportPdf(join(folder, '00_READ_ME_FIRST.html'), join(folder, '00_READ_ME_FIRST.pdf'));

  const cover = coverNote(job);
  writeFileSync(join(folder, '01_COVER_NOTE.txt'), cover, 'utf8');
  makeDocx(join(folder, '01_COVER_NOTE.docx'), 'Cover Note', cover);
  writeFileSync(join(folder, '01_COVER_NOTE.html'), textToHtml('Cover Note', cover), 'utf8');
  exportPdf(join(folder, '01_COVER_NOTE.html'), join(folder, '01_COVER_NOTE.pdf'));

  const answers = shortAnswers(job);
  writeFileSync(join(folder, '02_FORM_ANSWERS.txt'), answers, 'utf8');
  writeFileSync(join(folder, '02_FORM_ANSWERS.html'), textToHtml('Form Answers', answers), 'utf8');
  exportPdf(join(folder, '02_FORM_ANSWERS.html'), join(folder, '02_FORM_ANSWERS.pdf'));

  const proofs = proofBullets(job).map((x) => `- ${x}`).join('\n');
  writeFileSync(join(folder, '03_PROOF_BULLETS.txt'), proofs, 'utf8');
  writeFileSync(join(folder, '03_PROOF_BULLETS.html'), textToHtml('Proof Bullets', proofs), 'utf8');
  exportPdf(join(folder, '03_PROOF_BULLETS.html'), join(folder, '03_PROOF_BULLETS.pdf'));

  const recruiter = recruiterMessage(job);
  writeFileSync(join(folder, '04_RECRUITER_MESSAGE.txt'), recruiter, 'utf8');
  makeDocx(join(folder, '04_RECRUITER_MESSAGE.docx'), 'Recruiter Message', recruiter);
  writeFileSync(join(folder, '04_RECRUITER_MESSAGE.html'), textToHtml('Recruiter Message', recruiter), 'utf8');
  exportPdf(join(folder, '04_RECRUITER_MESSAGE.html'), join(folder, '04_RECRUITER_MESSAGE.pdf'));

  const checklist = `Application Checklist

[ ] Job link opened
[ ] Job is still active
[ ] Company/source looks real
[ ] CV PDF uploaded
[ ] Cover note customized if needed
[ ] Short form answers used if needed
[ ] Submitted
[ ] Status reported back to Asad

If unsure, do not submit. Send a screenshot/question back to Asad.`;

  writeFileSync(join(folder, '05_APPLICATION_CHECKLIST.txt'), checklist, 'utf8');
  writeFileSync(join(folder, '05_APPLICATION_CHECKLIST.html'), textToHtml('Application Checklist', checklist), 'utf8');
  exportPdf(join(folder, '05_APPLICATION_CHECKLIST.html'), join(folder, '05_APPLICATION_CHECKLIST.pdf'));

  writeFileSync(join(folder, 'APPLY_LINK.url'), `[InternetShortcut]
URL=${safe(job.applyUrl)}
`, 'utf8');

  rows.push({
    rank: i + 1,
    priority: job.priority,
    company: safe(job.company),
    title: safe(job.title),
    source: safe(job.sourceQuality),
    visa: safe(job.visaRisk),
    score: safe(job.polishedScore || job.score),
    pay: safe(job.payEstimate),
    cv: cv.pdfName,
    url: safe(job.applyUrl),
    folder
  });
}

const readme = `Babar Application Pack - ${packName}

This folder is ready to send/use.

Apply order:
1. Start with 01_APPLY_FIRST_A.
2. Then use 02_VERIFY_AND_APPLY_B.
3. Use 03_BACKUP_C only if there is extra time.

Each job folder includes:
- CV PDF to upload
- Cover note PDF/DOCX/TXT
- Form answers PDF/TXT
- Proof bullets PDF/TXT
- Recruiter message PDF/DOCX/TXT
- Checklist PDF/TXT
- Apply link

Important:
Do not mass apply blindly.

For every job:
1. Open the job link.
2. Check the role is still active.
3. Upload the included CV PDF.
4. Copy cover note/answers only where needed.
5. Submit.
6. Tell Asad which jobs were submitted.

Visa answer:
Open to relocation for the right international hospitality opportunity. Visa sponsorship or company visa support can be discussed during the process.

Salary answer:
Open to a fair market package based on role scope, country, visa support, accommodation/benefits, and total responsibility.
`;

writeFileSync(join(packageRoot, '00_READ_FIRST', 'README_FOR_BABAR.txt'), readme, 'utf8');
writeFileSync(join(packageRoot, '00_READ_FIRST', 'README_FOR_BABAR.html'), textToHtml('README FOR BABAR', readme), 'utf8');
exportPdf(join(packageRoot, '00_READ_FIRST', 'README_FOR_BABAR.html'), join(packageRoot, '00_READ_FIRST', 'README_FOR_BABAR.pdf'));

const orderRows = [
  ['Rank', 'Priority', 'Company', 'Role', 'Score', 'Source', 'Visa Risk', 'Pay Estimate', 'CV', 'Apply URL', 'Status', 'Notes'],
  ...rows.map((row) => [row.rank, row.priority, row.company, row.title, row.score, row.source, row.visa, row.pay, row.cv, row.url, '', ''])
];

makeXlsx(join(packageRoot, '00_READ_FIRST', 'APPLICATION_TRACKER.xlsx'), orderRows);

writeFileSync(
  join(packageRoot, '00_READ_FIRST', 'APPLICATION_TRACKER.csv'),
  orderRows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n'),
  'utf8'
);

const applyOrderHtml = simpleHtml('Apply Order', `
<h1>Apply Order</h1>
<p>Batch: ${html(packName)}</p>
<p>Jobs included: ${rows.length}</p>
<table>
<thead>
<tr><th>Rank</th><th>Priority</th><th>Company</th><th>Role</th><th>Source</th><th>Visa</th><th>CV</th></tr>
</thead>
<tbody>
${rows.map((row) => `<tr><td>${row.rank}</td><td>${html(row.priority)}</td><td>${html(row.company)}</td><td>${html(row.title)}</td><td>${html(row.source)}</td><td>${html(row.visa)}</td><td>${html(row.cv)}</td></tr>`).join('\n')}
</tbody>
</table>
<h2>CV PDF Quality Audit</h2>
<table>
<thead><tr><th>File</th><th>Verdict</th><th>Score</th><th>Notes</th></tr></thead>
<tbody>
${cvAudits.map((audit) => `<tr><td>${html(audit.name)}</td><td>${html(audit.verdict)}</td><td>${audit.score}</td><td>${html(audit.notes)}</td></tr>`).join('\n')}
</tbody>
</table>
`);

writeFileSync(join(packageRoot, '00_READ_FIRST', 'APPLY_ORDER.html'), applyOrderHtml, 'utf8');
exportPdf(join(packageRoot, '00_READ_FIRST', 'APPLY_ORDER.html'), join(packageRoot, '00_READ_FIRST', 'APPLY_ORDER.pdf'));

const auditText = cvAudits.map((audit) =>
  `${audit.name}: ${audit.verdict} (${audit.score}) - ${audit.notes}`
).join('\n');

writeFileSync(join(packageRoot, '00_READ_FIRST', 'CV_QUALITY_AUDIT.txt'), auditText, 'utf8');

const zipPath = `${packageRoot}.zip`;
rmSync(zipPath, { force: true });
zipFolder(packageRoot, zipPath);

console.log('');
console.log(`Application pack created: ${packageRoot}`);
console.log(`Zip created: ${zipPath}`);
console.log(`Jobs included: ${rows.length}`);
console.log('');
console.log(`A: ${rows.filter((x) => x.priority === 'A').length}`);
console.log(`B: ${rows.filter((x) => x.priority === 'B').length}`);
console.log(`C: ${rows.filter((x) => x.priority === 'C').length}`);
console.log('');
console.log('CV PDF audit:');
for (const audit of cvAudits) {
  console.log(`- ${audit.name}: ${audit.verdict} (${audit.score}) ${audit.notes}`);
}
