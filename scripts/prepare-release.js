#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Prepare release script - generates changelog and commits changes
 * This script prepares for a release by updating changelog and committing changes
 * The actual npm publish will be triggered by GitHub Actions when a tag is pushed
 */

function log(message) {
  console.log(`[PREPARE-RELEASE] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function exec(command, options = {}) {
  log(`Executing: ${command}`);
  try {
    return execSync(command, { 
      stdio: 'inherit', 
      encoding: 'utf8',
      ...options 
    });
  } catch (err) {
    error(`Command failed: ${command}\n${err.message}`);
  }
}

function getPackageVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

function syncVersionFile() {
  log('Syncing version file...');
  
  const packageVersion = getPackageVersion();
  const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');
  
  // Check if version file exists and read current version
  if (fs.existsSync(versionFilePath)) {
    const versionFileContent = fs.readFileSync(versionFilePath, 'utf8');
    const versionMatch = versionFileContent.match(/export const VERSION = '([^']+)'/);
    
    if (versionMatch && versionMatch[1] === packageVersion) {
      log('Version file is already in sync');
      return;
    }
  }
  
  // Update version file
  const content = `export const VERSION = '${packageVersion}';\n`;
  fs.writeFileSync(versionFilePath, content);
  log(`Updated src/version.ts to version ${packageVersion}`);
}

function validateEnvironment() {
  log('Validating environment...');
  
  // Check if we're on main branch
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    if (branch !== 'main') {
      error(`Must be on main branch to prepare release. Current branch: ${branch}`);
    }
  } catch (_err) {
    error('Failed to get current git branch');
  }

  log('Environment validation passed');
}

function runTests() {
  log('Running tests...');
  exec('pnpm test');
  log('Tests passed');
}

function runLinting() {
  log('Running linting...');
  exec('pnpm lint');
  log('Linting passed');
}

function runTypeCheck() {
  log('Running type check...');
  exec('pnpm typecheck');
  log('Type check passed');
}

function buildProject() {
  log('Building project...');
  exec('pnpm build');
  log('Build completed');
}

/**
 * Get the standard changelog header
 */
function getChangelogHeader() {
  return `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;
}

/**
 * Read existing changelog content or return empty string
 */
function readExistingChangelog(changelogPath) {
  if (fs.existsSync(changelogPath)) {
    return fs.readFileSync(changelogPath, 'utf8');
  }
  return '';
}

/**
 * Insert new content into changelog at the correct position
 * @param {string} existingContent - Current changelog content
 * @param {string} newContent - New content to insert
 * @returns {string} Updated changelog content
 */
function insertChangelogContent(existingContent, newContent) {
  if (!existingContent) {
    // No existing changelog - create new one with header
    return getChangelogHeader() + newContent;
  }

  const lines = existingContent.split('\n');
  const firstReleaseIndex = lines.findIndex(line => line.startsWith('## ['));
  
  if (firstReleaseIndex === -1) {
    // No existing releases - append to end
    const separator = existingContent.endsWith('\n') ? '' : '\n';
    return existingContent + separator + newContent;
  }

  // Insert before first existing release
  const beforeReleases = lines.slice(0, firstReleaseIndex).join('\n');
  const afterReleases = lines.slice(firstReleaseIndex).join('\n');
  const separator = beforeReleases.endsWith('\n') ? '' : '\n';
  
  return beforeReleases + separator + newContent + '\n' + afterReleases;
}

/**
 * Generate changelog entry using conventional-changelog
 */
function generateConventionalChangelog() {
  log('Running: npx conventional-changelog -p angular');
  const changelogOutput = execSync('npx conventional-changelog -p angular', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'] // Capture all output
  });
  
  if (!changelogOutput || !changelogOutput.trim()) {
    log('No changelog content generated - no conventional commits found since last tag');
    return null;
  }
  
  log('Conventional changelog generated successfully');
  return changelogOutput;
}

/**
 * Create a simple fallback changelog entry
 */
function createSimpleChangelogEntry() {
  const version = getPackageVersion();
  const date = new Date().toISOString().split('T')[0];
  
  return `## [${version}] - ${date}

### Changed
- Release version ${version}

`;
}

/**
 * Generate and update changelog
 */
function generateChangelog() {
  log('Generating changelog using conventional-changelog...');
  
  const changelogPath = path.join(__dirname, '..', 'Changelog.md');
  let newContent;
  
  try {
    // Try to generate conventional changelog first
    newContent = generateConventionalChangelog();
    
    if (!newContent) {
      // No conventional commits found - use simple entry
      newContent = createSimpleChangelogEntry();
      log('Using fallback changelog entry');
    }
    
  } catch (err) {
    log(`Warning: conventional-changelog failed: ${err.message}`);
    log('Falling back to simple changelog entry');
    newContent = createSimpleChangelogEntry();
  }
  
  // Read existing changelog and insert new content
  const existingChangelog = readExistingChangelog(changelogPath);
  const updatedChangelog = insertChangelogContent(existingChangelog, newContent);
  
  // Write updated changelog
  fs.writeFileSync(changelogPath, updatedChangelog);
  log('Changelog updated successfully');
}

function commitChanges() {
  log('Committing changelog and version changes...');
  
  const version = getPackageVersion();
  
  // Add changelog and version file to git
  exec('git add Changelog.md src/version.ts');
  
  // Check if there are changes to commit
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      exec(`git commit -m "chore: update changelog and version for v${version}"`);
      log('Changelog and version changes committed');
    } else {
      log('No changelog or version changes to commit');
    }
  } catch (_err) {
    error('Failed to commit changelog and version changes');
  }
}

function pushChanges() {
  log('Pushing changes to remote...');
  exec('git push origin main');
  log('Changes pushed to remote');
}

function createAndPushTag() {
  const version = getPackageVersion();
  const tag = `v${version}`;
  
  log(`Creating and pushing git tag: ${tag}`);
  exec(`git tag ${tag}`);
  exec(`git push origin ${tag}`);
  log(`Git tag ${tag} created and pushed - this will trigger the release workflow`);
}

function main() {
  log('Starting release preparation...');
  
  try {
    validateEnvironment();
    syncVersionFile();
    runLinting();
    runTypeCheck();
    runTests();
    buildProject();
    generateChangelog();
    commitChanges();
    pushChanges();
    createAndPushTag();
    
    const version = getPackageVersion();
    log(`🎉 Release preparation for v${version} completed!`);
    log('The GitHub Actions workflow will now handle the npm publication.');
  } catch (err) {
    error(`Release preparation failed: ${err.message}`);
  }
}

// Run the release preparation process
if (require.main === module) {
  main();
}

module.exports = {
  validateEnvironment,
  syncVersionFile,
  runTests,
  runLinting,
  runTypeCheck,
  buildProject,
  generateChangelog,
  commitChanges,
  pushChanges,
  createAndPushTag,
  getPackageVersion
};
