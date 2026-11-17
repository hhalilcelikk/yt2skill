// UI: the bookmark ribbon over thumbnails and the index-card drawer.
// Everything lives in one Shadow DOM host so YouTube's styles cannot leak in.
// YouTube enforces Trusted Types, so nothing here uses innerHTML: every node
// is built with createElement / createElementNS.
//
// Design: a library index card. Warm paper, ink, one vermilion accent,
// typewriter labels, a serif for content, hard offset shadows.

(() => {
  const Y2S = globalThis.Y2S;

  // ---------- DOM helpers ----------

  const h = (tag, props, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  };

  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs, ...kids) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    kids.forEach((k) => el.append(k));
    return el;
  };
  const plusGlyph = () =>
    s('svg', { viewBox: '0 0 12 12', width: 11, height: 11, 'aria-hidden': 'true' },
      s('path', { d: 'M6 1.5v9M1.5 6h9', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'square', fill: 'none' }));

  // ---------- styles ----------

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; }

.k {
  --paper: #f2ede3; --paper-2: #ebe4d6; --ink: #1c1b19; --muted: #6e675c;
  --rule: #d6ccba; --red: #d23b1f; --red-ink: #fbf6ee; --shadow: #1c1b19;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --serif: "Iowan Old Style", "Charter", "Palatino Linotype", Palatino, Georgia, serif;
}
.k.dark {
  --paper: #1f1e1b; --paper-2: #282622; --ink: #ece5d6; --muted: #a39a8b;
  --rule: #3b3732; --red: #e5583a; --red-ink: #1a1917; --shadow: #000;
}

/* ---- bookmark ribbon (hover button) ---- */
.ribbon {
  position: fixed; display: none; z-index: 2147483647;
  width: 26px; height: 34px; padding: 6px 0 0; border: 0; cursor: pointer;
  background: var(--red); color: var(--red-ink);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
  align-items: flex-start; justify-content: center;
  transform-origin: top center; animation: drop .16s ease-out;
}
.ribbon.show { display: flex; }
.ribbon:hover, .ribbon:focus-visible { height: 40px; outline: none; }
.tag {
  position: fixed; display: none; z-index: 2147483647; pointer-events: none;
  font: 600 10.5px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase;
  padding: 6px 8px; background: var(--ink); color: var(--paper); white-space: nowrap;
}
.tag.show { display: block; }
@keyframes drop { from { transform: scaleY(.4); } to { transform: scaleY(1); } }

/* ---- the card ---- */
.card {
  position: fixed; top: 72px; right: 18px; z-index: 2147483647;
  width: 392px; max-width: calc(100vw - 36px); max-height: calc(100vh - 90px);
  display: none; flex-direction: column;
  background: var(--paper); color: var(--ink);
  border: 1.5px solid var(--ink); box-shadow: 6px 6px 0 var(--shadow);
  font: 14px/1.45 var(--serif);
}
.card.show { display: flex; animation: slide .2s cubic-bezier(.2,.7,.3,1); }
@keyframes slide { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .card.show, .ribbon { animation: none; } }

.strip {
  display: flex; align-items: center; gap: 10px; padding: 9px 14px 8px;
  border-bottom: 1.5px dashed var(--rule);
  font: 600 10.5px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
}
.strip .brand { color: var(--ink); }
.strip .brand b { color: var(--red); font-weight: 700; }
.strip .no { margin-left: auto; letter-spacing: .04em; text-transform: none; }
.x {
  border: 0; background: none; color: var(--ink); cursor: pointer;
  font: 400 20px/1 var(--mono); padding: 0 0 2px 6px;
}
.x:hover { color: var(--red); }

.body { padding: 16px 18px 18px; overflow: auto; }
.title { font: 600 19px/1.25 var(--serif); letter-spacing: -.005em; }
.meta { margin-top: 6px; font: 11.5px/1.4 var(--mono); color: var(--muted); }

.status { margin-top: 14px; font: 12px/1.5 var(--mono); color: var(--ink); min-height: 18px; }
.status.err { color: var(--red); }
.status.busy::after { content: "▍"; margin-left: 2px; animation: blink 1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }

.preview {
  margin-top: 12px; padding: 2px 0 2px 12px; border-left: 2px solid var(--red);
  font: italic 13.5px/1.5 var(--serif); color: var(--muted);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}

