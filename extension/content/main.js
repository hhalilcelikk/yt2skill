// Wiring: show the bookmark ribbon over video thumbnails and the player,
// and open the card from the toolbar icon or keyboard shortcut.
//
// Visibility is decided by pointer position, not by which element is under
// the mouse: about half a second into a hover, YouTube lays its inline
// preview player over the thumbnail, which would otherwise look like the
// pointer leaving.

(() => {
  const Y2S = globalThis.Y2S;
  if (Y2S.__started) return;
  Y2S.__started = true;

  const LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]';
  const THUMB_CONTAINERS =
    'ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail, ytm-shorts-lockup-view-model, ytd-reel-item-renderer, yt-lockup-view-model';

  const HIDE_DELAY = 300; // ms after the pointer leaves the video area

  let current = null; // { el, id, placement }
  let hideTimer = null;
  let pointer = { x: -1, y: -1 };
  let frame = 0;

  const looksLikeThumbnail = (a) => {
    if (!(a.id === 'thumbnail' || a.closest(THUMB_CONTAINERS) || a.querySelector('img, yt-image'))) return false;
    const r = a.getBoundingClientRect();
    return r.width >= 100 && r.height >= 56;
  };

  const inside = (r, x, y, pad = 2) =>
    x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

  const place = () => {
    if (!current) return;
    if (!current.el.isConnected) return hideNow();
    Y2S.ui.showHover(current.el.getBoundingClientRect(), current.id, current.placement);
  };

  const hideNow = () => {
    clearTimeout(hideTimer);
    hideTimer = null;
    current = null;
    Y2S.ui.hideHover();
  };

  const scheduleHide = () => {
    if (hideTimer) return;
    hideTimer = setTimeout(hideNow, HIDE_DELAY);
  };

  const cancelHide = () => {
    clearTimeout(hideTimer);
    hideTimer = null;
  };

  const track = (el, id, placement) => {
    cancelHide();
    if (!current || current.el !== el || current.id !== id) {
      current = { el, id, placement };
    }
    place();
  };

  // Pick up a new target when the pointer enters a thumbnail or the player.
  document.addEventListener(
    'mouseover',
    (e) => {
      const t = e.target;
      if (!(t instanceof Element) || Y2S.ui.isOwnElement(t)) return;
      const player = t.closest('#movie_player');
      if (player) {
        const id = Y2S.videoIdFromUrl(location.href);
        if (id) return track(player, id, 'top-right');
      }
      const a = t.closest(LINK_SELECTOR);
      if (a && looksLikeThumbnail(a)) {
        const id = Y2S.videoIdFromUrl(a.getAttribute('href'));
        if (id) return track(a, id, 'top-left');
      }
      // Anything else (including YouTube's preview overlay) is judged by
      // position in the mousemove check below.
    },
    true
  );

  // Keep or drop the current target based on where the pointer actually is.
  const check = () => {
    frame = 0;
    if (!current) return;
    if (!current.el.isConnected) return hideNow();
    const r = current.el.getBoundingClientRect();
    if (inside(r, pointer.x, pointer.y) || Y2S.ui.pointerOnRibbon(pointer.x, pointer.y)) cancelHide();
    else scheduleHide();
  };

  document.addEventListener(
    'mousemove',
    (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (current && !frame) frame = requestAnimationFrame(check);
    },
    { capture: true, passive: true }
  );

  // Leaving the window entirely.
  document.documentElement.addEventListener('mouseleave', scheduleHide);

  // Follow the target while the page scrolls instead of vanishing.
  window.addEventListener(
    'scroll',
    () => {
      if (current && !frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          place();
          check();
        });
    },
    { capture: true, passive: true }
  );

  document.addEventListener('yt-navigate-start', hideNow);

  // "Open the video" in the card navigates to /watch?v=ID#yt2skill;
  // reopen the card there so the transcript panel method can run.
  const resumeFromHash = () => {
    if (location.hash !== '#yt2skill') return;
    const id = Y2S.videoIdFromUrl(location.href);
    history.replaceState(null, '', location.pathname + location.search);
    if (id) setTimeout(() => Y2S.ui.openPanel(id), 1200);
  };
  resumeFromHash();
  document.addEventListener('yt-navigate-finish', resumeFromHash);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'y2s:open') {
      const id = Y2S.videoIdFromUrl(location.href);
      Y2S.ui.openPanel(id, {
        message: 'Open a video, or hover over a thumbnail and click the red ribbon.'
      });
      sendResponse({ ok: true });
    }
  });
})();
