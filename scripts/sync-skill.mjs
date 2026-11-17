// Copies the canonical skill into the extension so the options page can offer it.
// Run after editing skills/youtube-to-skill/SKILL.md:  npm run sync
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'skills/youtube-to-skill/SKILL.md');
const dest = join(root, 'extension/skill/youtube-to-skill/SKILL.md');
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('Synced', src, '->', dest);
