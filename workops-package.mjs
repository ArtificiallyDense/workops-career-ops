#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, isAbsolute, join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from 'dotenv';
import { dataFile, paths, runDir } from './lib/workops-paths.mjs';

config();

const args = process.argv.slice(2);
const reportArg = args.find((arg) => !arg.startsWith('--'));
const modelIndex = args.indexOf('--model');
const modelName = modelIndex >= 0 ? args[modelIndex + 1] : (process.env.GEMINI_MODEL_PACKAGE || 'gemini-3.5-flash');

if (!reportArg) {
  console.error('Usage: npm run workops:package -- "reports/005-elevenlabs-2026-05-27.md" --model gemini-3.5-flash');
  process.exit(1);
}

function resolveReportPath(input) {
  const candidates = [
    input,
    isAbsolute(input) ? input : join(dirname(paths.reportsDir), input),
    isAbsolute(input) ? input : join(paths.reportsDir, input),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function readOptional(filePath, label) {
  if (!existsSync(filePath)) {
    return `# ${label}\n\nNot found at ${filePath}`;
  }
  return readFileSync(filePath, 'utf8');
}

function clean(value) {
  return String(value || 'Unknown')
    .replace(/\*\*/g, '')
    .replace(/^[-:\s]+|[-:\s]+$/g, '')
    .trim() || 'Unknown';
}

function extractField(text, name) {
  const summary =
    text.match(/---SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/) ||
    text.match(/---_SCORE_SUMMARY---([\s\S]*?)---END_SUMMARY---/);

  const block = summary ? summary[1] : text;
  const match = block.match(new RegExp(`${name}:\\s*(.+)`, 'i'));
  return match ? clean(match[1]) : null;
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY in .env or environment.');
  process.exit(1);
}

const reportPath = resolveReportPath(reportArg);
if (!reportPath) {
  console.error(`Report not found: ${reportArg}`);
  process.exit(1);
}

const report = readFileSync(reportPath, 'utf8');
const cv = readOptional(paths.cv, 'CV');
const profile = readOptional(paths.profileYml, 'Profile YAML');
const proof = readOptional(paths.proofLibrary, 'Proof Library');
const quickGig = readOptional(dataFile('quick-gig-strategy.md'), 'Quick Gig Strategy');

function extractHeader(text) {
  const line = text.split(/\r?\n/).find((item) => item.startsWith('# Evaluation:'));
  if (!line) return {};
  const cleanLine = line.replace('# Evaluation:', '').trim();
  const parts = cleanLine.split(/\s+(?:—|â€”|-)\s+/);
  return {
    company: clean(parts[0]),
    role: clean(parts.slice(1).join(' - ')),
  };
}

const header = extractHeader(report);

const company = extractField(report, 'COMPANY') || header.company || 'Unknown Company';
const role = extractField(report, 'ROLE') || header.role || 'Unknown Role';
const score = extractField(report, 'SCORE') || report.match(/\*\*Score:\*\*\s*([0-9.]+)/i)?.[1] || 'Unknown';

const prompt = `
You are WorkOps Package Builder for Asad Raza.

Goal:
Create a practical application package for this evaluated opportunity.

Candidate:
${cv}

Profile:
${profile}

Proof Library:
${proof}

Quick Gig Strategy:
${quickGig}

Evaluation Report:
${report}

Instructions:
Generate a polished Markdown package with these sections:

# Application Package: ${company} — ${role}

## 1. Decision
- Should Asad apply/pitch now?
- Why?
- Main risk/blocker.
- Best positioning angle.

## 2. Tailored Positioning
Write the exact positioning Asad should use for this role.

## 3. CV Customization
Give:
- headline
- summary
- 5 strongest bullets
- skills to emphasize
- projects to feature
Do not invent fake metrics. If useful, suggest honest metric placeholders like "[add real number if available]".

## 4. Cover Letter
Write a concise, strong cover letter.

## 5. Application Answers
Draft likely answers for application questions based on the report.

## 6. Portfolio Checklist
List what links/projects Asad should include and why.

## 7. Interview / Client Call Prep
Give STAR stories and talking points.

## 8. Follow-Up Message
Write a short follow-up message.

## 9. Final Action Checklist
Give a practical checklist before submitting.
`;

console.log(`Generating package for: ${company} — ${role}`);
console.log(`Model: ${modelName}`);

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: modelName,
  generationConfig: {
    temperature: 0.45,
    maxOutputTokens: 8192,
  },
});

const result = await model.generateContent(prompt);
const text = result.response.text();

const packagesDir = runDir('packages');
mkdirSync(packagesDir, { recursive: true });

const date = new Date().toISOString().slice(0, 10);
const outName = `${slugify(company)}-${slugify(role)}-${date}-package.md`;
const outPath = join(packagesDir, outName);

writeFileSync(outPath, text, 'utf8');

console.log(`Saved package: ${outPath}`);
