// Transcript extraction. Everything runs in the user's own browser on
// youtube.com, so requests carry the user's normal YouTube session and no
// server is involved.
//
// Three methods, tried in order until one returns text:
//   1. The endpoint YouTube's own "Show transcript" panel calls (get_transcript).
//   2. The caption track listed in the player response (timedtext).
//   3. Opening the transcript panel on the page and reading it (open video only).

(() => {
  const Y2S = globalThis.Y2S;

  // ---------- parsing helpers (pure, unit-tested) ----------

  // Finds `varName = {...}` in page HTML and parses the object literal.
  // Walks braces while respecting strings, so nested "}" inside text is safe.
  Y2S.extractAssignedJson = (text, varName) => {
    if (!text) return null;
    const re = new RegExp(varName.replace(/[$.]/g, '\\$&') + '\\s*=\\s*\\{', 'g');
    let match;
    while ((match = re.exec(text))) {
      const start = match.index + match[0].length - 1;
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let j = start; j < text.length; j++) {
        const c = text[j];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
          continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(start, j + 1));
            } catch (e) {
              break; // try the next occurrence
            }
          }
        }
      }
    }
    return null;
  };

  Y2S.extractYtcfg = (html) => {
    const get = (key) => {
      const m = String(html || '').match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'));
      return m ? m[1] : null;
    };
    return {
      apiKey: get('INNERTUBE_API_KEY'),
      clientVersion: get('INNERTUBE_CLIENT_VERSION') || get('INNERTUBE_CONTEXT_CLIENT_VERSION'),
      visitorData: get('VISITOR_DATA'),
      hl: get('HL') || 'en'
    };
  };

  // First value found for `key` anywhere in a JSON tree.
  Y2S.findKey = (root, key) => {
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (Object.prototype.hasOwnProperty.call(node, key)) return node[key];
      for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
    }
    return undefined;
  };

  const textOf = (s) => {
    if (!s) return '';
    if (typeof s === 'string') return s;
    if (s.simpleText != null) return String(s.simpleText);
    if (Array.isArray(s.runs)) return s.runs.map((r) => r.text || '').join('');
    if (s.content != null) return String(s.content);
    return '';
  };

  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  // Segments from a get_transcript response, in document order.
  // Matches transcriptSegmentRenderer and any object shaped {startMs, snippet}.
  Y2S.collectInnertubeSegments = (json) => {
    const out = [];
    const visit = (node) => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const seg = node.transcriptSegmentRenderer || (node.startMs != null && node.snippet ? node : null);
      if (seg) {
        const text = clean(textOf(seg.snippet));
        const startMs = Number(seg.startMs);
        if (text && Number.isFinite(startMs)) out.push({ startMs, text });
        return;
      }
      for (const v of Object.values(node)) visit(v);
    };
    visit(json);
    return out;
  };

  // timedtext ?fmt=json3
  Y2S.parseJson3 = (data) => {
    const out = [];
    for (const ev of (data && data.events) || []) {
      if (!Array.isArray(ev.segs)) continue;
      const text = clean(ev.segs.map((s) => s.utf8 || '').join(''));
      if (text) out.push({ startMs: Number(ev.tStartMs) || 0, text });
    }
    return out;
  };

  // timedtext XML: legacy <text start="1.2"> or srv3 <p t="1200">
  Y2S.parseTimedTextXml = (xml) => {
    const out = [];
    // Captions are often double-escaped (&amp;#39;) and may carry escaped
    // markup (&lt;b&gt;), so decode once, drop tags, then decode again.
    const strip = (s) =>
      clean(Y2S.decodeEntities(Y2S.decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/<[^>]+>/g, '')));
    let m;
    const legacy = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    while ((m = legacy.exec(xml))) {
      const start = /\bstart="([\d.]+)"/.exec(m[1]);
      const text = strip(m[2]);
      if (text) out.push({ startMs: start ? Math.round(parseFloat(start[1]) * 1000) : 0, text });
    }
    if (out.length) return out;
    const srv3 = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
    while ((m = srv3.exec(xml))) {
      const t = /\bt="(\d+)"/.exec(m[1]);
      const text = strip(m[2]);
      if (text) out.push({ startMs: t ? Number(t[1]) : 0, text });
    }
    return out;
  };

  // Index of the caption track YouTube itself selects by default. Needed
  // because videos with AI-dubbed audio list many auto-caption tracks and
  // the original language is not necessarily first.
  Y2S.defaultCaptionIndex = (tracklist) => {
    if (!tracklist || !Array.isArray(tracklist.audioTracks)) return -1;
    const audio = tracklist.audioTracks[tracklist.defaultAudioTrackIndex || 0] || tracklist.audioTracks[0];
    const idx = audio ? Number(audio.defaultCaptionTrackIndex) : NaN;
    return Number.isInteger(idx) ? idx : -1;
  };

  // Prefer: the requested language; then YouTube's default track; then
  // creator captions in the spoken language; then auto-captions.
  Y2S.chooseCaptionTrack = (tracks, preferred, defaultIndex = -1) => {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const lang = (t) => String(t.languageCode || '').toLowerCase();
    const base = (t) => lang(t).split('-')[0];
    const manual = tracks.filter((t) => t.kind !== 'asr');
    const auto = tracks.filter((t) => t.kind === 'asr');
    if (preferred) {
      const p = preferred.toLowerCase();
      const hit = (list) => list.find((t) => lang(t) === p || base(t) === p.split('-')[0]);
      const found = hit(manual) || hit(auto);
      if (found) return found;
    }
    if (defaultIndex >= 0 && tracks[defaultIndex]) {
      const def = tracks[defaultIndex];
      // Upgrade to creator captions in the same language when they exist.
      return (def.kind === 'asr' && manual.find((t) => base(t) === base(def))) || def;
    }
    if (auto.length) return manual.find((t) => base(t) === base(auto[0])) || auto[0];
    return manual[0];
  };

  Y2S.buildMeta = (player, videoId) => {
    const d = (player && player.videoDetails) || {};
    const mf = (player && player.microformat && player.microformat.playerMicroformatRenderer) || {};
    return {
      videoId,
      title: d.title || textOf(mf.title) || '',
      channel: d.author || mf.ownerChannelName || '',
      published: String(mf.publishDate || mf.uploadDate || '').slice(0, 10),
      lengthSeconds: Number(d.lengthSeconds) || 0,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      description: d.shortDescription || textOf(mf.description) || ''
    };
  };

  // Merge caption fragments into readable paragraphs of roughly 20-45 s.
  Y2S.groupParagraphs = (segments, opts = {}) => {
    const minMs = opts.minMs != null ? opts.minMs : 20000;
    const maxMs = opts.maxMs != null ? opts.maxMs : 45000;
    const paras = [];
    let cur = null;
    for (const s of segments) {
      if (!cur) {
        cur = { startMs: s.startMs, parts: [s.text] };
        continue;
      }
      const span = s.startMs - cur.startMs;
      const last = cur.parts[cur.parts.length - 1];
      const endsSentence = /[.!?…]["')\]]?$/.test(last);
      if (span >= maxMs || (span >= minMs && endsSentence)) {
        paras.push(cur);
        cur = { startMs: s.startMs, parts: [s.text] };
      } else cur.parts.push(s.text);
    }
    if (cur) paras.push(cur);
    return paras.map((p) => ({ startMs: p.startMs, text: clean(p.parts.join(' ')) }));
  };

  Y2S.toMarkdown = (result, opts = {}) => {
    const timestamps = opts.timestamps !== false;
    const m = result.meta || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const captions = [
      result.language || 'default language',
      result.isAuto == null ? null : result.isAuto ? 'auto-generated' : 'creator-provided'
    ]
      .filter(Boolean)
      .join(', ');
    const lines = [`# Transcript: ${m.title || m.videoId}`, ''];
    lines.push(`- Video: ${m.url}`);
    if (m.channel) lines.push(`- Channel: ${m.channel}`);
    if (m.published) lines.push(`- Published: ${m.published}`);
    if (m.lengthSeconds) lines.push(`- Length: ${Y2S.formatTime(m.lengthSeconds * 1000)}`);
    lines.push(`- Captions: ${captions}`);
    lines.push(`- Retrieved: ${today} via ${result.method}`);
    const desc = String(m.description || '').trim();
    if (desc) {
      lines.push('', '## Video description', '');
      lines.push(desc.length > 2500 ? desc.slice(0, 2500) + ' […]' : desc);
    }
    lines.push('', '## Transcript', '');
    for (const p of Y2S.groupParagraphs(result.segments)) {
      lines.push(timestamps ? `[${Y2S.formatTime(p.startMs)}] ${p.text}` : p.text, '');
    }
    return lines.join('\n').trim() + '\n';
  };

  // ---------- network / DOM (runs in the browser) ----------

  const fetchWithTimeout = async (url, init = {}, ms = 20000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { credentials: 'include', ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  // Reads the transcript panel. Supports the layout introduced in 2026
  // (transcript-segment-view-model) and the older ytd-transcript-segment-renderer.
  const readPanel = () => {
    const read = (selector, tsSel, textSel) =>
      Array.from(document.querySelectorAll(selector))
        .map((el) => {
          const ts = (el.querySelector(tsSel) || {}).textContent || '0:00';
          const text = clean((el.querySelector(textSel) || {}).textContent);
          return { startMs: Y2S.parseClock(ts) * 1000, text };
        })
        .filter((s) => s.text);
    const modern = read(
      'transcript-segment-view-model',
      '.ytwTranscriptSegmentViewModelTimestamp',
      '.ytAttributedStringHost'
    );
    return modern.length ? modern : read('ytd-transcript-segment-renderer', '.segment-timestamp', '.segment-text');
  };

  const openPanel = () => {
    const btn = document.querySelector(
      'ytd-video-description-transcript-section-renderer button, button[aria-label="Show transcript"]'
    );
    if (!btn) return false;
    btn.click();
    return true;
  };

  // The newer panel has Chapters / Transcript tabs; make sure Transcript is shown.
  const selectTranscriptTab = () => {
    const tab = Array.from(document.querySelectorAll('button[role="tab"]')).find(
      (b) => /transcript/i.test(b.textContent || '') && b.getAttribute('aria-selected') !== 'true'
    );
    if (tab) tab.click();
  };

  Y2S.getTranscript = async (videoId, opts = {}, onStatus = () => {}) => {
    onStatus('Loading video data…');
    const res = await fetchWithTimeout(`/watch?v=${encodeURIComponent(videoId)}`);
    if (!res.ok) throw new Error(`Could not load the video page (HTTP ${res.status}).`);
    const html = await res.text();

    const player = Y2S.extractAssignedJson(html, 'ytInitialPlayerResponse');
    const initialData = Y2S.extractAssignedJson(html, 'ytInitialData');
    const cfg = Y2S.extractYtcfg(html);
    const meta = Y2S.buildMeta(player, videoId);
    if (!meta.title && Y2S.videoIdFromUrl(location.href) === videoId) {
      meta.title = document.title.replace(/\s*-\s*YouTube\s*$/, '');
    }

    const tracklist = player && player.captions && player.captions.playerCaptionsTracklistRenderer;
    const tracks = (tracklist && tracklist.captionTracks) || [];
    const track = Y2S.chooseCaptionTrack(tracks, opts.preferredLanguage, Y2S.defaultCaptionIndex(tracklist));
    const isOpenVideo = Y2S.videoIdFromUrl(location.href) === videoId;
    const endpoint = Y2S.findKey(initialData, 'getTranscriptEndpoint');

    const viaInnertube = async () => {
      if (!endpoint || !endpoint.params) throw new Error('no transcript endpoint on the page');
      if (!cfg.clientVersion) throw new Error('client version not found');
      const url =
        '/youtubei/v1/get_transcript?prettyPrint=false' +
        (cfg.apiKey ? '&key=' + encodeURIComponent(cfg.apiKey) : '');
      const client = { clientName: 'WEB', clientVersion: cfg.clientVersion, hl: cfg.hl };
      if (cfg.visitorData) client.visitorData = cfg.visitorData;
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Youtube-Client-Name': '1',
          'X-Youtube-Client-Version': cfg.clientVersion
        },
        body: JSON.stringify({ context: { client }, params: endpoint.params })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const segments = Y2S.collectInnertubeSegments(await r.json());
      if (!segments.length) throw new Error('empty response');
      return { segments, method: 'YouTube transcript API' };
    };

    const viaCaptionTrack = async () => {
      if (!track || !track.baseUrl) throw new Error('no caption tracks');
      const base = new URL(track.baseUrl, 'https://www.youtube.com');
      for (const fmt of ['json3', '']) {
        const u = new URL(base.toString());
        if (fmt) u.searchParams.set('fmt', fmt);
        else u.searchParams.delete('fmt');
        const r = await fetchWithTimeout(u.toString());
        if (!r.ok) continue;
        const body = await r.text();
        if (!body.trim()) continue;
        let segments = [];
        if (fmt === 'json3') {
          try {
            segments = Y2S.parseJson3(JSON.parse(body));
          } catch (e) {
            segments = [];
          }
        } else segments = Y2S.parseTimedTextXml(body);
        if (segments.length)
          return {
            segments,
            method: 'caption track',
            language: track.languageCode,
            isAuto: track.kind === 'asr'
          };
      }
      throw new Error('caption track returned no text');
    };

    const viaPanel = async () => {
      if (!isOpenVideo) throw new Error('only works on the video open in this tab');
      let segments = readPanel();
      if (!segments.length) {
        // The button can take a moment to render after navigation.
        let opened = openPanel();
        for (let i = 0; i < 20 && !opened; i++) {
          await Y2S.sleep(250);
          opened = openPanel();
        }
        if (!opened) throw new Error('"Show transcript" button not found');
        for (let i = 0; i < 60 && !segments.length; i++) {
          await Y2S.sleep(250);
          if (i === 4) selectTranscriptTab();
          segments = readPanel();
        }
      }
      if (!segments.length) throw new Error('transcript panel stayed empty');
      // Long transcripts render progressively; wait until the count settles.
      for (let i = 0, last = 0; i < 12 && segments.length !== last; i++) {
        last = segments.length;
        await Y2S.sleep(400);
        segments = readPanel();
      }
      return { segments, method: 'transcript panel on the page' };
    };

    // As of November 2026 YouTube rejects direct transcript and caption
    // requests for many videos, while its own panel still works. So the
    // panel goes first whenever the video is open in this tab.
    const methods = [];
    if (isOpenVideo && !opts.preferredLanguage) methods.push(['page panel', viaPanel]);
    if (opts.preferredLanguage) methods.push(['caption track', viaCaptionTrack], ['transcript API', viaInnertube]);
    else methods.push(['transcript API', viaInnertube], ['caption track', viaCaptionTrack]);
    if (isOpenVideo && opts.preferredLanguage) methods.push(['page panel', viaPanel]);

    const failures = [];
    for (const [name, fn] of methods) {
      onStatus(`Fetching transcript (${name})…`);
      try {
        const got = await fn();
        return {
          meta,
          segments: got.segments,
          method: got.method,
          language: got.language || (track && track.languageCode) || '',
          isAuto: got.isAuto != null ? got.isAuto : track ? track.kind === 'asr' : null
        };
      } catch (e) {
        failures.push(`${name}: ${e.message}`);
      }
    }

    const noCaptions = !tracks.length && !endpoint;
    const err = new Error(
      noCaptions
        ? 'This video has no captions, so there is no transcript to read.'
        : isOpenVideo
          ? 'Could not read the transcript. YouTube may have changed its page.'
          : 'YouTube did not allow reading this transcript from here.'
    );
    err.details = failures;
    err.noCaptions = noCaptions;
    err.canOpenVideo = !noCaptions && !isOpenVideo;
    throw err;
  };
})();
