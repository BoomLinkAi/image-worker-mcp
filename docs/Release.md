# Release Process

This document describes the automated release process for publishing the package to npm.

## Overview

The release process follows this workflow:

1. **Local preparation**: Run `prepare-release.js` to generate changelog, commit changes, and push a version tag
2. **Automated publishing**: GitHub Actions detects the tag and runs `publish.js` to publish to npm
3. **Post-publish**: The publish script updates changelog and creates a GitHub release

## Scripts

### `scripts/prepare-release.js`

Prepares a release by:
- Validating environment (must be on main branch, clean working directory)
- Syncing version between package.json and src/version.ts
- Running tests, linting, and type checking
- Building the project
- Generating changelog using conventional-changelog with Angular preset
- Committing changelog and version changes
- Pushing changes to remote
- Creating and pushing a version tag (triggers GitHub Actions)

**Usage:**
```bash
npm run release:prepare
```

### `scripts/publish.js`

Publishes the package to npm (used by GitHub Actions):
- Validates environment (requires NPM_TOKEN and GITHUB_TOKEN)
- Builds the project
- Publishes to npm with public access
- Updates changelog with publication info
- Commits and pushes post-publish changes
- Creates a GitHub release

**Usage:**
```bash
npm run release:publish
```

## Release Process

### 1. Prepare for Release

First, ensure your changes are committed and you're on the main branch:

```bash
git checkout main
git pull origin main
```

### 2. Update Version

Update the version in package.json using one of these commands:

```bash
# For bug fixes
npm run version:patch

# For new features
npm run version:minor

# For breaking changes
npm run version:major
```

### 3. Prepare and Trigger Release

Run the prepare script which will handle everything:

```bash
npm run release:prepare
```

This will:
- Run all checks (tests, linting, type checking)
- Generate changelog
- Commit and push changes
- Create and push a version tag
- Trigger the GitHub Actions release workflow

### 4. Monitor Release

After pushing the tag, monitor the GitHub Actions workflow at:
`https://github.com/BoomLinkAi/image-worker-mcp/actions`

The workflow will:
- Run all tests and checks
- Build the project
- Publish to npm
- Create a GitHub release
- Update the changelog with publication info

## Environment Variables

### For GitHub Actions

Set these secrets in your GitHub repository settings:

- `NPM_TOKEN`: Your npm authentication token with publish permissions
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

### For Local Development

The prepare script doesn't require any special environment variables, but ensure you have:
- Git configured with your credentials
- Push access to the repository
- All dependencies installed (`pnpm install`)

## Troubleshooting

### Failed Release

If the GitHub Actions workflow fails:

1. Check the workflow logs in GitHub Actions
2. Fix any issues in the code
3. Delete the failed tag: `git tag -d v<version> && git push origin :refs/tags/v<version>`
4. Make necessary fixes and commit them
5. Run `npm run release:prepare` again

### Manual Recovery

If you need to manually publish after a partial failure:

1. Ensure the build is clean: `pnpm build`
2. Set npm token: `npm config set //registry.npmjs.org/:_authToken $NPM_TOKEN`
3. Publish: `npm publish --access public`

## Files Modified During Release

- `package.json`: Version number (manual update required)
- `Changelog.md`: Generated/updated automatically
- Git tags: Created automatically
- GitHub releases: Created automatically

## Best Practices

1. Always test your changes thoroughly before releasing
2. Use semantic versioning (patch/minor/major)
3. Write meaningful commit messages following conventional commits format
4. Review the generated changelog before the tag is pushed
5. Monitor the GitHub Actions workflow to ensure successful publication

## Conventional Commits

The changelog generation uses conventional-changelog with the Angular preset. For best results, use conventional commit messages:

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Common Types
- **feat**: A new feature (appears in "Features" section)
- **fix**: A bug fix (appears in "Bug Fixes" section)
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools

### Examples
```
feat(auth): add OAuth2 authentication
fix(api): handle null response in user endpoint
docs(readme): update installation instructions
chore(deps): update dependencies to latest versions
```

### Breaking Changes
Add `BREAKING CHANGE:` in the footer to indicate breaking changes:
```
feat(api): change user endpoint response format

BREAKING CHANGE: The user endpoint now returns an object instead of an array
```

## GitHub Actions Workflow

The release workflow (`.github/workflows/release.yml`) is triggered when a tag matching `v*` is pushed. It:

1. Checks out the repository with full history
2. Sets up Node.js and pnpm
3. Installs dependencies
4. Runs linting, type checking, and tests
5. Verifies the package.json version matches the tag
6. Builds the project
7. Publishes to npm using the publish script
8. Creates a GitHub release
9. Notifies of successful publication

## Security

- The NPM_TOKEN should have minimal required permissions (publish only)
- The workflow uses `id-token: write` for npm provenance
- Post-publish commits are made by the github-actions bot
- All sensitive tokens are stored as GitHub secrets