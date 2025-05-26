#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Update version script - updates both package.json and src/version.ts
 * This script ensures version consistency across all files
 */

function log(message) {
  console.log(`[UPDATE-VERSION] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
}

function updateVersionFile(version) {
  const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');
  const content = `export const VERSION = '${version}';\n`;
  
  fs.writeFileSync(versionFilePath, content);
  log(`Updated src/version.ts to version ${version}`);
}

function getPackageVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

function main() {
  const versionType = process.argv[2];
  
  if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
    error('Usage: node update-version.js <patch|minor|major>');
  }
  
  log(`Updating version with type: ${versionType}`);
  
  try {
    // Update package.json version
    execSync(`npm version ${versionType} --no-git-tag-version`, { stdio: 'inherit' });
    
    // Get the new version
    const newVersion = getPackageVersion();
    log(`Package.json updated to version ${newVersion}`);
    
    // Update src/version.ts
    updateVersionFile(newVersion);
    
    // Stage the changes
    execSync('git add package.json src/version.ts', { stdio: 'inherit' });
    
    log(`✅ Version updated to ${newVersion} in both package.json and src/version.ts`);
    log('Files have been staged for commit');
    
  } catch (err) {
    error(`Failed to update version: ${err.message}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateVersionFile, getPackageVersion };