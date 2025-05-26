#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Publish script for GitHub Actions
 * This script handles the actual npm publishing and post-publish tasks
 */

function log(message) {
  console.log(`[PUBLISH] ${message}`);
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

function validateEnvironment() {
  log('Validating environment...');
  
  // Check if NPM_TOKEN is available
  if (!process.env.NPM_TOKEN) {
    error('NPM_TOKEN environment variable is required for publishing');
  }

  // Check if GITHUB_TOKEN is available for post-publish actions
  if (!process.env.GITHUB_TOKEN) {
    error('GITHUB_TOKEN environment variable is required for post-publish actions');
  }

  log('Environment validation passed');
}

function buildProject() {
  log('Building project...');
  exec('pnpm build');
  log('Build completed');
}

function publishToNpm() {
  log('Publishing to npm...');
  
  // Set npm registry and token
  exec('npm config set registry https://registry.npmjs.org/');
  exec(`npm config set //registry.npmjs.org/:_authToken ${process.env.NPM_TOKEN}`);
  
  // Publish the package
  exec('npm publish --access public');
  
  log('Package published successfully');
}

function updateChangelogPostPublish() {
  log('Updating changelog with publication info...');
  
  const version = getPackageVersion();
  const date = new Date().toISOString().split('T')[0];
  const changelogPath = path.join(__dirname, '..', 'Changelog.md');
  
  if (fs.existsSync(changelogPath)) {
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    
    // Find the current version entry and add publication info
    const versionPattern = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\] - ${date}`, 'm');
    const match = changelog.match(versionPattern);
    
    if (match) {
      const publishedHeader = `## [${version}] - ${date} - Published to npm`;
      changelog = changelog.replace(versionPattern, publishedHeader);
      fs.writeFileSync(changelogPath, changelog);
      log('Changelog updated with publication info');
    } else {
      log('Warning: Could not find version entry in changelog to update');
    }
  }
}

function commitAndPushPostPublish() {
  log('Committing and pushing post-publish changes...');
  
  const version = getPackageVersion();
  
  // Configure git with GitHub Actions bot
  exec('git config user.name "github-actions[bot]"');
  exec('git config user.email "github-actions[bot]@users.noreply.github.com"');
  
  // Add and commit changelog updates
  exec('git add Changelog.md');
  
  // Check if there are changes to commit
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      exec(`git commit -m "chore: mark v${version} as published to npm [skip ci]"`);
      exec('git push origin HEAD:refs/heads/main');
      log('Post-publish changes committed and pushed');
    } else {
      log('No post-publish changes to commit');
    }
  } catch (_err) {
    log('Warning: Failed to commit post-publish changes, but npm publish was successful');
  }
}

function createGitHubRelease() {
  log('Creating GitHub release...');
  
  const version = getPackageVersion();
  const tag = `v${version}`;
  
  // Extract changelog for this version
  const changelogPath = path.join(__dirname, '..', 'Changelog.md');
  let releaseNotes = `Release ${version}`;
  
  if (fs.existsSync(changelogPath)) {
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const versionMatch = changelog.match(new RegExp(`## \\[${version}\\][^#]*?(?=## |$)`, 's'));
    if (versionMatch) {
      releaseNotes = versionMatch[0].replace(`## [${version}] - `, '').trim();
    }
  }
  
  // Create GitHub release using gh CLI or API
  try {
    exec(`gh release create ${tag} --title "Release ${version}" --notes "${releaseNotes}"`);
    log('GitHub release created successfully');
  } catch (_err) {
    log('Warning: Failed to create GitHub release, but npm publish was successful');
  }
}

function main() {
  log('Starting npm publish process...');
  
  try {
    validateEnvironment();
    buildProject();
    publishToNpm();
    updateChangelogPostPublish();
    commitAndPushPostPublish();
    createGitHubRelease();
    
    const version = getPackageVersion();
    log(`🎉 Package v${version} published successfully to npm!`);
  } catch (err) {
    error(`Publish failed: ${err.message}`);
  }
}

// Run the publish process
if (require.main === module) {
  main();
}

module.exports = {
  validateEnvironment,
  buildProject,
  publishToNpm,
  updateChangelogPostPublish,
  commitAndPushPostPublish,
  createGitHubRelease,
  getPackageVersion
};