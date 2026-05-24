import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const libDir = dirname(fileURLToPath(import.meta.url));

export const projectRoot = dirname(libDir);

function envPath(name) {
  const value = process.env[name];
  if (!value || !value.trim()) return null;
  return resolve(value.trim());
}

function resolveMaybeRelative(input) {
  if (!input || !input.trim()) return null;
  const value = input.trim();
  return isAbsolute(value) ? value : join(projectRoot, value);
}

export const workopsDataDir = envPath('WORKOPS_DATA_DIR');
export const workopsRunsDir =
  envPath('WORKOPS_RUNS_DIR') ||
  (workopsDataDir ? resolve(dirname(workopsDataDir), 'runs') : null);

export function workopsModeEnabled() {
  return Boolean(workopsDataDir || workopsRunsDir);
}

export function repoPath(...segments) {
  return join(projectRoot, ...segments);
}

export function dataFile(...segments) {
  return workopsDataDir ? join(workopsDataDir, ...segments) : repoPath(...segments);
}

export function runDir(name) {
  return workopsRunsDir ? join(workopsRunsDir, name) : repoPath(name);
}

export const paths = {
  cv: dataFile('cv.md'),
  profileYml: dataFile('config', 'profile.yml'),
  portals: process.env.CAREER_OPS_PORTALS
    ? resolveMaybeRelative(process.env.CAREER_OPS_PORTALS)
    : dataFile('portals.yml'),

  dataDir: runDir('data'),
  outputDir: runDir('output'),
  reportsDir: runDir('reports'),

  fontsDir: repoPath('fonts'),
  nodeModulesDir: repoPath('node_modules'),
};
