# Privacy policy — YouTube to Skill

Last updated: 17 November 2026 (v0.4)

YouTube to Skill is a free, open-source browser extension. It has no server and collects no data.

## What the extension does with data

- **YouTube pages and transcripts.** When you click the Skill button, the extension requests the video page and its transcript from youtube.com, from your browser, using your normal YouTube session. This data stays in your browser.
- **Clipboard.** When you click a copy button, the extension writes the prompt or transcript to your clipboard. It never reads your clipboard.
- **Opening a chat.** When you press Open, the extension opens claude.ai or chatgpt.com in a new tab and pastes the prompt into the message box of that tab, once. It never presses Send; you do. The prompt waits in Chrome's in-memory session storage (cleared when the browser closes) for at most two minutes until that tab picks it up. On any other claude.ai or chatgpt.com tab the extension does nothing, and it never reads your conversations. What you send is governed by that service's terms and privacy policy.
- **Settings.** Your preferences (default destination, caption language, default goal, checkboxes) are saved with Chrome sync storage, which Chrome may sync between your own browsers.

## What the extension does not do

- No analytics, tracking, advertising or telemetry.
- No accounts, logins or API keys.
- No data sent to the developer or any third party.
- No access to sites other than youtube.com, claude.ai and chatgpt.com, and on the last two only to paste into a tab it opened.

## Contact

Open an issue in this project's repository.
