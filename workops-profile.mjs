#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'show';
const profileId = args[1] || '';

const profilesDir = join(paths.dataDir, 'profiles');
const activePath = join(profilesDir, 'active-profile.json');
const activeMdPath = join(profilesDir, 'active-profile.md');

function clean(value) {
  return String(value || '')
    .replace(/â€“|â€”|-|-/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function profilePath(id) {
  return join(profilesDir, `${id}.json`);
}

function ensureDir() {
  mkdirSync(profilesDir, { recursive: true });
}

function writeProfile(profile) {
  ensureDir();
  writeFileSync(profilePath(profile.id), JSON.stringify(profile, null, 2) + '\n', 'utf8');
}

function loadProfile(id) {
  const file = profilePath(id);
  if (!existsSync(file)) {
    console.error(`Profile not found: ${id}`);
    console.error(`Expected: ${file}`);
    process.exit(1);
  }

  return JSON.parse(readFileSync(file, 'utf8'));
}

function activeProfile() {
  if (!existsSync(activePath)) return null;
  return JSON.parse(readFileSync(activePath, 'utf8'));
}

function markdownFor(profile) {
  const lines = [
    `# WorkOps Active Profile - ${profile.name}`,
    '',
    `ID: ${profile.id}`,
    `Updated: ${new Date().toISOString()}`,
    '',
    '## Positioning',
    '',
    profile.positioning || '',
    '',
    '## Portfolio Links',
    '',
  ];

  for (const [name, url] of Object.entries(profile.portfolio_links || {})) {
    lines.push(`- ${name}: ${url}`);
  }

  lines.push('', '## High-Fit Roles', '');
  for (const item of profile.high_fit_roles || []) lines.push(`- ${item}`);

  lines.push('', '## Medium-Fit Roles', '');
  for (const item of profile.medium_fit_roles || []) lines.push(`- ${item}`);

  lines.push('', '## Lower-Fit Roles', '');
  for (const item of profile.lower_fit_roles || []) lines.push(`- ${item}`);

  lines.push('', '## Proof Rules', '');
  for (const rule of profile.proof_rules || []) {
    lines.push(`### ${rule.when}`);
    lines.push(rule.use);
    lines.push('');
  }

  return lines.join('\n');
}

function setActive(id) {
  const profile = loadProfile(id);
  writeFileSync(activePath, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  writeFileSync(activeMdPath, markdownFor(profile), 'utf8');

  console.log(`Active WorkOps profile set: ${profile.id}`);
  console.log(`Name: ${profile.name}`);
  console.log(`Saved: ${activePath}`);
  console.log(`Saved: ${activeMdPath}`);
}

function defaultProfiles() {
  return [
    {
      schema_version: '1.0',
      id: 'graphic-ai-creative',
      name: 'Graphic Designer + AI Creative Specialist',
      positioning:
        'Bangkok-based Graphic Designer and AI Creative Specialist with 10+ years of design experience and 5+ years of AI-assisted hybrid workflow experience. Strongest fit: branding, sports/apparel visuals, social media assets, motion graphics, 3D/product visualization, AI-enhanced creative production, and production-ready visual systems.',
      portfolio_links: {
        Behance: 'https://www.behance.net/asad_raza',
        YouTube: 'https://www.youtube.com/channel/UCzO5D24ccRoYsRG7fMqtr5Q',
      },
      high_fit_roles: [
        'Freelance Graphic Designer',
        'Brand Designer',
        'Logo / Brand Style Guide Designer',
        'Social Media Designer',
        'Thumbnail Designer',
        'Paid Media Creative Designer',
        'Sports Apparel Designer',
        'Merchandise Designer',
        'Gear / Product Visual Designer',
        'Motion Graphics Designer',
        'AI Creative Producer',
        'AI Visual Designer',
        'Creative Automation Specialist',
        'Content Packaging Designer',
        'Ecommerce Visual Designer',
      ],
      medium_fit_roles: [
        'Creative Strategist',
        'Content Producer',
        'Digital Content Creator',
        'Brand Content Designer',
        'Presentation Designer',
        'Canva Specialist',
      ],
      lower_fit_roles: [
        'Pure Content Writer',
        'Pure Growth Manager',
        'Performance Marketing Manager',
        'Customer Support',
        'Account Executive',
        'Sales',
        'Pure Product Designer / UX Designer unless visual-production heavy',
      ],
      search_queries: [
        'remote freelance graphic designer sports apparel',
        'remote sports apparel graphic designer',
        'remote merchandise designer freelance',
        'remote fight gear designer',
        'remote sports brand designer',
        'remote thumbnail designer freelance',
        'remote youtube thumbnail designer freelance',
        'remote paid media creative designer',
        'remote ecommerce graphic designer freelance',
        'remote brand designer ecommerce freelance',
        'remote motion graphics designer freelance',
        'remote AI creative designer freelance',
        'remote AI visual designer',
        'remote generative AI graphic designer',
        'remote social media graphic designer freelance',
        'remote product visualization designer',
        'remote 3D product render designer',
        'remote packaging and label designer freelance',
        'remote visual content designer freelance',
        'remote content packaging designer',
      ],
      positive_terms: [
        'sports apparel',
        'sports graphics',
        'apparel graphics',
        'fight gear',
        'combat sports',
        'merchandise design',
        'gear design',
        'product visualization',
        '3D renders',
        'thumbnail design',
        'content packaging',
        'paid media creative',
        'brand systems',
        'visual systems',
        'motion assets',
        'AI creative',
        'AI workflow',
        'generative AI visuals',
        'ecommerce graphics',
        'social media artwork',
        'portfolio design',
      ],
      context_terms: [
        'sports',
        'apparel',
        'gear',
        'fashion',
        'ecommerce',
        'beauty',
        'lifestyle',
        'YouTube',
        'thumbnail',
        'motion',
        'AI',
        'remote',
        'freelance',
        'contract',
        'brand',
        'visual system',
      ],
      negative_terms: [
        'growth manager',
        'performance marketing manager',
        'customer support',
        'customer success',
        'account executive',
        'sales manager',
        'recruiter',
        'talent acquisition',
        'pure ux',
        'backend engineer',
        'frontend engineer',
      ],
      proof_rules: [
        {
          when: 'sports/apparel/gear roles',
          use: 'Use IFMA, MTG Fight Gear, Mongkon Academy, World Muaythai Council, United Through Sports, apparel/gear design, and international production-ready event assets.',
        },
        {
          when: 'beauty/fashion/ecommerce roles',
          use: 'Use Farida Waller, Zaha Vintage, product visuals, social media assets, premium brand direction, and ecommerce visual production.',
        },
        {
          when: 'thumbnail/content packaging roles',
          use: 'Use World of Sports, Space Cats, motion/social examples, YouTube/visual packaging, and repeatable content systems.',
        },
        {
          when: 'logo/brand identity roles',
          use: 'Use strongest logo/identity examples, RxStat Pharmacy, Active by Pulse, brand systems, and clean usable deliverables.',
        },
        {
          when: 'AI creative roles',
          use: 'Use ComfyUI, Midjourney, ElevenLabs, LM Studio, Codex, AI workflows, Web3/NFT hybrid-media proof, and before/after visual systems.',
        },
        {
          when: 'motion/video roles',
          use: 'Use GoBlackBoard, United Through Sports, animations, YouTube content, video editing, and motion assets.',
        },
      ],
    },
    {
      schema_version: '1.0',
      id: 'ai-automation-operator',
      name: 'AI Automation + Workflow Operator',
      positioning:
        'AI workflow and automation profile for translation systems, multilingual pipelines, local LLM workflows, NIM/Qwen coding setups, agentic scripting, n8n/Zapier automation, and operational tooling.',
      portfolio_links: {
        Behance: 'https://www.behance.net/asad_raza',
      },
      high_fit_roles: [
        'AI Workflow Specialist',
        'Creative Automation Specialist',
        'AI Operations Assistant',
        'Automation Builder',
        'No-code / Low-code Automation Specialist',
        'LLM Workflow Operator',
      ],
      medium_fit_roles: [
        'AI Content Operations',
        'AI Production Coordinator',
        'Technical Creative Assistant',
      ],
      lower_fit_roles: [
        'Pure software engineer',
        'Senior backend engineer',
        'Sales',
        'Customer support',
      ],
      search_queries: [
        'remote AI workflow specialist freelance',
        'remote creative automation specialist',
        'remote n8n automation freelancer',
        'remote zapier automation freelancer',
        'remote LLM workflow operator',
        'remote AI content operations freelance',
      ],
      positive_terms: [
        'AI workflow',
        'automation',
        'n8n',
        'Zapier',
        'LLM',
        'local AI',
        'translation pipeline',
        'agentic workflow',
        'creative automation',
      ],
      context_terms: ['AI', 'workflow', 'automation', 'remote', 'freelance', 'operations'],
      negative_terms: ['sales', 'account executive', 'customer support', 'backend engineer'],
      proof_rules: [
        {
          when: 'automation/workflow roles',
          use: 'Use translation pipeline, local NIM/Qwen workflow, Codex, LM Studio, n8n/Zapier, and operational scripting proof.',
        },
      ],
    },
  ];
}

function init() {
  ensureDir();

  for (const profile of defaultProfiles()) {
    if (!existsSync(profilePath(profile.id))) {
      writeProfile(profile);
      console.log(`Created profile: ${profile.id}`);
    } else {
      console.log(`Profile already exists: ${profile.id}`);
    }
  }

  if (!existsSync(activePath)) {
    setActive('graphic-ai-creative');
  } else {
    const active = activeProfile();
    console.log(`Active profile already set: ${active?.id || 'unknown'}`);
  }
}

function list() {
  ensureDir();

  const active = activeProfile();
  const files = readdirSync(profilesDir).filter((name) => name.endsWith('.json') && name !== 'active-profile.json');

  console.log('WorkOps profiles:');
  for (const file of files) {
    const profile = JSON.parse(readFileSync(join(profilesDir, file), 'utf8'));
    const marker = active?.id === profile.id ? '*' : ' ';
    console.log(`${marker} ${profile.id} - ${profile.name}`);
  }
}

function show() {
  const active = activeProfile();

  if (!active) {
    console.log('No active profile set. Run: npm run workops:profile:init');
    return;
  }

  console.log(`Active profile: ${active.id}`);
  console.log(`Name: ${active.name}`);
  console.log('');
  console.log(active.positioning || '');
  console.log('');
  console.log(`Profile file: ${activePath}`);
  console.log(`Profile markdown: ${activeMdPath}`);
}

switch (command) {
  case 'init':
    init();
    break;
  case 'list':
    list();
    break;
  case 'set':
    if (!profileId) {
      console.error('Usage: npm run workops:profile:set -- <profile-id>');
      process.exit(1);
    }
    setActive(profileId);
    break;
  case 'show':
    show();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: init, list, show, set <profile-id>');
    process.exit(1);
}
