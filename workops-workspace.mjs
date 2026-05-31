#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { paths } from './lib/workops-paths.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'show';
const workspaceId = args[1] || '';

const workspacesDir = join(paths.dataDir, 'workspaces');
const activePath = join(workspacesDir, 'active-workspace.json');

function ensureDir() {
  mkdirSync(workspacesDir, { recursive: true });
}

function workspacePath(id) {
  return join(workspacesDir, `${id}.json`);
}

function writeWorkspace(workspace) {
  ensureDir();
  writeFileSync(workspacePath(workspace.id), JSON.stringify(workspace, null, 2) + '\n', 'utf8');
}

function loadWorkspace(id) {
  const file = workspacePath(id);

  if (!existsSync(file)) {
    console.error(`Workspace not found: ${id}`);
    console.error(`Expected: ${file}`);
    process.exit(1);
  }

  return JSON.parse(readFileSync(file, 'utf8'));
}

function activeWorkspace() {
  if (!existsSync(activePath)) return null;
  return JSON.parse(readFileSync(activePath, 'utf8'));
}

function defaultWorkspaces() {
  return [
    {
      schema_version: '1.0',
      id: 'asad-creative',
      user_id: 'asad-raza',
      user_name: 'Asad Raza',
      workspace_name: 'Asad Creative / Freelance WorkOps',
      kind: 'creative-freelance',
      root: 'D:\\WorkOps\\runs',
      data_root: paths.dataDir,
      active_profile_id: 'graphic-ai-creative',
      primary_outputs: {
        daily_summary: 'D:\\WorkOps\\runs\\daily-summary.md',
        apply_queue_md: 'D:\\WorkOps\\runs\\today-apply-queue.md',
        apply_queue_json: 'D:\\WorkOps\\runs\\today-apply-queue.json',
        queue_health_md: 'D:\\WorkOps\\runs\\queue-health.md',
        queue_health_json: 'D:\\WorkOps\\runs\\queue-health.json',
        qualified_opportunities_json: 'D:\\WorkOps\\runs\\qualified-opportunities.json',
        apply_packs: 'D:\\WorkOps\\runs\\apply-packs'
      },
      daily_command: 'npm run workops:daily -- --serpapi --serpapi-limit 5 --serpapi-location "United States" --queue-max 50 --top-packs 12 --model gemini-3.5-flash',
      notes: [
        'Main creative/freelance workflow for Asad.',
        'Uses active profile switching.',
        'Current best profile: graphic-ai-creative.'
      ]
    },
    {
      schema_version: '1.0',
      id: 'abeer-teaching-thailand',
      user_id: 'abeer-merchant',
      user_name: 'Abeer Merchant',
      workspace_name: 'Abeer Thailand Teaching Jobs',
      kind: 'teaching-thailand',
      root: 'D:\\WorkOps\\runs\\abeer-english-teacher',
      data_root: 'D:\\WorkOps\\data\\abeer-english-teacher',
      active_profile_id: 'primary-teacher-thailand',
      primary_outputs: {
        leads_master: 'D:\\WorkOps\\runs\\abeer-english-teacher\\leads-master.csv',
        opportunity_review: 'D:\\WorkOps\\runs\\abeer-english-teacher\\opportunity-review.md',
        apply_control_panel: 'D:\\WorkOps\\runs\\abeer-english-teacher\\apply-control-panel.md',
        package_audit: 'D:\\WorkOps\\runs\\abeer-english-teacher\\package-audit.md',
        below_threshold: 'D:\\WorkOps\\runs\\abeer-english-teacher\\below-threshold.md',
        processed_urls: 'D:\\WorkOps\\runs\\abeer-english-teacher\\processed-urls.txt',
        applications: 'D:\\WorkOps\\runs\\abeer-english-teacher\\applications',
        tools: 'D:\\WorkOps\\runs\\abeer-english-teacher\\tools'
      },
      daily_command: 'powershell -ExecutionPolicy Bypass -File D:\\WorkOps\\runs\\abeer-english-teacher\\tools\\Run-AbeerDailyLeadEngine.ps1 -Pages 5 -MaxDetails 130 -Top 20',
      evaluation_command: 'powershell -ExecutionPolicy Bypass -File D:\\WorkOps\\runs\\abeer-english-teacher\\tools\\Evaluate-AbeerCurrentLeads.ps1 -Limit 5 -DelaySeconds 75',
      target_summary: {
        role: 'Primary teacher / EAL / ESL / English / Maths / Science / History',
        location: 'Thailand',
        grades: 'Grades 1-6 only',
        avoid: [
          'nursery-only',
          'kindergarten-only',
          'secondary-only',
          'IGCSE/A Level/IELTS-only',
          'assistant-only',
          'admin-only',
          'hard native-speaker-only filters'
        ]
      },
      notes: [
        'Specialized workflow for Abeer Merchant.',
        'Do not merge into Asad creative pipeline.',
        'Dashboard should read this workspace separately.',
        'Known status from handoff: 39 ranked leads, 38 application folders, package audit clean.'
      ]
    }
  ];
}

