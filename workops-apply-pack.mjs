#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, isAbsolute, join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith('--'));

if (!input) {
  console.error('Usage: npm run workops:apply-pack -- "PACKAGE_FILE_OR_NAME.md"');
  console.error('Example: npm run workops:apply-pack -- "linjer-remote-junior-creative-strategist-2026-05-27-package.md"');
  process.exit(1);
}

const runsRoot = dirname(paths.reportsDir);
const packagesDir = join(runsRoot, 'packages');
const applyPacksDir = join(runsRoot, 'apply-packs');

function resolvePackagePath(value) {
  const candidates = [
    value,
    isAbsolute(value) ? value : join(packagesDir, value),
    isAbsolute(value) ? value : join(process.cwd(), value),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function slugify(value) {
  return String(value || 'application-pack')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function clean(value) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/^[-:\s]+|[-:\s]+$/g, '')
    .trim();
}

function extractHeader(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith('# Application Package:'));
  if (!line) return {};
  const cleanLine = line.replace('# Application Package:', '').trim();
  const parts = cleanLine.split(/\s+(?:—|â€”|-)\s+/);
  return {
    company: clean(parts[0]),
    role: clean(parts.slice(1).join(' - ')),
  };
}

function section(text, titlePattern) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => titlePattern.test(line));
  if (start < 0) return '';

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\d+\.|^##\s+[A-Z]/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n').trim() + '\n';
}

const packagePath = resolvePackagePath(input);
if (!packagePath) {
  console.error(`Package not found: ${input}`);
  console.error(`Looked in: ${packagesDir}`);
  process.exit(1);
}

const text = readFileSync(packagePath, 'utf8');
const header = extractHeader(text);
const company = header.company || basename(packagePath).replace(/-package\.md$/i, '');
const role = header.role || 'Application';

const outDir = join(applyPacksDir, `${slugify(company)}-${slugify(role)}`);
mkdirSync(outDir, { recursive: true });

const decision = section(text, /^##\s+1\.\s+Decision/i);
const positioning = section(text, /^##\s+2\.\s+Tailored Positioning/i);
const cvCustomization = section(text, /^##\s+3\.\s+CV Customization/i);
const coverLetter = section(text, /^##\s+4\.\s+Cover Letter/i);
const answers = section(text, /^##\s+5\.\s+Application Answers/i);
const portfolio = section(text, /^##\s+6\.\s+Portfolio Checklist/i);
const interview = section(text, /^##\s+7\.\s+Interview|^##\s+7\.\s+Client/i);
const followUp = section(text, /^##\s+8\.\s+Follow-Up/i);
const checklist = section(text, /^##\s+9\.\s+Final Action Checklist/i);

const readme = [
  `# Apply Pack: ${company} — ${role}`,
  '',
  `Source package: ${packagePath}`,
  '',
  '## Files',
  '',
  '- `01-decision.md` — quick decision and risks',
  '- `02-positioning.md` — exact positioning angle',
  '- `03-cv-customization.md` — CV changes to make before applying',
  '- `04-cover-letter.md` — cover letter draft',
  '- `05-application-answers.md` — application answers',
  '- `06-portfolio-checklist.md` — links/projects to include',
  '- `07-interview-prep.md` — interview/client call prep',
  '- `08-follow-up.md` — follow-up message',
  '- `09-final-checklist.md` — submit checklist',
  '',
  '## Recommended Use',
  '',
  '1. Read `01-decision.md`.',
  '2. Update CV using `03-cv-customization.md`.',
  '3. Copy/polish `04-cover-letter.md` and `05-application-answers.md`.',
  '4. Submit only after `09-final-checklist.md` is complete.',
  '',
].join('\n');

writeFileSync(join(outDir, 'README.md'), readme, 'utf8');
writeFileSync(join(outDir, '01-decision.md'), decision || '# Decision\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '02-positioning.md'), positioning || '# Positioning\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '03-cv-customization.md'), cvCustomization || '# CV Customization\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '04-cover-letter.md'), coverLetter || '# Cover Letter\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '05-application-answers.md'), answers || '# Application Answers\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '06-portfolio-checklist.md'), portfolio || '# Portfolio Checklist\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '07-interview-prep.md'), interview || '# Interview Prep\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '08-follow-up.md'), followUp || '# Follow-Up\n\nNot found.\n', 'utf8');
writeFileSync(join(outDir, '09-final-checklist.md'), checklist || '# Final Checklist\n\nNot found.\n', 'utf8');

console.log(`Created apply pack: ${outDir}`);
