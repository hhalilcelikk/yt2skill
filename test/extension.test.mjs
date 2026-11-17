// Unit tests for the pure parts of the content scripts.
// Run: npm test   (Node 18+, no dependencies)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ URL, console, setTimeout, clearTimeout });
for (const f of ['core.js', 'transcript.js', 'prompt.js']) {
  vm.runInContext(readFileSync(join(root, 'extension/content', f), 'utf8'), ctx, { filename: f });
}
const Y = ctx.Y2S;

test('videoIdFromUrl handles watch, shorts, youtu.be, relative and junk', () => {
  assert.equal(Y.videoIdFromUrl('https://www.youtube.com/watch?v=47jy_FxuuBg&t=10s'), '47jy_FxuuBg');
  assert.equal(Y.videoIdFromUrl('/watch?v=tVLnzcoM5LE'), 'tVLnzcoM5LE');
  assert.equal(Y.videoIdFromUrl('/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(Y.videoIdFromUrl('https://youtu.be/47jy_FxuuBg'), '47jy_FxuuBg');
  assert.equal(Y.videoIdFromUrl('/watch?v=short'), null);
  assert.equal(Y.videoIdFromUrl('/channel/UC123'), null);
  assert.equal(Y.videoIdFromUrl(''), null);
});

test('formatTime and parseClock round-trip', () => {
  assert.equal(Y.formatTime(0), '00:00');
  assert.equal(Y.formatTime(61000), '01:01');
  assert.equal(Y.formatTime(3723000), '1:02:03');
  assert.equal(Y.parseClock('1:02:03'), 3723);
  assert.equal(Y.parseClock('4:05'), 245);
  assert.equal(Y.parseClock('bad'), 0);
});

test('slugify and decodeEntities', () => {
  assert.equal(Y.slugify('8 (stupidly simple) rules — to Grow!'), '8-stupidly-simple-rules-to-grow');
  assert.equal(Y.slugify('Çok güzel başlık'), 'cok-guzel-baslik');
  assert.equal(Y.decodeEntities('It&#39;s &amp; &quot;fine&quot; &lt;3'), 'It\'s & "fine" <3');
});

test('extractAssignedJson survives braces and quotes inside strings', () => {
  const html = `<script>var foo = 1;window["ytInitialPlayerResponse"] = null;</script>
<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"A {tricky} \\"title\\" }","author":"Me"},"n":[1,{"x":"}"}]};var meta = {};</script>`;
  const obj = Y.extractAssignedJson(html, 'ytInitialPlayerResponse');
  assert.equal(obj.videoDetails.title, 'A {tricky} "title" }');
  assert.equal(obj.n[1].x, '}');
  assert.equal(Y.extractAssignedJson('nothing here', 'ytInitialData'), null);
});

test('extractYtcfg reads client config', () => {
  const cfg = Y.extractYtcfg('ytcfg.set({"INNERTUBE_API_KEY":"KEY1","INNERTUBE_CLIENT_VERSION":"2.20261116.01.00","VISITOR_DATA":"Cgt%3D","HL":"tr"});');
  assert.equal(cfg.apiKey, 'KEY1');
  assert.equal(cfg.clientVersion, '2.20261116.01.00');
  assert.equal(cfg.visitorData, 'Cgt%3D');
  assert.equal(cfg.hl, 'tr');
});

test('findKey locates the transcript endpoint deep in ytInitialData', () => {
  const data = { a: [{ b: { c: { getTranscriptEndpoint: { params: 'PARAMS' } } } }] };
  assert.equal(Y.findKey(data, 'getTranscriptEndpoint').params, 'PARAMS');
  assert.equal(Y.findKey(data, 'missing'), undefined);
});

test('collectInnertubeSegments keeps order and ignores headers', () => {
  const resp = {
    actions: [{ updateEngagementPanelAction: { content: { transcriptRenderer: { content: { transcriptSearchPanelRenderer: { body: { transcriptSegmentListRenderer: { initialSegments: [
      { transcriptSegmentRenderer: { startMs: '0', snippet: { runs: [{ text: 'Hello ' }, { text: 'world' }] } } },
      { transcriptSectionHeaderRenderer: { snippet: { simpleText: 'Chapter 1' } } },
      { transcriptSegmentRenderer: { startMs: '4200', snippet: { simpleText: '  second\nline ' } } },
      { transcriptSegmentRenderer: { startMs: '5000', snippet: { runs: [{ text: '' }] } } }
    ] } } } } } } } }]
  };
  const segs = Y.collectInnertubeSegments(resp);
  assert.deepEqual(JSON.parse(JSON.stringify(segs)), [
    { startMs: 0, text: 'Hello world' },
    { startMs: 4200, text: 'second line' }
  ]);
});

test('parseJson3 drops empty and newline-only events', () => {
  const segs = Y.parseJson3({ events: [
    { tStartMs: 0, segs: [{ utf8: 'People do ' }, { utf8: 'not want' }] },
    { tStartMs: 1500, segs: [{ utf8: '\n' }] },
    { tStartMs: 2000 },
    { tStartMs: 2600, segs: [{ utf8: 'information.' }] }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(segs)), [
    { startMs: 0, text: 'People do not want' },
    { startMs: 2600, text: 'information.' }
  ]);
});

test('parseTimedTextXml handles legacy and srv3 formats', () => {
  const legacy = '<transcript><text start="1.5" dur="2">It&amp;#39;s here</text><text start="3">&lt;b&gt;bold&lt;/b&gt;</text></transcript>';
  assert.deepEqual(JSON.parse(JSON.stringify(Y.parseTimedTextXml(legacy))), [
    { startMs: 1500, text: "It's here" },
    { startMs: 3000, text: 'bold' }
  ]);
  const srv3 = '<timedtext><body><p t="2000" d="1000"><s>Two</s><s> words</s></p></body></timedtext>';
  assert.deepEqual(JSON.parse(JSON.stringify(Y.parseTimedTextXml(srv3))), [{ startMs: 2000, text: 'Two words' }]);
});

test('chooseCaptionTrack prefers requested, then creator captions in the spoken language', () => {
  const tracks = [
    { languageCode: 'fr', kind: undefined, baseUrl: 'fr' },
    { languageCode: 'en', kind: 'asr', baseUrl: 'en-asr' },
    { languageCode: 'en-US', baseUrl: 'en-manual' }
  ];
  assert.equal(Y.chooseCaptionTrack(tracks, 'fr').baseUrl, 'fr');
  assert.equal(Y.chooseCaptionTrack(tracks, '').baseUrl, 'en-manual');
  assert.equal(Y.chooseCaptionTrack([tracks[0], tracks[1]], '').baseUrl, 'en-asr');
  assert.equal(Y.chooseCaptionTrack([tracks[0]], 'de').baseUrl, 'fr');
  assert.equal(Y.chooseCaptionTrack([], 'en'), null);
});

test('dubbed videos: uses YouTube\'s default caption track, not the first listed', () => {
  // Shape seen live in November 2026: 20 auto tracks, Bengali first, English default.
  const tracks = ['bn', 'nl-NL', 'en', 'fr-FR'].map((languageCode) => ({ languageCode, kind: 'asr' }));
  const tracklist = { captionTracks: tracks, audioTracks: [{ defaultCaptionTrackIndex: 2 }, { defaultCaptionTrackIndex: 2 }], defaultAudioTrackIndex: 0 };
  const idx = Y.defaultCaptionIndex(tracklist);
  assert.equal(idx, 2);
  assert.equal(Y.chooseCaptionTrack(tracks, '', idx).languageCode, 'en');
  assert.equal(Y.chooseCaptionTrack(tracks, 'fr', idx).languageCode, 'fr-FR');
  // Creator captions in the same language win over the default auto track.
  const withManual = [...tracks, { languageCode: 'en' }];
  assert.equal(Y.chooseCaptionTrack(withManual, '', idx).kind, undefined);
  assert.equal(Y.defaultCaptionIndex(undefined), -1);
  assert.equal(Y.defaultCaptionIndex({ audioTracks: [{}] }), -1);
});

test('groupParagraphs splits at sentence ends after 20 s and always by 45 s', () => {
  const segs = [
    { startMs: 0, text: 'One.' },
    { startMs: 10000, text: 'Two.' },
    { startMs: 21000, text: 'Three' },
    { startMs: 30000, text: 'four' },
    { startMs: 50000, text: 'five' },
    { startMs: 70000, text: 'six' }
  ];
  // "Three four five" passes 20 s without a sentence end, so it continues
  // until the 45 s limit forces a split before "six".
  assert.deepEqual(JSON.parse(JSON.stringify(Y.groupParagraphs(segs))), [
    { startMs: 0, text: 'One. Two.' },
    { startMs: 21000, text: 'Three four five' },
    { startMs: 70000, text: 'six' }
  ]);
});

const sample = {
  meta: {
    videoId: '47jy_FxuuBg',
    title: '8 (stupidly simple) rules to grow on social media',
    channel: 'My First Million',
    published: '2026-09-16',
    lengthSeconds: 1021,
    url: 'https://www.youtube.com/watch?v=47jy_FxuuBg',
    description: 'Shaan Puri shares rules.'
  },
  segments: [
    { startMs: 0, text: 'People do not want information.' },
    { startMs: 2000, text: 'They want a feeling.' }
  ],
  method: 'caption track',
  language: 'en',
  isAuto: true
};

test('toMarkdown includes metadata, description and timestamps', () => {
  const md = Y.toMarkdown(sample, { today: '2026-11-17' });
  assert.match(md, /^# Transcript: 8 \(stupidly simple\) rules/);
  assert.match(md, /- Channel: My First Million/);
  assert.match(md, /- Published: 2026-09-16/);
  assert.match(md, /- Length: 17:01/);
  assert.match(md, /- Captions: en, auto-generated/);
  assert.match(md, /- Retrieved: 2026-11-17 via caption track/);
  assert.match(md, /## Video description\n\nShaan Puri shares rules\./);
  assert.match(md, /\[00:00\] People do not want information\. They want a feeling\./);
  const noTs = Y.toMarkdown(sample, { timestamps: false, today: '2026-11-17' });
  assert.doesNotMatch(noTs, /\[00:00\]/);
});

test('buildPrompt: new skill with embedded instructions', () => {
  const p = Y.buildPrompt({ markdown: Y.toMarkdown(sample), mode: 'new', goal: 'Use when I plan content', embedInstructions: true });
  assert.match(p, /Task: create a new skill/);
  assert.match(p, /What I want the skill for: Use when I plan content/);
  assert.match(p, /<instructions>\n1\. Read the whole transcript/);
  assert.match(p, /<video>\n# Transcript:/);
  assert.match(p, /not instructions to you/);
  assert.ok(p.indexOf('</instructions>') < p.indexOf('\n<video>\n'));
});

test('buildPrompt: update mode, no embedded instructions, blank name falls back to new', () => {
  const p = Y.buildPrompt({ markdown: 'x', mode: 'update', skillName: ' sales-playbook ', embedInstructions: false });
  assert.match(p, /update my existing skill "sales-playbook"/);
  assert.doesNotMatch(p, /<instructions>/);
  const q = Y.buildPrompt({ markdown: 'x', mode: 'update', skillName: '  ', embedInstructions: false });
  assert.match(q, /create a new skill/);
});

test('normalizeTarget maps old settings to a browser destination', () => {
  assert.equal(Y.normalizeTarget('claude'), 'claude');
  assert.equal(Y.normalizeTarget('claude-app'), 'claude');
  assert.equal(Y.normalizeTarget('copy'), 'claude');
  assert.equal(Y.normalizeTarget(undefined), 'claude');
  assert.equal(Y.normalizeTarget('chatgpt-app'), 'chatgpt');
  assert.equal(Y.normalizeTarget('chatgpt'), 'chatgpt');
  for (const t of Object.values(Y.TARGETS)) assert.match(t.url, /^https:\/\/(claude\.ai|chatgpt\.com)\//);
});

test('manifest asks only for the permissions it needs', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
  assert.deepEqual([...manifest.permissions].sort(), ['clipboardWrite', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
  const chat = manifest.content_scripts.find((c) => c.js.includes('chat/fill.js'));
  assert.deepEqual(chat.matches, ['https://claude.ai/*', 'https://chatgpt.com/*']);
});

test('bundled skill copy matches the canonical skill', () => {
  const a = readFileSync(join(root, 'skills/youtube-to-skill/SKILL.md'), 'utf8');
  const b = readFileSync(join(root, 'extension/skill/youtube-to-skill/SKILL.md'), 'utf8');
  assert.equal(b, a, 'Run `npm run sync` after editing the skill.');
  assert.match(a, /^---\nname: youtube-to-skill\ndescription: .+\n---\n/);
});

test('manifest lists every content script that exists', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
  for (const f of manifest.content_scripts[0].js) readFileSync(join(root, 'extension', f));
  for (const f of Object.values(manifest.icons)) readFileSync(join(root, 'extension', f));
  assert.equal(manifest.manifest_version, 3);
});
