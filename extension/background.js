// Service worker. It never reads pages. It opens the chat tab, holds the
// prompt for that one tab until the tab picks it up, and opens settings.
//
// The prompt is kept in chrome.storage.session: in memory only, cleared when
// the browser closes, and not readable by content scripts directly.

const CHAT_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/'
};
const PENDING_TTL = 2 * 60 * 1000; // a prompt waits at most two minutes

const key = (tabId) => `pending:${tabId}`;

async function openPanelIn(tab) {
  if (tab && tab.id != null) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'y2s:open' });
      return;
    } catch (e) {
      // No content script in this tab (not YouTube, or the page predates install).
    }
  }
  chrome.runtime.openOptionsPage();
}

chrome.action.onClicked.addListener(openPanelIn);

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  openPanelIn(tab);
});

async function openChat(target, text, sender) {
  const url = CHAT_URLS[target];
  if (!url) throw new Error('Unknown destination');
  const props = { url };
  if (sender.tab) props.index = sender.tab.index + 1;
  const tab = await chrome.tabs.create(props);
  await chrome.storage.session.set({ [key(tab.id)]: { text, target, at: Date.now() } });
}

// Hands the prompt to the chat tab exactly once, and only to the tab that
// the extension itself opened for it.
async function takePending(tabId) {
  const k = key(tabId);
  const got = await chrome.storage.session.get(k);
  const item = got[k];
  if (!item) return null;
  await chrome.storage.session.remove(k);
  return Date.now() - item.at <= PENDING_TTL ? item : null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'y2s:openChat') {
    openChat(msg.target, String(msg.text || ''), sender)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg.type === 'y2s:takePending') {
    if (!sender.tab) return sendResponse({});
    takePending(sender.tab.id)
      .then((item) => sendResponse(item ? { text: item.text } : {}))
      .catch(() => sendResponse({}));
    return true;
  }
  if (msg.type === 'y2s:openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(key(tabId)));

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
