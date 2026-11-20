import './styles.css';

const API_BASE =
  (import.meta.env.VITE_PONT_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:9880/api';
const ORIGIN = /^https?:\/\//i.test(API_BASE)
  ? API_BASE.replace(/\/api\/?$/, '')
  : `${location.origin}${API_BASE.replace(/\/api\/?$/, '')}`;
const KEY_STORAGE = 'pont_gateway_key';

const app = document.querySelector<HTMLDivElement>('#app')!;

type Method = 'GET' | 'POST';
type Page = '/overview' | '/endpoints' | '/providers' | '/users' | '/logs';

interface RouteDef {
  id: string;
  method: Method;
  path: string;
  summary: string;
  body?: string;
}

const CHAT_BODY = `{
  "model": "opencode-<model-slug>",
  "messages": [{ "role": "user", "content": "Say hi in five words." }]
}`;

const ROUTES: RouteDef[] = [
  { id: 'health', method: 'GET', path: '/health', summary: 'Liveness probe.' },
  { id: 'models', method: 'GET', path: '/api/v1/models', summary: 'Models from every provider that has a key.' },
  {
    id: 'chat',
    method: 'POST',
    path: '/api/v1/chat/completions',
    summary: 'Chat. The model prefix picks the provider.',
    body: CHAT_BODY,
  },
  {
    id: 'responses',
    method: 'POST',
    path: '/api/v1/responses',
    summary: 'OpenAI Responses API. The model prefix picks the provider.',
    body: `{
  "model": "opencode-<model-slug>",
  "input": "Say hi in five words."
}`,
  },
  {
    id: 'messages',
    method: 'POST',
    path: '/api/v1/messages',
    summary: 'Anthropic Messages API. The model prefix picks the provider.',
    body: CHAT_BODY,
  },
];

const NAV: Array<{ path: Page; label: string }> = [
  { path: '/overview', label: 'Overview' },
  { path: '/endpoints', label: 'Endpoints' },
  { path: '/providers', label: 'Providers' },
  { path: '/users', label: 'Users' },
  { path: '/logs', label: 'Logs' },
];

function el(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function route(): Page {
  const hash = location.hash.replace(/^#/, '') || '/overview';
  const path = hash.split('?')[0];
  return NAV.some((item) => item.path === path) ? (path as Page) : '/overview';
}

function queryParam(name: string): string {
  const query = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get(name) ?? '';
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

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`/api/admin${path}`, { ...init, headers, credentials: 'include' });
}

function tokens(count: number, cache: number): string {
  const main = `${(count / 1000).toFixed(1)}k`;
  return `${main} (${(cache / 1000).toFixed(1)}k)`;
}

function priceCell(perToken: string | null, cache: string | null): string {
  if (!perToken) {
    return '—';
  }
  const main = Number(perToken) * 1000;
  const cachePart = cache ? Number(cache) * 1000 : 0;
  return `$${main.toFixed(4)} ($${cachePart.toFixed(4)})`;
}

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

async function render(): Promise<void> {
  const path = route();
  app.innerHTML = '';
  const shell = el(`
    <div class="shell">
      <aside class="sidebar">
        <div class="sidebar-top">
          <a class="sidebar-brand" href="#/overview" title="Pont">
            <img class="sidebar-brand-mark" src="${import.meta.env.BASE_URL}brand/dark-icon.png" alt="" width="28" height="28" decoding="async" />
            <span class="sidebar-brand-name">Pont</span>
          </a>
        </div>
        <nav class="nav" aria-label="Main">
          ${NAV.map(
            (item) =>
              `<a class="nav-link${path === item.path ? ' active' : ''}" href="#${item.path}"><span class="nav-link-label">${item.label}</span></a>`,
          ).join('')}
        </nav>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `);
  app.append(shell);
  const main = shell.querySelector('#main')!;
  if (path === '/endpoints') {
    main.append(renderEndpoints());
    return;
  }
  const probe = await adminFetch('/overview');
  if (probe.status === 401 || probe.status === 403) {
    main.append(renderLogin());
    return;
  }
  if (path === '/overview') {
    main.append(renderOverview(await probe.json()));
  } else if (path === '/providers') {
    main.append(await renderProviders());
  } else if (path === '/users') {
    main.append(await renderUsers());
  } else {
    main.append(await renderLogs(queryParam('username')));
  }
}

function renderLogin(): HTMLElement {
  const wrap = el(`
    <div class="page">
      <form class="panel login-card" id="login-form">
        <h1>Sign in</h1>
        <label for="login-user">Username</label>
        <input id="login-user" autocomplete="username" value="admin" />
        <label for="login-pass">Password</label>
        <input id="login-pass" type="password" autocomplete="current-password" value="admin" />
        <button type="submit">Sign in</button>
        <p class="alert" id="login-error" hidden></p>
      </form>
    </div>
  `);
  wrap.querySelector('#login-form')!.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      const username = (wrap.querySelector('#login-user') as HTMLInputElement).value.trim();
      const password = (wrap.querySelector('#login-pass') as HTMLInputElement).value;
      const response = await adminFetch('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const error = wrap.querySelector('#login-error') as HTMLElement;
        error.hidden = false;
        error.textContent = 'Sign in failed';
        return;
      }
      await render();
    })();
  });
  return wrap;
}

