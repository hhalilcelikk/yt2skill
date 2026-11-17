const DEFAULTS = {
  target: 'claude',
  embedInstructions: true,
  includeTimestamps: true,
  preferredLanguage: '',
  defaultGoal: ''
};

const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $('target').value = String(s.target).startsWith('chatgpt') ? 'chatgpt' : 'claude';
  $('lang').value = s.preferredLanguage;
  $('goal').value = s.defaultGoal;
  $('embed').checked = s.embedInstructions;
  $('ts').checked = s.includeTimestamps;
});

$('save').addEventListener('click', () => {
  chrome.storage.sync.set(
    {
      target: $('target').value,
      preferredLanguage: $('lang').value.trim(),
      defaultGoal: $('goal').value.trim(),
      embedInstructions: $('embed').checked,
      includeTimestamps: $('ts').checked
    },
    () => {
      $('saved').style.opacity = 1;
      setTimeout(() => ($('saved').style.opacity = 0), 1500);
    }
  );
});

$('dlskill').addEventListener('click', async () => {
  const res = await fetch(chrome.runtime.getURL('skill/youtube-to-skill/SKILL.md'));
  const text = await res.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'SKILL.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
