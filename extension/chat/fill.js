// Runs on claude.ai and chatgpt.com. It does nothing unless this tab was
// opened by the extension with a prompt waiting for it: then it pastes that
// prompt into the message box once. It never presses Send and never reads
// the page's conversation.

(() => {
  if (window.__y2sFill) return;
  window.__y2sFill = true;

  const COMPOSERS = [
    '#prompt-textarea', // ChatGPT
    'div.ProseMirror[contenteditable="true"]', // Claude (and ChatGPT)
    '[contenteditable="true"][role="textbox"]',
    'textarea[name="prompt-textarea"]',
    'main textarea'
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const ask = async () => {
    // The background stores the prompt right after creating this tab, so
    // allow a few short retries in case this script starts first.
    for (let i = 0; i < 4; i++) {
      try {
        const res = await chrome.runtime.sendMessage({ type: 'y2s:takePending' });
        if (res && res.text) return res.text;
      } catch (e) {
        return null;
      }
      await sleep(400);
    }
    return null;
  };

  const findComposer = () => {
    for (const sel of COMPOSERS) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  };

  const waitForComposer = async (ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const el = findComposer();
      if (el) return el;
      await sleep(250);
    }
    return null;
  };

  const contentLength = (el) =>
    el instanceof HTMLTextAreaElement ? el.value.length : (el.textContent || '').trim().length;

  // Paste the way a person would. If the site handles the paste event itself
  // (Claude inserts the text; ChatGPT turns long text into an attachment),
  // stop there. Only if nothing handled it, insert the text directly; doing
  // both would paste the prompt twice.
  const fill = async (el, text) => {
    el.focus();
    const before = contentLength(el);
    if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    let handled = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      handled = ev.defaultPrevented;
    } catch (e) {
      handled = false;
    }
    await sleep(500);
    if (handled || contentLength(el) > before) return true;
    el.focus();
    document.execCommand('insertText', false, text);
    await sleep(200);
    return contentLength(el) > before;
  };

  // Small notice in the corner so it is always clear what the extension did.
  const toast = (text, isError) => {
    const host = document.createElement('yt2skill-toast');
    host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .t { max-width: 340px; padding: 11px 14px 12px; background: #f2ede3; color: #1c1b19;
           border: 1.5px solid #1c1b19; box-shadow: 5px 5px 0 #1c1b19;
           font: 13px/1.45 "Iowan Old Style", Charter, Georgia, serif; animation: in .2s ease-out; }
      .h { font: 600 10.5px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .12em;
           text-transform: uppercase; color: #6e675c; margin-bottom: 6px; display: flex; gap: 10px; }
      .h b { color: #d23b1f; } .h span { margin-left: auto; cursor: pointer; color: #1c1b19; }
      .err { color: #d23b1f; }
      @keyframes in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }`;
    const box = document.createElement('div');
    box.className = 't';
    const head = document.createElement('div');
    head.className = 'h';
    const brand = document.createElement('div');
    brand.append('YouTube ');
    const arrow = document.createElement('b');
    arrow.textContent = '→';
    brand.append(arrow, ' Skill');
    const close = document.createElement('span');
    close.textContent = '×';
    close.onclick = () => host.remove();
    head.append(brand, close);
    const body = document.createElement('div');
    body.textContent = text;
    if (isError) body.className = 'err';
    box.append(head, body);
    root.append(style, box);
    document.documentElement.append(host);
    setTimeout(() => host.remove(), isError ? 15000 : 8000);
  };

  (async () => {
    const text = await ask();
    if (!text) return; // Not our tab: do nothing at all.
    const paste = navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V';
    const el = await waitForComposer();
    if (!el) {
      toast(`Couldn’t find the message box (are you signed in?). The prompt is on your clipboard: click the box and press ${paste}.`, true);
      return;
    }
    const ok = await fill(el, text);
    toast(
      ok
        ? 'Prompt pasted. Review it and press Send when you’re ready.'
        : `Couldn’t paste automatically. The prompt is on your clipboard: click the message box and press ${paste}.`,
      !ok
    );
  })();
})();
