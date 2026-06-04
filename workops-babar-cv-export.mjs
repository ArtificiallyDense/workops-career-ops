#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const cvRoot = 'D:/WorkOps/data/babar-hospitality-global/cv';
const outRoot = 'D:/WorkOps/runs/babar-hospitality-global/cv-export';

mkdirSync(outRoot, { recursive: true });

const files = [
  {
    input: join(cvRoot, 'babar-cv-hospitality-operations.md'),
    output: join(outRoot, 'babar-cv-hospitality-operations.html'),
    title: 'Babar Aslam Abbasi - Hospitality Operations CV'
  },
  {
    input: join(cvRoot, 'babar-cv-hotel-resort-fnb.md'),
    output: join(outRoot, 'babar-cv-hotel-resort-fnb.html'),
    title: 'Babar Aslam Abbasi - Hotel Resort F&B CV'
  }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    if (line === '---') {
      closeList();
      html.push('<hr />');
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      continue;
    }

    if (line.startsWith('## ')) {
      closeList();
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith('### ')) {
      closeList();
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join('\n');
}

function render(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f3f0e9;
      color: #171512;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.42;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: white;
      padding: 14mm;
      box-shadow: 0 14px 40px rgba(0,0,0,.12);
    }
    h1 {
      margin: 0 0 4px;
      font-size: 24pt;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    h2 {
      margin: 18px 0 8px;
      padding-top: 8px;
      border-top: 1px solid #ddd7ce;
      font-size: 12pt;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #5b4636;
    }
    h3 {
      margin: 13px 0 4px;
      font-size: 11.5pt;
      color: #171512;
    }
    p {
      margin: 0 0 7px;
    }
    ul {
      margin: 0 0 8px 18px;
      padding: 0;
    }
    li {
      margin: 0 0 4px;
    }
    hr {
      border: 0;
      border-top: 1px solid #ddd7ce;
      margin: 12px 0;
    }
    strong {
      color: #111;
    }
    @media print {
      body { background: white; }
      .page {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
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

for (const file of files) {
  if (!existsSync(file.input)) {
    console.error(`Missing CV markdown: ${file.input}`);
    process.exitCode = 1;
    continue;
  }

  const md = readFileSync(file.input, 'utf8');
  const html = render(file.title, mdToHtml(md));
  writeFileSync(file.output, html, 'utf8');
  console.log(`Saved: ${file.output}`);
}
