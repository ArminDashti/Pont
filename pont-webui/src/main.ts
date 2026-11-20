import './styles.css';

const API_BASE =
  (import.meta.env.VITE_PONT_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:9880/api';
const ORIGIN = /^https?:\/\//i.test(API_BASE)
  ? API_BASE.replace(/\/api\/?$/, '')
  : `${location.origin}${API_BASE.replace(/\/api\/?$/, '')}`;
const KEY_STORAGE = 'pont_gateway_key';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Method = 'GET' | 'POST';

interface RouteDef {
  id: string;
  group: string;
  method: Method;
  path: string;
  summary: string;
  body?: string;
}

const CHAT_BODY = `{
  "model": "opencode-<model-slug>",
  "messages": [{ "role": "user", "content": "Say hi in five words." }]
}`;

const RESPONSES_BODY = `{
  "model": "opencode-<model-slug>",
  "input": "Say hi in five words."
}`;

const ROUTES: RouteDef[] = [
  { id: 'health', group: 'Health', method: 'GET', path: '/health', summary: 'Liveness probe.' },
  { id: 'models', group: 'Gateway', method: 'GET', path: '/api/v1/models', summary: 'Models from every provider that has a key.' },
  {
    id: 'chat',
    group: 'Gateway',
    method: 'POST',
    path: '/api/v1/chat/completions',
    summary: 'Chat. The model prefix picks the provider.',
    body: CHAT_BODY,
  },
  {
    id: 'responses',
    group: 'Gateway',
    method: 'POST',
    path: '/api/v1/responses',
    summary: 'OpenAI Responses API. The model prefix picks the provider.',
    body: RESPONSES_BODY,
  },
  {
    id: 'messages',
    group: 'Gateway',
    method: 'POST',
    path: '/api/v1/messages',
    summary: 'Anthropic Messages API. The model prefix picks the provider.',
    body: CHAT_BODY,
  },
];

function el(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function route(): string {
  const hash = location.hash.replace(/^#/, '') || '/playground';
  return hash.split('?')[0] || '/playground';
}

function storedKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function saveKey(value: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, value.trim());
  } catch {
    /* private mode */
  }
}

function keyField(id: string): string {
  return `<label for="${id}">Gateway key</label><input id="${id}" class="mono" placeholder="pont_sk_..." value="${esc(storedKey())}" autocomplete="off" />`;
}

function bindKey(root: ParentNode, id: string): HTMLInputElement {
  const input = root.querySelector(`#${id}`) as HTMLInputElement;
  input.addEventListener('change', () => saveKey(input.value));
  return input;
}

async function render(): Promise<void> {
  const path = route() === '/endpoints' ? '/endpoints' : '/playground';
  app.innerHTML = '';
  const shell = el(`
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <a class="sidebar-brand" href="#/playground" title="Pont">
            <img class="sidebar-brand-mark" src="${import.meta.env.BASE_URL}brand/dark-icon.png" alt="" width="28" height="28" decoding="async" />
            <span class="sidebar-brand-name">Pont</span>
          </a>
        </div>
        <nav class="nav" aria-label="Main">
          <a class="nav-link${path === '/playground' ? ' active' : ''}" href="#/playground"><span class="nav-link-label">Playground</span></a>
          <a class="nav-link${path === '/endpoints' ? ' active' : ''}" href="#/endpoints"><span class="nav-link-label">Endpoints</span></a>
        </nav>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `);
  app.append(shell);
  const main = shell.querySelector('#main')!;
  main.append(path === '/endpoints' ? renderEndpoints() : renderPlayground());
}

function renderPlayground(): HTMLElement {
  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Playground</h1>
          <p class="muted">Send a prompt to <span class="mono">/api/v1/chat/completions</span>. Paste the gateway key from the API log.</p>
        </div>
      </header>
      <div class="grid-2">
        <div class="panel">
          <h2>Request</h2>
          ${keyField('pg-key')}
          <label for="pg-model">Model</label>
          <input id="pg-model" class="mono" placeholder="opencode-…" />
          <button type="button" id="pg-load" class="secondary">Load models</button>
          <label for="pg-prompt">Prompt</label>
          <textarea id="pg-prompt" spellcheck="false" rows="4">Say hi in five words.</textarea>
          <button type="button" id="pg-run">Run</button>
        </div>
        <div class="panel" id="pg-result">
          <h2>Result</h2>
          <p class="muted" id="pg-placeholder">Run a test to see the response here.</p>
        </div>
      </div>
    </div>
  `);
  const key = bindKey(wrap, 'pg-key');
  const model = wrap.querySelector('#pg-model') as HTMLInputElement;
  const prompt = wrap.querySelector('#pg-prompt') as HTMLTextAreaElement;
  const result = wrap.querySelector('#pg-result')!;

  wrap.querySelector('#pg-load')!.addEventListener('click', () => void loadModels(key, model, result));
  wrap.querySelector('#pg-run')!.addEventListener('click', () => void runChat(key, model, prompt, result));
  return wrap;
}

async function loadModels(key: HTMLInputElement, model: HTMLInputElement, result: HTMLElement): Promise<void> {
  saveKey(key.value);
  if (!key.value.trim()) {
    showAlert(result, 'Paste a gateway key first.');
    return;
  }
  try {
    const response = await fetch(`${ORIGIN}/api/v1/models`, {
      headers: { Authorization: `Bearer ${key.value.trim()}` },
    });
    const text = await response.text();
    if (!response.ok) {
      showAlert(result, pretty(text) || response.statusText);
      return;
    }
    const parsed = JSON.parse(text) as { data?: { id?: string }[] };
    const ids = (parsed.data ?? []).map((row) => row.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      showAlert(result, 'No models returned.');
      return;
    }
    const existing = document.getElementById('pg-model-list');
    existing?.remove();
    const list = document.createElement('select');
    list.id = 'pg-model-list';
    for (const id of ids) {
      list.append(el(`<option value="${esc(id)}">${esc(id)}</option>`));
    }
    list.addEventListener('change', () => {
      model.value = list.value;
    });
    model.value = ids[0];
    model.after(list);
    showAlert(result, `${ids.length} models loaded.`);
  } catch (error) {
    showAlert(result, error instanceof Error ? error.message : 'Request failed');
  }
}

async function runChat(
  key: HTMLInputElement,
  model: HTMLInputElement,
  prompt: HTMLTextAreaElement,
  result: HTMLElement,
): Promise<void> {
  saveKey(key.value);
  result.querySelectorAll('.response-meta, pre.response, .alert, #pg-placeholder').forEach((node) => node.remove());
  if (!key.value.trim() || !model.value.trim() || !prompt.value.trim()) {
    result.append(el('<div class="alert">Gateway key, model, and prompt are required.</div>'));
    return;
  }
  const started = performance.now();
  try {
    const response = await fetch(`${ORIGIN}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.value.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.value.trim(),
        messages: [{ role: 'user', content: prompt.value.trim() }],
        max_tokens: 256,
      }),
    });
    const text = await response.text();
    result.append(meta(response.status, response.ok, performance.now() - started));
    const pre = document.createElement('pre');
    pre.className = 'response';
    pre.textContent = pretty(text) || '(empty body)';
    result.append(pre);
  } catch (error) {
    result.append(el(`<div class="alert">${esc(error instanceof Error ? error.message : 'Request failed')}</div>`));
  }
}

