## <small>0.0.4 (2025-05-26)</small>

* fix(bin): command ([1db07fb](https://github.com/BoomLinkAi/image-worker-mcp/commit/1db07fb))
* fix(typing): config ([f47d2f8](https://github.com/BoomLinkAi/image-worker-mcp/commit/f47d2f8))
* refactor(service): cloudflare ([98d0e3c](https://github.com/BoomLinkAi/image-worker-mcp/commit/98d0e3c))
* refactor(tools): upload_image ([2d66c09](https://github.com/BoomLinkAi/image-worker-mcp/commit/2d66c09))
* feat(git): git-hook ([6492a5e](https://github.com/BoomLinkAi/image-worker-mcp/commit/6492a5e))
* feat(package): package.json ([5a4c4d5](https://github.com/BoomLinkAi/image-worker-mcp/commit/5a4c4d5))
* feat(release): release-helpers ([f8eab73](https://github.com/BoomLinkAi/image-worker-mcp/commit/f8eab73))
* feat(tool): heif-support ([73cea02](https://github.com/BoomLinkAi/image-worker-mcp/commit/73cea02))
* feat(tool): image-resize output ([dd4028a](https://github.com/BoomLinkAi/image-worker-mcp/commit/dd4028a))
* feat(upload): upload_image ([4f3ea9f](https://github.com/BoomLinkAi/image-worker-mcp/commit/4f3ea9f))
* chore(npm): publish 0.0.3 ([98b8f6c](https://github.com/BoomLinkAi/image-worker-mcp/commit/98b8f6c))
* ci(ci): github-action ([50875f7](https://github.com/BoomLinkAi/image-worker-mcp/commit/50875f7))
* chore:mcp-server ([db9cb70](https://github.com/BoomLinkAi/image-worker-mcp/commit/db9cb70))
* feat:image-worker ([ba54015](https://github.com/BoomLinkAi/image-worker-mcp/commit/ba54015))
* Initial commit ([69f0cce](https://github.com/BoomLinkAi/image-worker-mcp/commit/69f0cce))



# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.0.4] - 2025-05-26

### Changed
- Release version 0.0.4


## [0.0.3] - 2025-05-25
### Added
- Support heic/heif images using `libheif-js`.
- Add `outputImage`option to `resize_image` tool (default: false) to save token usage.

## [0.0.2] - 2025-05-23
### Added
- Add github link.

## [0.0.1] - 2025-05-23
### Fixed
- Fix `image-worker-mcp: command not found`.

## [0.0.0] - 2025-05-23
### Added
- Initial release of `@boomlinkai/image-worker-mcp`.
- Core functionality for image resizing and transformation via MCP.