.form { margin-top: 18px; border-top: 1.5px solid var(--ink); }
.row {
  display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 10px;
  padding: 11px 0; border-bottom: 1px solid var(--rule);
}
.row.top { align-items: start; }
.lbl { font: 600 10.5px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); padding-top: 1px; }

.seg { display: inline-flex; border: 1.5px solid var(--ink); }
.seg + .seg { margin-left: 8px; }
.seg button {
  border: 0; background: transparent; color: var(--ink); cursor: pointer;
  font: 600 11px/1 var(--mono); letter-spacing: .06em; text-transform: uppercase; padding: 7px 10px;
}
.seg button + button { border-left: 1.5px solid var(--ink); }
.seg button[aria-checked="true"] { background: var(--ink); color: var(--paper); }
.seg button:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }

.line {
  width: 100%; border: 0; border-bottom: 1.5px dotted var(--muted); background: transparent;
  color: var(--ink); font: 14px/1.5 var(--serif); padding: 3px 0; outline: none; resize: none;
}
.line::placeholder { color: var(--muted); font-style: italic; opacity: .85; }
.line:focus { border-bottom: 1.5px solid var(--red); }
textarea.line { min-height: 46px; }
.sub { margin-top: 8px; }

details { padding: 10px 0 0; }
summary {
  cursor: pointer; list-style: none; font: 600 10.5px/1 var(--mono);
  letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
}
summary::-webkit-details-marker { display: none; }
summary::before { content: "+ "; }
details[open] summary::before { content: "− "; }
.check { display: flex; gap: 9px; align-items: flex-start; margin-top: 10px; font: 13px/1.4 var(--serif); }
.check input { accent-color: var(--red); margin-top: 3px; }

.stamp {
  width: 100%; margin-top: 18px; padding: 13px 14px; cursor: pointer;
  border: 1.5px solid var(--ink); background: var(--red); color: var(--red-ink);
  box-shadow: 3px 3px 0 var(--shadow);
  font: 700 12.5px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; text-align: left;
  display: flex; justify-content: space-between; align-items: center;
}
.stamp:hover { filter: brightness(1.05); }
.stamp:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--shadow); }
.stamp:disabled { background: var(--paper-2); color: var(--muted); cursor: default; transform: none; box-shadow: 3px 3px 0 var(--rule); border-color: var(--rule); }
.stamp kbd { font: 500 10.5px/1 var(--mono); letter-spacing: .04em; opacity: .75; }
.note { margin-top: 8px; font: 11.5px/1.45 var(--mono); color: var(--muted); }

.links { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 4px 14px; font: 12px/1.4 var(--mono); }
.links button, .links a {
  border: 0; background: none; padding: 0; color: var(--ink); cursor: pointer;
  font: inherit; text-decoration: underline; text-decoration-color: var(--rule);
  text-underline-offset: 3px; text-decoration-thickness: 1.5px;
}
.links button:hover, .links a:hover { color: var(--red); text-decoration-color: var(--red); }
.links button:disabled { color: var(--muted); cursor: default; text-decoration: none; }

.fallback { margin-top: 12px; padding: 10px 12px; background: var(--paper-2); font: 12px/1.5 var(--mono); color: var(--ink); }
.fallback a { color: var(--red); cursor: pointer; }