function renderEndpoints(): HTMLElement {
  const wrap = el(`
    <div class="page">
      <div class="grid-2">
        <div class="panel"><h2>Routes</h2><div id="route-list"></div></div>
        <div class="panel" id="tester"></div>
      </div>
    </div>
  `);
  const list = wrap.querySelector('#route-list')!;
  const tester = wrap.querySelector('#tester')!;
  let selected = ROUTES[0];

  const table = el(`
    <table>
      <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
      <tbody>
        ${ROUTES.map(
          (item) => `
          <tr class="endpoint-row" role="button" tabindex="0" data-id="${esc(item.id)}">
            <td><span class="badge">${esc(item.method)}</span></td>
            <td class="mono">${esc(ORIGIN + item.path)}</td>
            <td class="muted">${esc(item.summary)}</td>
          </tr>`,
        ).join('')}
      </tbody>
    </table>
  `);
  list.append(table);

  function draw(): void {
    const needsKey = selected.path !== '/health';
    const hasBody = selected.method !== 'GET';
    tester.innerHTML = `
      <h2>Try it</h2>
      <p class="muted">${esc(selected.summary)}</p>
      <div class="field-row">
        <span class="badge">${esc(selected.method)}</span>
        <input id="ep-url" class="mono" value="${esc(ORIGIN + selected.path)}" />
      </div>
      <div id="ep-key-wrap" ${needsKey ? '' : 'hidden'}>${keyField('ep-key')}</div>
      <label for="ep-body">Body (JSON)</label>
      <textarea id="ep-body" spellcheck="false" ${hasBody ? '' : 'disabled'}>${hasBody ? esc(selected.body ?? '') : ''}</textarea>
      <button id="ep-send" type="button">Send</button>
      <div id="ep-result"></div>
    `;
    if (needsKey) {
      bindKey(tester, 'ep-key');
    }
    tester.querySelector('#ep-send')!.addEventListener('click', () => void send());
  }

  async function send(): Promise<void> {
    const url = (tester.querySelector('#ep-url') as HTMLInputElement).value.trim();
    const body = (tester.querySelector('#ep-body') as HTMLTextAreaElement).value.trim();
    const out = tester.querySelector('#ep-result')!;
    const headers: Record<string, string> = {};
    if (selected.path !== '/health') {
      const key = (tester.querySelector('#ep-key') as HTMLInputElement).value.trim();
      saveKey(key);
      if (!key) {
        out.innerHTML = '<div class="alert">Paste a gateway key.</div>';
        return;
      }
      headers.Authorization = `Bearer ${key}`;
    }
    if (selected.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    const started = performance.now();
    out.innerHTML = '<p class="muted">Sending…</p>';
    try {
      const response = await fetch(url, {
        method: selected.method,
        headers,
        body: selected.method === 'GET' ? undefined : body || undefined,
      });
      const text = await response.text();
      out.replaceChildren(meta(response.status, response.ok, performance.now() - started));
      const pre = document.createElement('pre');
      pre.className = 'response';
      pre.textContent = pretty(text) || '(empty body)';
      out.append(pre);
    } catch (error) {
      out.innerHTML = `<div class="alert">${esc(error instanceof Error ? error.message : 'Request failed')}</div>`;
    }
  }

  list.addEventListener('click', (event) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('.endpoint-row')?.dataset.id;
    const next = ROUTES.find((item) => item.id === id);
    if (!next) return;
    selected = next;
    for (const row of list.querySelectorAll<HTMLElement>('.endpoint-row')) {
      row.classList.toggle('selected', row.dataset.id === id);
    }
    draw();
  });

  draw();
  return wrap;
}

function meta(status: number, ok: boolean, durationMs: number): HTMLElement {
  return el(
    `<div class="response-meta"><span class="badge ${ok ? 'good' : 'bad'}">${status}</span><span class="muted">${Math.round(durationMs)} ms</span></div>`,
  );
}

function showAlert(result: HTMLElement, message: string): void {
  result.querySelectorAll('.response-meta, pre.response, .alert, #pg-placeholder').forEach((node) => node.remove());
  result.append(el(`<div class="alert">${esc(message)}</div>`));
}

function pretty(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

window.addEventListener('hashchange', () => {
  void render();
});
void render();