function init() {
  ensureDir();

  for (const workspace of defaultWorkspaces()) {
    if (!existsSync(workspacePath(workspace.id))) {
      writeWorkspace(workspace);
      console.log(`Created workspace: ${workspace.id}`);
    } else {
      console.log(`Workspace already exists: ${workspace.id}`);
    }
  }

  if (!existsSync(activePath)) {
    setActive('asad-creative');
  } else {
    const active = activeWorkspace();
    console.log(`Active workspace already set: ${active?.id || 'unknown'}`);
  }
}

function list() {
  ensureDir();

  const active = activeWorkspace();
  const files = readdirSync(workspacesDir).filter((name) => name.endsWith('.json') && name !== 'active-workspace.json');

  console.log('WorkOps workspaces:');

  for (const file of files) {
    const workspace = JSON.parse(readFileSync(join(workspacesDir, file), 'utf8'));
    const marker = active?.id === workspace.id ? '*' : ' ';
    console.log(`${marker} ${workspace.id} — ${workspace.workspace_name} (${workspace.user_name})`);
  }
}

function setActive(id) {
  const workspace = loadWorkspace(id);
  writeFileSync(activePath, JSON.stringify(workspace, null, 2) + '\n', 'utf8');

  console.log(`Active WorkOps workspace set: ${workspace.id}`);
  console.log(`User: ${workspace.user_name}`);
  console.log(`Workspace: ${workspace.workspace_name}`);
  console.log(`Saved: ${activePath}`);
}

function show() {
  const active = activeWorkspace();

  if (!active) {
    console.log('No active workspace set. Run: npm run workops:workspace:init');
    return;
  }

  console.log(`Active workspace: ${active.id}`);
  console.log(`User: ${active.user_name}`);
  console.log(`Workspace: ${active.workspace_name}`);
  console.log(`Kind: ${active.kind}`);
  console.log(`Root: ${active.root}`);
  console.log(`Data root: ${active.data_root}`);
  console.log(`Active profile: ${active.active_profile_id || 'none'}`);
  console.log('');
  console.log('Daily command:');
  console.log(active.daily_command || 'Not set');
  console.log('');
  console.log('Primary outputs:');

  for (const [key, value] of Object.entries(active.primary_outputs || {})) {
    console.log(`- ${key}: ${value}`);
  }
}

switch (command) {
  case 'init':
    init();
    break;
  case 'list':
    list();
    break;
  case 'show':
    show();
    break;
  case 'set':
    if (!workspaceId) {
      console.error('Usage: npm run workops:workspace:set -- <workspace-id>');
      process.exit(1);
    }
    setActive(workspaceId);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Commands: init, list, show, set <workspace-id>');
    process.exit(1);
}