.empty { margin-top: 10px; font: 14px/1.5 var(--serif); color: var(--muted); }
.fine { margin-top: 16px; font: 10.5px/1.45 var(--mono); color: var(--muted); letter-spacing: .02em; }
pre { white-space: pre-wrap; font: 11px/1.4 var(--mono); color: var(--muted); margin-top: 6px; }
`;

  // ---------- host ----------

  let host, root, wrap, ribbon, tag, card;
  let hoverVideoId = null;

  const isDark = () => document.documentElement.hasAttribute('dark');

  const ensureHost = () => {
    if (host && host.isConnected) return;
    host = document.createElement('yt2skill-root');
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.append(h('style', null, CSS));
    wrap = h('div', { class: 'k' });
    ribbon = h(
      'button',
      {
        class: 'ribbon',
        'aria-label': 'Make a skill from this video',
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = hoverVideoId;
          Y2S.ui.hideHover();
          if (id) Y2S.ui.openPanel(id);
        },
        onmouseenter: () => tag.classList.add('show'),
        onmouseleave: () => tag.classList.remove('show')
      },
      plusGlyph()
    );
    tag = h('div', { class: 'tag' }, 'Make skill');
    card = h('aside', { class: 'card', role: 'dialog', 'aria-label': 'YouTube to Skill' });
    // Keep typing in the card from triggering YouTube shortcuts (k, f, j, l…).
    ['keydown', 'keyup', 'keypress'].forEach((type) =>
      card.addEventListener(type, (e) => {
        if (e.key !== 'Escape') e.stopPropagation();
      })
    );
    wrap.append(ribbon, tag, card);
    root.append(wrap);
    document.documentElement.append(host);
  };

  // ---------- small utilities ----------

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e2) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  };

  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Segmented control: [[value, label], …]
  const segmented = (options, initial, onChange, label) => {
    let value = initial;
    const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    const buttons = options.map(([v, text]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), 'data-v': v, onclick: () => set(v) }, text)
    );
    const set = (v) => {
      value = v;
      buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
      if (onChange) onChange(v);
    };
    el.append(...buttons);
    return { el, get: () => value, set };
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T12:00:00Z');
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const onKey = (e) => {
    if (e.key === 'Escape') Y2S.ui.closePanel();
  };

  // ---------- public API ----------

  Y2S.ui = {
    isOwnElement: (el) => !!host && (el === host || host.contains(el)),

    // Includes the "Make skill" label so moving onto it keeps the ribbon.
    pointerOnRibbon(x, y) {
      if (!ribbon || !ribbon.classList.contains('show')) return false;
      const hit = (el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4;
      };
      return hit(ribbon) || (tag.classList.contains('show') && hit(tag));
    },

    showHover(rect, videoId, placement) {
      ensureHost();
      wrap.classList.toggle('dark', isDark());
      hoverVideoId = videoId;
      const w = 26;
      const left = placement === 'top-right' ? rect.right - w - 18 : rect.left + 14;
      const top = Math.max(0, rect.top);
      ribbon.style.left = `${Math.max(4, left)}px`;
      ribbon.style.top = `${top}px`;
      ribbon.classList.add('show');
      // Label sits beside the ribbon, toward the inside of the thumbnail.
      tag.style.top = `${top + 8}px`;
      if (placement === 'top-right') {
        tag.style.left = '';
        tag.style.right = `${Math.max(4, window.innerWidth - left + 6)}px`;
      } else {
        tag.style.right = '';
        tag.style.left = `${left + w + 6}px`;
      }
    },

    hideHover() {
      if (ribbon) ribbon.classList.remove('show');
      if (tag) tag.classList.remove('show');
      hoverVideoId = null;
    },

    closePanel() {
      if (card) {
        card.classList.remove('show');
        card.replaceChildren();
      }
      document.removeEventListener('keydown', onKey, true);
    },

    async openPanel(videoId, opts = {}) {
      ensureHost();
      wrap.classList.toggle('dark', isDark());
      const settings = await Y2S.getSettings();
      const state = { result: null };

      // --- header ---
      const strip = h(
        'div',
        { class: 'strip' },
        h('span', { class: 'brand' }, 'YouTube ', h('b', null, '→'), ' Skill'),
        h('span', { class: 'no' }, videoId ? `ID ${videoId}` : ''),
        h('button', { class: 'x', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => Y2S.ui.closePanel() }, '×')
      );

      if (!videoId) {
        card.replaceChildren(
          strip,
          h('div', { class: 'body' },
            h('div', { class: 'title' }, 'No video here'),
            h('p', { class: 'empty' }, opts.message || 'Open a video, or hover over a thumbnail and click the red ribbon.'))
        );
        card.classList.add('show');
        document.addEventListener('keydown', onKey, true);
        return;
      }

      // --- content ---
      const titleEl = h('div', { class: 'title' }, 'Reading the video…');
      const metaEl = h('div', { class: 'meta' });
      const status = h('div', { class: 'status busy' }, 'Starting');
      const preview = h('div', { class: 'preview', style: 'display:none' });

      // Destination: which assistant. Always its official website.
      const assistant = segmented(
        [['claude', 'Claude'], ['chatgpt', 'ChatGPT']],
        Y2S.normalizeTarget(settings.target),
        () => refresh(),
        'Assistant'
      );
      const targetKey = () => assistant.get();

      const nameInput = h('input', { class: 'line', type: 'text', placeholder: 'which skill? e.g. sales-playbook', 'aria-label': 'Skill to update' });
      const nameWrap = h('div', { class: 'sub', style: 'display:none' }, nameInput);
      const task = segmented(
        [['new', 'New skill'], ['update', 'Update one']],
        'new',
        (v) => {
          nameWrap.style.display = v === 'update' ? 'block' : 'none';
          if (v === 'update') nameInput.focus();
        },
        'Task'
      );
      const goalInput = h('textarea', {
        class: 'line',
        rows: 2,
        placeholder: 'what should it help you do? (optional)',
        'aria-label': 'Your goal',
        value: settings.defaultGoal || ''
      });
      const embedBox = h('input', { type: 'checkbox', checked: settings.embedInstructions, onchange: () => refresh() });
      const tsBox = h('input', { type: 'checkbox', checked: settings.includeTimestamps, onchange: () => refresh() });

      const stamp = h('button', { class: 'stamp', disabled: true },
        h('span', { class: 'stamp-label' }, 'Open'),
        h('kbd', null, navigator.platform.includes('Mac') ? '⌘↵' : 'Ctrl+↵'));
      const note = h('div', { class: 'note' });
      const btnCopyPrompt = h('button', { type: 'button', disabled: true }, 'Copy prompt');
      const btnCopyT = h('button', { type: 'button', disabled: true }, 'Copy transcript');
      const btnDl = h('button', { type: 'button', disabled: true }, 'Download .md');
      const btnRetry = h('button', { type: 'button', style: 'display:none' }, 'Retry');
      const btnOpenVideo = h('button', { type: 'button', style: 'display:none', onclick: () => location.assign(`/watch?v=${encodeURIComponent(videoId)}#yt2skill`) }, 'Open the video and read it there');
      const fallback = h('div', { class: 'fallback', style: 'display:none' });
      const details = h('details', { style: 'display:none' }, h('summary', null, 'Technical details'), h('pre'));

      const setStatus = (text, kind) => {
        status.textContent = text;
        status.classList.toggle('err', kind === 'err');
        status.classList.toggle('busy', kind === 'busy');
      };

      const markdown = () => Y2S.toMarkdown(state.result, { timestamps: tsBox.checked });
      const promptNow = () =>
        Y2S.buildPrompt({
          markdown: markdown(),
          mode: task.get(),
          skillName: nameInput.value,
          goal: goalInput.value,
          embedInstructions: embedBox.checked
        });

      const refresh = () => {
        const t = Y2S.TARGETS[targetKey()];
        stamp.querySelector('.stamp-label').textContent = `Open ${t.site} ↗`;
        note.textContent = `Opens ${t.site} in a new tab and pastes the prompt into the message box. You review it and press Send.`;
      };

      const persist = () =>
        Y2S.saveSettings({ target: targetKey(), embedInstructions: embedBox.checked, includeTimestamps: tsBox.checked });

      // --- actions ---

      const primary = async () => {
        if (!state.result || stamp.disabled) return;
        const target = Y2S.TARGETS[targetKey()];
        const prompt = promptNow();
        // Clipboard copy first, while the click still counts as a user gesture:
        // it is the backup if pasting in the new tab does not work.
        const copied = await copyText(prompt);
        persist();
        let res;
        try {
          res = await chrome.runtime.sendMessage({ type: 'y2s:openChat', target: targetKey(), url: target.url, text: prompt });
        } catch (e) {
          res = { ok: false };
        }
        if (!res || !res.ok) {
          window.open(target.url, '_blank', 'noopener');
          setStatus(
            copied
              ? `Opened ${target.site}. Paste the prompt with ${navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'} and press Send.`
              : 'Couldn’t open the chat or copy the prompt. Try “Download .md” and attach the file.',
            copied ? null : 'err'
          );
          return;
        }
        setStatus(`Opened ${target.site}. The prompt is being pasted there; review it and press Send.`);
        fallback.replaceChildren(
          `Didn’t appear? Click the message box and press ${navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'}; the prompt is on your clipboard.`
        );
        fallback.style.display = copied ? 'block' : 'none';
      };

      stamp.addEventListener('click', primary);
      card.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          primary();
        }
      };
      btnCopyPrompt.addEventListener('click', async () => {
        const ok = await copyText(promptNow());
        setStatus(ok ? 'Prompt copied. Paste it into any assistant.' : 'Couldn’t copy to the clipboard.', ok ? null : 'err');
      });
      btnCopyT.addEventListener('click', async () => {
        const ok = await copyText(markdown());
        setStatus(ok ? 'Transcript copied.' : 'Couldn’t copy to the clipboard.', ok ? null : 'err');
      });
      btnDl.addEventListener('click', () => {
        download(`${Y2S.slugify(state.result.meta.title)}.transcript.md`, markdown());
        setStatus('Downloaded. Attach it in any chat and say “turn this into a skill”.');
      });

      const enable = (on) => [stamp, btnCopyPrompt, btnCopyT, btnDl].forEach((b) => (b.disabled = !on));

      const load = async () => {
        enable(false);
        [btnRetry, btnOpenVideo, fallback, details, preview].forEach((el) => (el.style.display = 'none'));
        try {
          state.result = await Y2S.getTranscript(videoId, { preferredLanguage: settings.preferredLanguage }, (msg) =>
            setStatus(msg.replace(/…$/, ''), 'busy')
          );
          const r = state.result;
          const m = r.meta;
          titleEl.textContent = m.title || videoId;
          metaEl.textContent = [m.channel, fmtDate(m.published), m.lengthSeconds ? Y2S.formatTime(m.lengthSeconds * 1000) : '']
            .filter(Boolean)
            .join('  ·  ');
          const tokens = Y2S.estimateTokens(markdown());
          setStatus(
            `✓ ${r.segments.length} lines read  ·  ≈${(tokens / 1000).toFixed(1)}k tokens${r.isAuto ? '  ·  auto-captions' : ''}`
          );
          const first = Y2S.groupParagraphs(r.segments)[0];
          if (first) {
            preview.textContent = `“${first.text}”`;
            preview.style.display = '';
          }
          enable(true);
          refresh();
        } catch (e) {
          if (titleEl.textContent === 'Reading the video…') titleEl.textContent = 'Transcript unavailable';
          let msg = `× ${e.message}`;
          if (e.canOpenVideo) msg += ' Open the video and the panel will read it there.';
          else if (!e.noCaptions) msg += ' Click “…more” under the video, then “Show transcript”, and retry.';
          setStatus(msg, 'err');
          if (e.details && e.details.length) {
            details.querySelector('pre').textContent = e.details.join('\n');
            details.style.display = '';
          }
          if (e.canOpenVideo) btnOpenVideo.style.display = '';
          else if (!e.noCaptions) btnRetry.style.display = '';
        }
      };
      btnRetry.addEventListener('click', load);

      // --- assemble ---
      const options = h(
        'details',
        null,
        h('summary', null, 'Options'),
        h('label', { class: 'check' }, embedBox, h('span', null, 'Include full instructions — turn off once the youtube-to-skill skill is installed')),
        h('label', { class: 'check' }, tsBox, h('span', null, 'Keep timestamps in the transcript'))
      );

      card.replaceChildren(
        strip,
        h(
          'div',
          { class: 'body' },
          titleEl,
          metaEl,
          status,
          preview,
          h(
            'div',
            { class: 'form' },
            h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Send to'), h('div', null, assistant.el)),
            h('div', { class: 'row top' }, h('span', { class: 'lbl', style: 'padding-top:9px' }, 'Task'), h('div', null, task.el, nameWrap)),
            h('div', { class: 'row top' }, h('span', { class: 'lbl', style: 'padding-top:7px' }, 'For'), goalInput)
          ),
          options,
          stamp,
          note,
          h('div', { class: 'links' }, btnCopyPrompt, btnCopyT, btnDl, btnOpenVideo, btnRetry),
          fallback,
          details,
          h('p', { class: 'fine' }, 'Nothing is sent until you press Send yourself.')
        )
      );
      card.classList.add('show');
      document.addEventListener('keydown', onKey, true);
      refresh();
      load();
    }
  };
})();
