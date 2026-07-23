(function () {
  const scriptTag = document.currentScript;
  const clientId = scriptTag.getAttribute('data-client-id');
  const fallbackColor = scriptTag.getAttribute('data-accent') || '#1B2A41';
  const apiBase = new URL(scriptTag.src).origin;

  if (!clientId) {
    console.error('Harbor widget: missing data-client-id');
    return;
  }

  let config = { storeName: 'Support', accentColor: fallbackColor };
  let history = [];
  let opened = false;

  // --- inject styles ---
  const style = document.createElement('style');
  style.textContent = `
    #harbor-launcher{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;
      background:${fallbackColor};border:none;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;z-index:999999;}
    #harbor-panel{position:fixed;bottom:92px;right:24px;width:340px;max-width:calc(100vw - 32px);
      height:480px;max-height:calc(100vh - 140px);background:#fff;border-radius:10px;
      box-shadow:0 20px 60px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;
      opacity:0;transform:translateY(12px);pointer-events:none;transition:0.2s ease;z-index:999999;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    #harbor-panel.open{opacity:1;transform:translateY(0);pointer-events:auto;}
    #harbor-header{background:${fallbackColor};color:#fff;padding:16px 18px;font-size:15px;font-weight:600;}
    #harbor-messages{flex:1;overflow-y:auto;padding:16px;background:#f7f7f8;display:flex;flex-direction:column;gap:10px;}
    .hb-msg{max-width:85%;font-size:13.5px;line-height:1.5;padding:9px 12px;border-radius:8px;}
    .hb-bot{background:#fff;border:1px solid #eee;align-self:flex-start;}
    .hb-user{background:${fallbackColor};color:#fff;align-self:flex-end;}
    #harbor-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid #eee;background:#fff;}
    #harbor-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:9px 13px;font-size:13.5px;outline:none;}
    #harbor-send{width:36px;height:36px;border-radius:50%;border:none;background:${fallbackColor};color:#fff;cursor:pointer;}
  `;
  document.head.appendChild(style);

  // --- inject DOM ---
  const launcher = document.createElement('button');
  launcher.id = 'harbor-launcher';
  launcher.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4H12a8.6 8.6 0 0 1-3.4-.7L4 20.5l1.3-3.9A8.4 8.4 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/></svg>`;

  const panel = document.createElement('div');
  panel.id = 'harbor-panel';
  panel.innerHTML = `
    <div id="harbor-header">Support</div>
    <div id="harbor-messages"></div>
    <div id="harbor-input-row">
      <input id="harbor-input" type="text" placeholder="Ask a question…">
      <button id="harbor-send">→</button>
    </div>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector('#harbor-messages');
  const inputEl = panel.querySelector('#harbor-input');
  const sendBtn = panel.querySelector('#harbor-send');
  const headerEl = panel.querySelector('#harbor-header');

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'hb-msg ' + (role === 'user' ? 'hb-user' : 'hb-bot');
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadConfig() {
    try {
      const r = await fetch(`${apiBase}/api/get-client?id=${encodeURIComponent(clientId)}`);
      const data = await r.json();
      if (data.storeName) {
        config = { storeName: data.storeName, accentColor: data.accentColor };
        headerEl.textContent = config.storeName + ' Assistant';
      }
    } catch (e) {
      console.error('Harbor: could not load client config', e);
    }
  }
  loadConfig();

  launcher.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (!opened) {
      opened = true;
      addMsg('bot', `Hi! I'm the ${config.storeName} assistant. How can I help?`);
    }
  });

  async function send(text) {
    if (!text.trim()) return;
    addMsg('user', text);
    history.push({ role: 'user', content: text });
    inputEl.value = '';

    try {
      const r = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, messages: history })
      });
      const data = await r.json();
      const reply = data.reply || data.error || "Sorry, something went wrong.";
      addMsg('bot', reply);
      history.push({ role: 'assistant', content: reply });
    } catch (e) {
      addMsg('bot', 'Something went wrong — please try again.');
    }
  }

  sendBtn.addEventListener('click', () => send(inputEl.value));
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') send(inputEl.value); });
})();