function renderOverview(data: { users: number; requests: number; providersWithKeys: number }): HTMLElement {
  return el(`
    <div class="page">
      <header class="page-head"><h1>Overview</h1></header>
      <div class="grid-2">
        <div class="panel"><h2>Users</h2><p>${esc(data.users)}</p></div>
        <div class="panel"><h2>Requests</h2><p>${esc(data.requests)}</p></div>
        <div class="panel"><h2>Providers with a key</h2><p>${esc(data.providersWithKeys)}</p></div>
      </div>
    </div>
  `);
}

function renderEndpoints(): HTMLElement {
  const wrap = el(`
    <div class="page">
      <header class="page-head"><h1>Endpoints</h1></header>
      <div class="panel"><div id="route-list"></div></div>
      <div class="panel" id="tester" hidden></div>
    </div>
  `);
  const list = wrap.querySelector('#route-list')!;
  const tester = wrap.querySelector('#tester') as HTMLElement;
  let selected = ROUTES[0];

  list.append(el(`
    <table>
      <thead><tr><th>Method</th><th>Endpoint</th><th>Test</th></tr></thead>
      <tbody>
        ${ROUTES.map(
          (item) => `
          <tr>
            <td><span class="badge">${esc(item.method)}</span></td>
            <td class="mono">${esc(ORIGIN + item.path)}</td>
            <td><button type="button" class="secondary small" data-id="${esc(item.id)}">Test</button></td>
          </tr>`,
        ).join('')}
      </tbody>
    </table>
  `));

  function draw(): void {
    tester.hidden = false;
    const needsKey = selected.path !== '/health';
    const hasBody = selected.method !== 'GET';
    tester.innerHTML = `
      <h2>Test</h2>
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
    const id = (event.target as HTMLElement).closest<HTMLElement>('button')?.dataset.id;
    const next = ROUTES.find((item) => item.id === id);
    if (!next) return;
    selected = next;
    draw();
  });
  return wrap;
}

interface ModelRow {
  provider: string;
  model: string;
  inputToken: string | null;
  inputCacheToken: string | null;
  outputToken: string | null;
  outputCacheToken: string | null;
  free: boolean;
}

interface KeyStatus {
  id: string;
  label: string;
  source: string;
  maskedKey?: string;
}

async function renderProviders(): Promise<HTMLElement> {
  const keys = (await (await adminFetch('/provider-keys')).json()) as KeyStatus[];
  const models = ((await (await adminFetch('/models')).json()) as { rows: ModelRow[] }).rows;
  const wrap = el(`
    <div class="page">
      <header class="page-head"><h1>Providers</h1></header>
      <div class="panel" id="key-panel">
        <h2>API keys</h2>
        ${keys
          .map(
            (key) => `
          <label for="key-${esc(key.id)}">${esc(key.label)} <span class="muted">${esc(key.maskedKey ?? 'not set')} (${esc(key.source)})</span></label>
          <div class="field-row">
            <input id="key-${esc(key.id)}" class="mono" type="password" autocomplete="off" placeholder="Paste key to replace" />
            <button type="button" data-save="${esc(key.id)}">Save</button>
          </div>`,
          )
          .join('')}
        <p class="muted" id="key-note"></p>
      </div>
      <div class="panel">
        <table>
          <thead><tr><th>Provider</th><th>Model</th><th>Price</th><th>Input</th><th>Output</th><th>Free</th></tr></thead>
          <tbody>
            ${
              models.length
                ? models
                    .map(
                      (row) => `<tr>
                <td>${esc(row.provider)}</td>
                <td class="mono">${esc(row.model)}</td>
                <td class="mono">${esc(row.inputToken ? `$${(Number(row.inputToken) * 1000).toFixed(4)}` : '—')}</td>
                <td class="mono">${esc(priceCell(row.inputToken, row.inputCacheToken))}</td>
                <td class="mono">${esc(priceCell(row.outputToken, row.outputCacheToken))}</td>
                <td>${row.free ? 'Yes' : 'No'}</td>
              </tr>`,
                    )
                    .join('')
                : '<tr><td colspan="6" class="muted">No models. Save a provider key first.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `);
  wrap.querySelector('#key-panel')!.addEventListener('click', (event) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('button')?.dataset.save;
    if (!id) return;
    const input = wrap.querySelector(`#key-${CSS.escape(id)}`) as HTMLInputElement;
    void (async () => {
      const response = await adminFetch(`/provider-keys/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ apiKey: input.value }),
      });
      const note = wrap.querySelector('#key-note')!;
      note.textContent = response.ok ? 'Saved. Reload to refresh the model grid.' : 'Save failed';
    })();
  });
  return wrap;
}

interface UserRow {
  username: string;
  fullName: string;
  email: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  enabled: boolean;
}

async function renderUsers(): Promise<HTMLElement> {
  const data = (await (await adminFetch('/users')).json()) as { users: UserRow[] };
  const wrap = el(`
    <div class="page">
      <header class="page-head"><h1>Users</h1></header>
      <div class="panel">
        <table>
          <thead><tr><th>Username</th><th>Full name</th><th>Email</th><th>Call</th><th>Usage</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.users
              .map(
                (user) => `<tr>
              <td class="mono">${esc(user.username)}</td>
              <td>${esc(user.fullName)}</td>
              <td>${esc(user.email)}</td>
              <td>${esc(user.calls)}</td>
              <td class="mono">${esc(`${((user.promptTokens + user.completionTokens) / 1000).toFixed(1)}k`)}</td>
              <td class="logs-actions">
                <button type="button" class="secondary small" data-act="toggle" data-user="${esc(user.username)}" data-enabled="${user.enabled ? '1' : '0'}">${user.enabled ? 'Disable' : 'Enable'}</button>
                <button type="button" class="secondary small" data-act="logs" data-user="${esc(user.username)}">Logs</button>
                <button type="button" class="secondary small" data-act="edit" data-user="${esc(user.username)}" data-name="${esc(user.fullName)}">Edit</button>
                <button type="button" class="secondary small" data-act="key" data-user="${esc(user.username)}">API key</button>
                <button type="button" class="secondary small" data-act="models" data-user="${esc(user.username)}">Models</button>
                <button type="button" class="secondary small" data-act="password" data-user="${esc(user.username)}">Reset password</button>
                <button type="button" class="secondary small" data-act="delete" data-user="${esc(user.username)}">Delete</button>
              </td>
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="panel" id="user-extra" hidden></div>
    </div>
  `);
  const extra = wrap.querySelector('#user-extra') as HTMLElement;
  wrap.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!button) return;
    const username = button.dataset.user!;
    const act = button.dataset.act;
    void (async () => {
      if (act === 'toggle') {
        await adminFetch(`/users/${encodeURIComponent(username)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: button.dataset.enabled !== '1' }),
        });
        await render();
        return;
      }
      if (act === 'delete') {
        if (!confirm(`Delete ${username}?`)) return;
        await adminFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
        await render();
        return;
      }
      if (act === 'password') {
        const password = prompt(`New password for ${username} (min 8 characters)`);
        if (!password) return;
        const response = await adminFetch(`/users/${encodeURIComponent(username)}/password`, {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        extra.hidden = false;
        extra.textContent = response.ok ? 'Password updated.' : 'Password rejected.';
        return;
      }
      if (act === 'logs') {
        location.hash = `#/logs?username=${encodeURIComponent(username)}`;
        return;
      }
      if (act === 'edit') {
        extra.hidden = false;
        extra.innerHTML = `
          <h2>Edit ${esc(username)}</h2>
          <label for="edit-username">Username</label>
          <input id="edit-username" value="${esc(username)}" />
          <label for="edit-full-name">Full name</label>
          <input id="edit-full-name" value="${esc(button.dataset.name ?? '')}" />
          <div><button type="button" id="save-profile">Save</button></div>
          <p class="muted" id="edit-note"></p>
        `;
        extra.querySelector('#save-profile')?.addEventListener('click', () => {
          const nextUsername = (extra.querySelector('#edit-username') as HTMLInputElement).value;
          const fullName = (extra.querySelector('#edit-full-name') as HTMLInputElement).value;
          void (async () => {
            const response = await adminFetch(`/users/${encodeURIComponent(username)}`, {
              method: 'PATCH',
              body: JSON.stringify({ username: nextUsername, fullName }),
            });
            const note = extra.querySelector('#edit-note')!;
            if (!response.ok) {
              note.textContent = 'Save failed.';
              return;
            }
            await render();
          })();
        });
        return;
      }
      if (act === 'key') {
        const show = async (gatewayApiKey: string | undefined, failed: string) => {
          extra.hidden = false;
          extra.innerHTML = gatewayApiKey
            ? `<h2>API key for ${esc(username)}</h2><p class="mono">${esc(gatewayApiKey)}</p><button type="button" id="rotate-key">Rotate</button>`
            : `<p>${esc(failed)}</p><button type="button" id="rotate-key">Rotate</button>`;
          extra.querySelector('#rotate-key')?.addEventListener('click', () => {
            void (async () => {
              const response = await adminFetch(`/users/${encodeURIComponent(username)}/api-key`, { method: 'POST' });
              const body = (await response.json()) as { gatewayApiKey?: string };
              await show(body.gatewayApiKey, 'Key rotation failed.');
            })();
          });
        };
        const response = await adminFetch(`/users/${encodeURIComponent(username)}/api-key`);
        const body = (await response.json()) as { gatewayApiKey?: string; message?: string };
        await show(response.ok ? body.gatewayApiKey : undefined, body.message ?? 'No stored key. Rotate to issue one.');
        return;
      }
      if (act === 'models') {
        const catalog = ((await (await adminFetch('/models')).json()) as { rows: ModelRow[] }).rows;
        const granted = new Set(
          ((await (await adminFetch(`/users/${encodeURIComponent(username)}/models`)).json()) as { modelIds: string[] })
            .modelIds,
        );
        extra.hidden = false;
        extra.innerHTML = `
          <h2>Models for ${esc(username)}</h2>
          ${
            catalog.length
              ? catalog
                  .map(
                    (row) =>
                      `<label><input type="checkbox" value="${esc(row.model)}" ${granted.has(row.model) ? 'checked' : ''}/> ${esc(row.model)}</label>`,
                  )
                  .join('<br/>')
              : '<p class="muted">No catalog models. Add a provider key first.</p>'
          }
          <div><button type="button" id="save-models">Save</button></div>
        `;
        extra.querySelector('#save-models')?.addEventListener('click', () => {
          const modelIds = [...extra.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked')].map(
            (box) => box.value,
          );
          void adminFetch(`/users/${encodeURIComponent(username)}/models`, {
            method: 'PUT',
            body: JSON.stringify({ modelIds }),
          }).then(() => {
            extra.insertAdjacentHTML('beforeend', '<p class="muted">Saved.</p>');
          });
        });
      }
    })();
  });
  return wrap;
}

async function renderLogs(username: string): Promise<HTMLElement> {
  const query = username ? `?username=${encodeURIComponent(username)}` : '';
  const data = (await (
    await adminFetch(`/logs${query}`)
  ).json()) as {
    items: Array<{
      method: string;
      endpoint: string;
      model: string;
      username: string;
      ip: string;
      inputTokens: number;
      inputCacheTokens: number;
      outputTokens: number;
      outputCacheTokens: number;
      code: number;
      createdAt: string;
    }>;
  };
  return el(`
    <div class="page">
      <header class="page-head"><h1>Logs${username ? ` · ${esc(username)}` : ''}</h1></header>
      <div class="panel">
        <table>
          <thead><tr><th>Method</th><th>Endpoint</th><th>Model</th><th>Username</th><th>IP</th><th>Input</th><th>Output</th><th>Code</th><th>Date time</th></tr></thead>
          <tbody>
            ${
              data.items.length
                ? data.items
                    .map(
                      (row) => `<tr>
                <td>${esc(row.method)}</td>
                <td class="mono">${esc(row.endpoint)}</td>
                <td class="mono">${esc(row.model)}</td>
                <td>${esc(row.username)}</td>
                <td class="mono">${esc(row.ip)}</td>
                <td class="mono">${esc(tokens(row.inputTokens, row.inputCacheTokens))}</td>
                <td class="mono">${esc(tokens(row.outputTokens, row.outputCacheTokens))}</td>
                <td>${esc(row.code)}</td>
                <td class="mono">${esc(stamp(row.createdAt))}</td>
              </tr>`,
                    )
                    .join('')
                : '<tr><td colspan="9" class="muted">No requests.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `);
}

function meta(status: number, ok: boolean, durationMs: number): HTMLElement {
  return el(
    `<div class="response-meta"><span class="badge ${ok ? 'good' : 'bad'}">${status}</span><span class="muted">${Math.round(durationMs)} ms</span></div>`,
  );
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
