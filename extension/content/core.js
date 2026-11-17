// Shared namespace, settings and small helpers.
// Content scripts are classic scripts that share one isolated-world global,
// so every file attaches to globalThis.Y2S.

(() => {
  const Y2S = (globalThis.Y2S = globalThis.Y2S || {});

  Y2S.DEFAULTS = {
    target: 'claude', // 'claude' | 'chatgpt'
    embedInstructions: true, // include the condensed instructions in the prompt
    includeTimestamps: true,
    preferredLanguage: '', // '' = the video's own captions
    defaultGoal: ''
  };

  // Both open the official website in a new tab; the extension pastes the
  // prompt into the message box there and the user presses Send.
  Y2S.TARGETS = {
    claude: { label: 'Claude', site: 'claude.ai', url: 'https://claude.ai/new' },
    chatgpt: { label: 'ChatGPT', site: 'chatgpt.com', url: 'https://chatgpt.com/' }
  };

  // Settings saved by earlier versions (desktop-app and copy-only targets).
  Y2S.normalizeTarget = (t) => (String(t || '').startsWith('chatgpt') ? 'chatgpt' : 'claude');

  Y2S.getSettings = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.sync.get(Y2S.DEFAULTS, (items) =>
          resolve({ ...Y2S.DEFAULTS, ...(items || {}) })
        );
      } catch (e) {
        resolve({ ...Y2S.DEFAULTS });
      }
    });

  Y2S.saveSettings = (patch) =>
    new Promise((resolve) => {
      try {
        chrome.storage.sync.set(patch, resolve);
      } catch (e) {
        resolve();
      }
    });

  // 61000 -> "01:01", 3723000 -> "1:02:03"
  Y2S.formatTime = (ms) => {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  // "1:02:03" -> 3723, "4:05" -> 245
  Y2S.parseClock = (str) => {
    const parts = String(str || '')
      .trim()
      .split(':')
      .map((p) => parseInt(p, 10));
    if (!parts.length || parts.some((n) => Number.isNaN(n))) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  };

  Y2S.decodeEntities = (str) =>
    String(str || '')
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');

  const ID_RE = /^[A-Za-z0-9_-]{11}$/;

  // Accepts watch, shorts, live and embed URLs (absolute or relative).
  Y2S.videoIdFromUrl = (href) => {
    if (!href) return null;
    let url;
    try {
      url = new URL(href, 'https://www.youtube.com');
    } catch (e) {
      return null;
    }
    let id = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1, 12);
    else if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
      if (m) id = m[2];
    }
    return id && ID_RE.test(id) ? id : null;
  };

  // Letters that NFKD does not split into base letter + accent.
  const TRANSLIT = { ı: 'i', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ł: 'l', þ: 'th', ð: 'd' };

  Y2S.slugify = (title) =>
    String(title || 'video')
      .toLowerCase()
      .replace(/[ıøæœßđłþð]/g, (c) => TRANSLIT[c])
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'video';

  Y2S.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
})();
