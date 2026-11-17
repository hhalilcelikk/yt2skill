#!/usr/bin/env sh
# Builds dist/yt2skill-extension.zip (for the Chrome Web Store or sharing)
# and dist/youtube-to-skill.zip (the skill folder, for uploading to Claude).
set -e
cd "$(dirname "$0")/.."
node scripts/sync-skill.mjs
rm -rf dist && mkdir -p dist
(cd extension && zip -qr ../dist/yt2skill-extension.zip . -x '.*')
(cd skills && zip -qr ../dist/youtube-to-skill.zip youtube-to-skill -x '.*')
echo "Built:"
ls -l dist
