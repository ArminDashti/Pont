import './styles.css';
import { API_BASE, apiFetch, setToken, token } from './api.js';

interface UserRecord {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  admin: boolean;
  gatewayApiKeyPrefix: string;
}

interface ProviderKeyStatus {
  id: string;
  source: string;
  maskedKey?: string;
}

interface LogRecord {
  id: number;
  title: string;
  app: string;
  username: string;
  providerModel: string;
  totalTokens: number;
  durationMs: number;
  status: number;
  createdAt: string;
}

interface UsageBreakdown {
  key: string;
  requests: number;
  tokens: number;
}

interface RequestStats {
  allTime: { requests: number; tokens: number };
  window: { hours: number; requests: number; tokens: number; avgDurationMs: number; errorRate: number };
  byApp: UsageBreakdown[];
  byModel: UsageBreakdown[];
  byUser: UsageBreakdown[];
}

interface VpnStatus {
  skipped: boolean;
  up: boolean;
  interface: string;
  assignedIp: string | null;
  publicIp: string | null;
  publicIpError: string | null;
  checkedAt: string;
}

const PAGE_SIZE = 50;
const app = document.querySelector<HTMLDivElement>('#app')!;

function el(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Icon-only mark for sidebar; full wordmark on login. Theme via prefers-color-scheme. */
function brandIconHtml(): string {
  return `<picture class="brand-mark">
    <source media="(prefers-color-scheme: light)" srcset="${import.meta.env.BASE_URL}brand/light-icon.png" />
    <img src="${import.meta.env.BASE_URL}brand/dark-icon.png" alt="" width="28" height="28" decoding="async" />
  </picture>`;
}

function brandFullHtml(): string {
  return `<picture class="brand-full">
    <source media="(prefers-color-scheme: light)" srcset="${import.meta.env.BASE_URL}brand/light-full.png" />
    <img src="${import.meta.env.BASE_URL}brand/dark-full.png" alt="Pont" width="220" height="294" decoding="async" />
  </picture>`;
}

function userDisplayName(me: UserRecord): string {
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ').trim();
  return name || me.username;
}

function route(): string {
  return (location.hash.replace(/^#/, '').split('?')[0]) || '/';
}

function queryParam(name: string): string | undefined {
  const query = location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get(name) ?? undefined : undefined;
}

const DEFAULT_MODELS_PROVIDER = 'opencode-go';

function modelsRoute(params: {
  provider?: string;
  free?: string;
  q?: string;
  sort?: string;
  dir?: string;
}): string {
  const search = new URLSearchParams();
  if (params.provider && params.provider !== DEFAULT_MODELS_PROVIDER) {
    search.set('provider', params.provider);
  }
  if (params.free) {
    search.set('free', params.free);
  }
  if (params.q) {
    search.set('q', params.q);
  }
  if (params.sort) {
    search.set('sort', params.sort);
  }
  if (params.dir && params.dir !== 'asc') {
    search.set('dir', params.dir);
  }
  const qs = search.toString();
  return qs ? `/models?${qs}` : '/models';
}

function navigate(path: string): void {
  if (route() === path) {
    void render();
    return;
  }
  location.hash = path; // hashchange re-renders; rendering here too would race into duplicate pages
}

const numberFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function num(value: number): string {
  return numberFormat.format(value ?? 0);
}

function compact(value: number): string {
  return compactFormat.format(value ?? 0);
}

function time(iso: string): string {
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** Old `#/admin/...` bookmarks land on the new top-level routes. */
const LEGACY_ROUTES: Record<string, string> = {
  '/admin': '/',
  '/admin/': '/',
  '/admin/logs': '/logs',
  '/admin/providers': '/providers',
  '/admin/users': '/users',
  '/api-key': '/endpoints',
};

async function render(): Promise<void> {
  const path = route();
  app.innerHTML = '';

  if (path === '/login') {
    app.append(renderLogin());
    return;
  }

  if (!token()) {
    navigate('/login');
    return;
  }

  let me: UserRecord;
  try {
    me = await apiFetch<UserRecord>('/me');
  } catch {
    setToken(null);
    navigate('/login');
    return;
  }

  const target = LEGACY_ROUTES[path] ?? path;
  if (target !== path) {
    // Keep the address bar clean for old `#/admin/...` bookmarks.
    history.replaceState(null, '', target === '/' ? location.pathname : `#${target}`);
  }
  document.title = `Pont · ${userDisplayName(me)}`;

  const shell = el(`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand" title="Pont">${brandIconHtml()}</div>
        <nav class="nav" id="nav"></nav>
        <div class="account">
          <div class="account-name">${esc(userDisplayName(me))}</div>
          <div class="account-meta muted mono">${esc(me.username)}</div>
          <div class="account-role">${me.admin ? 'Administrator' : 'Member'}</div>
          <button class="secondary small" id="logout">Sign out</button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `);

  const links: Array<[string, string]> = [
    ['/', 'Overview'],
    ['/models', 'Models'],
    ['/logs', 'Request logs'],
    ['/endpoints', 'Endpoints'],
    ...(me.admin
      ? ([
          ['/providers', 'Providers'],
          ['/users', 'Users'],
        ] as Array<[string, string]>)
      : []),
  ];
  const nav = shell.querySelector('#nav')!;
  for (const [href, label] of links) {
    const link = el(`<a class="nav-link${target === href ? ' active' : ''}" href="#${href}">${label}</a>`);
    nav.append(link);
  }
  shell.querySelector('#logout')!.addEventListener('click', () => {
    setToken(null);
    navigate('/login');
  });

  const main = shell.querySelector('#main')!;
  app.append(shell);

  try {
    if (target === '/') {
      main.append(await renderOverview(me));
    } else if (target === '/logs') {
      main.append(await renderLogs(me));
    } else if (target === '/models') {
      main.append(await renderModels(me));
    } else if (target === '/endpoints') {
      main.append(renderEndpoints(me));
    } else if (me.admin && target === '/providers') {
      main.append(await renderProviders());
    } else if (me.admin && target === '/user-models') {
      main.append(await renderUserModels());
    } else if (me.admin && target === '/users') {
      main.append(await renderUsers());
    } else {
      main.append(el('<section class="panel"><h1>Not found</h1><p class="muted">No such page.</p></section>'));
    }
  } catch (error) {
    main.append(el(`<section class="panel"><div class="alert">${esc(errorText(error))}</div></section>`));
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

function renderLogin(): HTMLElement {
  const card = el(`
    <div class="login">
      <form class="panel login-card" id="form">
        ${brandFullHtml()}
        <p class="muted">Sign in to manage your gateway key and usage.</p>
        <label for="username">Username</label>
        <input id="username" autocomplete="username" />
        <label for="password">Password</label>
        <input id="password" type="password" autocomplete="current-password" />
        <div class="alert" id="error" hidden></div>
        <button id="submit" type="submit">Sign in</button>
      </form>
    </div>
  `);
  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    const username = (card.querySelector('#username') as HTMLInputElement).value.trim();
    const password = (card.querySelector('#password') as HTMLInputElement).value;
    const errorEl = card.querySelector('#error') as HTMLElement;
    errorEl.hidden = true;
    try {
      const result = await apiFetch<{ token: string }>('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(result.token);
      navigate('/');
    } catch {
      errorEl.textContent = 'Invalid username or password';
      errorEl.hidden = false;
    }
  };
  card.querySelector('#form')!.addEventListener('submit', (e) => void submit(e));
  return card;
}

function statCard(label: string, value: string, hint?: string): HTMLElement {
  return el(`
    <div class="stat">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(value)}</div>
      ${hint ? `<div class="stat-hint">${esc(hint)}</div>` : ''}
    </div>
  `);
}

function breakdownTable(title: string, rows: UsageBreakdown[]): HTMLElement {
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr><td class="mono">${esc(row.key || 'unknown')}</td><td class="num">${num(row.requests)}</td><td class="num">${num(row.tokens)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="muted">No traffic in this window.</td></tr>';
  return el(`
    <div class="panel">
      <h2>${esc(title)}</h2>
      <table>
        <thead><tr><th>Name</th><th class="num">Requests</th><th class="num">Tokens</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `);
}

async function vpnPanel(): Promise<HTMLElement> {
  const panel = el(`
    <div class="panel">
      <div class="panel-head">
        <h2>VPN</h2>
        <button class="secondary small" id="vpn-refresh">Refresh</button>
      </div>
      <div class="stats" id="vpn-stats"></div>
      <p class="muted" id="vpn-note"></p>
    </div>
  `);
  const fill = async (refresh: boolean): Promise<void> => {
    const stats = panel.querySelector('#vpn-stats')!;
    const note = panel.querySelector('#vpn-note')!;
    try {
      const status = await apiFetch<VpnStatus>(`/vpn/status${refresh ? '?refresh=1' : ''}`);
      const state = status.up ? 'Connected' : status.skipped ? 'Skipped' : 'Down';
      stats.replaceChildren(
        statCard('Tunnel', state, `${status.interface}${status.assignedIp ? ` · ${status.assignedIp}` : ''}`),
        statCard('Public IP', status.publicIp ?? '—', status.publicIpError ?? undefined),
      );
      note.textContent = `Checked ${time(status.checkedAt)}`;
    } catch (error) {
      note.textContent = errorText(error);
    }
  };
  const button = panel.querySelector('#vpn-refresh') as HTMLButtonElement;
  button.addEventListener('click', async () => {
    button.disabled = true;
    await fill(true);
    button.disabled = false;
  });
  await fill(false);
  return panel;
}

async function renderOverview(me: UserRecord): Promise<HTMLElement> {
  const stats = await apiFetch<RequestStats>('/stats');
  const wrap = el('<div class="page"></div>');

  wrap.append(
    el(`
      <header class="page-head">
        <div>
          <h1>Overview</h1>
          <p class="muted">${me.admin ? 'Gateway-wide usage for the last 24 hours.' : 'Your usage for the last 24 hours.'}</p>
        </div>
      </header>
    `),
  );

  const grid = el('<div class="stats"></div>');
  grid.append(
    statCard('Requests (24h)', num(stats.window.requests)),
    statCard('Tokens (24h)', compact(stats.window.tokens)),
    statCard('Avg latency', `${num(stats.window.avgDurationMs)} ms`),
    statCard('Error rate', `${(stats.window.errorRate * 100).toFixed(1)}%`),
    statCard('All-time requests', num(stats.allTime.requests)),
    statCard('All-time tokens', compact(stats.allTime.tokens)),
  );
  wrap.append(grid);

  const charts = el('<div class="grid-2"></div>');
  charts.append(breakdownTable('By app', stats.byApp), breakdownTable('By model', stats.byModel));
  wrap.append(await vpnPanel(), charts);
  if (me.admin) {
    wrap.append(breakdownTable('By user', stats.byUser));
  }
  return wrap;
}

function logsTable(items: LogRecord[], showUser: boolean): HTMLElement {
  const rows = items.length
    ? items
        .map(
          (row) => `
        <tr>
          <td class="muted nowrap">${esc(time(row.createdAt))}</td>
          <td><span class="badge">${esc(row.app || 'unknown')}</span></td>
          ${showUser ? `<td>${esc(row.username)}</td>` : ''}
          <td class="mono">${esc(row.providerModel)}</td>
          <td class="title" title="${esc(row.title)}">${esc(row.title) || '<span class="muted">—</span>'}</td>
          <td class="num">${num(row.totalTokens)}</td>
          <td class="num">${num(row.durationMs)}</td>
          <td><span class="badge ${row.status >= 400 ? 'bad' : 'good'}">${row.status}</span></td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="${showUser ? 8 : 7}" class="muted">No requests yet.</td></tr>`;
  return el(`
    <table>
      <thead>
        <tr>
          <th>Time</th><th>App</th>${showUser ? '<th>User</th>' : ''}
          <th>Model</th><th>Prompt</th><th class="num">Tokens</th><th class="num">ms</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

async function renderLogs(me: UserRecord): Promise<HTMLElement> {
  const offset = Number(queryParam('offset') ?? 0) || 0;
  const { items, total } = await apiFetch<{ items: LogRecord[]; total: number }>(`/logs?limit=${PAGE_SIZE}&offset=${offset}`);
  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Request logs</h1>
          <p class="muted">${me.admin ? `${num(total)} requests from all users.` : `${num(total)} of your own requests.`}</p>
        </div>
      </header>
      <div class="panel"></div>
    </div>
  `);
  const panel = wrap.querySelector('.panel')!;
  panel.append(logsTable(items, me.admin));

  const pager = el('<div class="pager"></div>');
  const prev = el(`<button class="secondary small" ${offset === 0 ? 'disabled' : ''}>Previous</button>`);
  const next = el(`<button class="secondary small" ${offset + PAGE_SIZE >= total ? 'disabled' : ''}>Next</button>`);
  prev.addEventListener('click', () => navigate(`/logs?offset=${Math.max(0, offset - PAGE_SIZE)}`));
  next.addEventListener('click', () => navigate(`/logs?offset=${offset + PAGE_SIZE}`));
  pager.append(
    prev,
    el(`<span class="muted">${num(offset + 1)}–${num(Math.min(offset + PAGE_SIZE, total))} of ${num(total)}</span>`),
    next,
  );
  panel.append(pager);
  return wrap;
}

interface ModelAllowlistRow {
  id: string;
  providerId: string;
  enabled: boolean;
}

interface CatalogModelRow {
  id: string;
  providerId: string;
  owner: string;
  model: string;
  contextLength: number | null;
  free: boolean;
  inputToken: string | null;
  inputCacheToken: string | null;
  outputToken: string | null;
  outputCacheToken: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  'opencode-go': 'OpenCode Go',
  openrouter: 'OpenRouter',
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

function pricePerMillionUsd(raw: string | null): string {
  if (!raw) {
    return '—';
  }
  const perToken = Number(raw);
  if (!Number.isFinite(perToken)) {
    return raw;
  }
  if (perToken === 0) {
    return '$0';
  }
  const perMillion = perToken * 1_000_000;
  if (perMillion >= 1) {
    return `$${perMillion.toFixed(2)}/M`;
  }
  if (perMillion >= 0.01) {
    return `$${perMillion.toFixed(3)}/M`;
  }
  return `$${perMillion.toExponential(2)}/M`;
}

type CatalogSortKey =
  | 'providerId'
  | 'owner'
  | 'model'
  | 'id'
  | 'contextLength'
  | 'inputToken'
  | 'inputCacheToken'
  | 'outputToken'
  | 'outputCacheToken';

const CATALOG_SORT_KEYS: CatalogSortKey[] = [
  'providerId',
  'owner',
  'model',
  'id',
  'contextLength',
  'inputToken',
  'inputCacheToken',
  'outputToken',
  'outputCacheToken',
];

function catalogSortKey(raw: string | undefined): CatalogSortKey {
  if (raw && (CATALOG_SORT_KEYS as string[]).includes(raw)) {
    return raw as CatalogSortKey;
  }
  return 'providerId';
}

function upstreamSlugFromPontId(pontId: string): string {
  const match = pontId.trim().match(/^(opencode|openrouter)-(.+)$/i);
  if (!match) {
    return pontId;
  }
  let slug = match[2];
  if (slug.toLowerCase().endsWith('-free')) {
    slug = slug.slice(0, -5);
  }
  return slug;
}

function catalogModelSlug(row: CatalogModelRow): string {
  const upstream = upstreamSlugFromPontId(row.id);
  const slash = upstream.lastIndexOf('/');
  const tail = slash >= 0 ? upstream.slice(slash + 1) : upstream;
  return tail.replace(/^~+/, '');
}

function catalogOwnerLabel(owner: string): string {
  const bare = owner.replace(/^~+/, '').trim();
  if (!bare) {
    return owner;
  }
  return bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase();
}

function formatContextLength(value: number | null): string {
  if (!value || value <= 0) {
    return '—';
  }
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return num(value);
}

function priceSortValue(raw: string | null): number {
  if (!raw) {
    return -1;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : -1;
}

function sortCatalogRows(
  rows: CatalogModelRow[],
  sort: CatalogSortKey,
  dir: 'asc' | 'desc',
): CatalogModelRow[] {
  const mult = dir === 'asc' ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case 'providerId':
        cmp = providerLabel(a.providerId).localeCompare(providerLabel(b.providerId));
        break;
      case 'owner':
        cmp = catalogOwnerLabel(a.owner).localeCompare(catalogOwnerLabel(b.owner));
        break;
      case 'model':
        cmp = catalogModelSlug(a).localeCompare(catalogModelSlug(b));
        break;
      case 'id':
        cmp = a.id.localeCompare(b.id);
        break;
      case 'contextLength':
        cmp = (a.contextLength ?? 0) - (b.contextLength ?? 0);
        break;
      case 'inputToken':
        cmp = priceSortValue(a.inputToken) - priceSortValue(b.inputToken);
        break;
      case 'inputCacheToken':
        cmp = priceSortValue(a.inputCacheToken) - priceSortValue(b.inputCacheToken);
        break;
      case 'outputToken':
        cmp = priceSortValue(a.outputToken) - priceSortValue(b.outputToken);
        break;
      case 'outputCacheToken':
        cmp = priceSortValue(a.outputCacheToken) - priceSortValue(b.outputCacheToken);
        break;
      default: {
        const _exhaustive: never = sort;
        return _exhaustive;
      }
    }
    if (cmp === 0) {
      cmp = a.id.localeCompare(b.id);
    }
    return cmp * mult;
  });
  return sorted;
}

function filterCatalogRows(
  rows: CatalogModelRow[],
  filters: { provider?: string; free?: string; q?: string },
): CatalogModelRow[] {
  const q = filters.q?.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.provider && row.providerId !== filters.provider) {
      return false;
    }
    if (filters.free === '1' && !row.free) {
      return false;
    }
    if (filters.free === '0' && row.free) {
      return false;
    }
    if (!q) {
      return true;
    }
    const haystack =
      `${row.id} ${catalogModelSlug(row)} ${catalogOwnerLabel(row.owner)} ${row.owner} ${row.providerId}`.toLowerCase();
    return haystack.includes(q);
  });
}

async function renderModels(me: UserRecord): Promise<HTMLElement> {
  const rawProvider = queryParam('provider');
  const showAllProviders = rawProvider === 'all';
  const providerFilter = showAllProviders ? '' : (rawProvider ?? DEFAULT_MODELS_PROVIDER);
  const freeFilter = queryParam('free') ?? '';
  const qFilter = queryParam('q') ?? '';
  const sortKey = catalogSortKey(queryParam('sort'));
  const sortDir = queryParam('dir') === 'desc' ? 'desc' : 'asc';
  const { models } = await apiFetch<{ models: CatalogModelRow[] }>('/models');
  const hasOpenCodeGo = models.some((row) => row.providerId === DEFAULT_MODELS_PROVIDER);
  const defaultToAll = rawProvider === undefined && !hasOpenCodeGo;
  const effectiveShowAll = showAllProviders || defaultToAll;
  const effectiveProviderFilter = effectiveShowAll ? '' : providerFilter;
  const filtered = sortCatalogRows(
    filterCatalogRows(models, {
      provider: effectiveProviderFilter || undefined,
      free: freeFilter || undefined,
      q: qFilter || undefined,
    }),
    sortKey,
    sortDir,
  );
  const providers = [...new Set(models.map((row) => row.providerId))];
  if (!providers.includes(DEFAULT_MODELS_PROVIDER)) {
    providers.push(DEFAULT_MODELS_PROVIDER);
  }
  providers.sort();
  const providerSelectValue = effectiveShowAll ? 'all' : providerFilter;
  const colCount = 9;

  const sortMark = (key: CatalogSortKey): string => {
    if (sortKey !== key) {
      return '';
    }
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const catalogTh = (key: CatalogSortKey, label: string, numCol = false): string => {
    const nextDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc';
    const href = modelsRoute({
      provider: providerSelectValue,
      free: freeFilter,
      q: qFilter,
      sort: key,
      dir: nextDir,
    });
    const cls = numCol ? 'num sortable' : 'sortable';
    const aria = sortKey === key ? ` aria-sort="${sortDir === 'asc' ? 'ascending' : 'descending'}"` : '';
    return `<th class="${cls}"${aria}><button type="button" class="th-sort" data-sort-href="${esc(href)}">${esc(label)}${sortMark(key)}</button></th>`;
  };

  const wrap = el(`
    <div class="page page--full">
      <header class="page-head">
        <div>
          <h1>Models</h1>
          <p class="muted">Catalog from providers with an API key. Prices are upstream USD per token (shown per 1M).</p>
        </div>
      </header>
      <div class="panel panel--flush-table">
        <div class="filters-row">
          <label>
            Provider
            <select id="models-provider">
              <option value="all"${providerSelectValue === 'all' ? ' selected' : ''}>All providers</option>
              ${providers
                .map((id) => {
                  const selected = providerSelectValue === id;
                  return `<option value="${esc(id)}"${selected ? ' selected' : ''}>${esc(providerLabel(id))}</option>`;
                })
                .join('')}
            </select>
          </label>
          <label>
            Free tier
            <select id="models-free">
              <option value=""${freeFilter === '' ? ' selected' : ''}>All</option>
              <option value="1"${freeFilter === '1' ? ' selected' : ''}>Free only</option>
              <option value="0"${freeFilter === '0' ? ' selected' : ''}>Paid only</option>
            </select>
          </label>
          <label>
            Search
            <input id="models-q" type="search" placeholder="Model, owner, id…" value="${esc(qFilter)}" />
          </label>
        </div>
        <p class="muted">${num(filtered.length)} of ${num(models.length)} models</p>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                ${catalogTh('providerId', 'Provider')}
                ${catalogTh('owner', 'Owner')}
                ${catalogTh('model', 'Model')}
                ${catalogTh('id', 'ID')}
                ${catalogTh('contextLength', 'Context length', true)}
                ${catalogTh('inputToken', 'Input token', true)}
                ${catalogTh('inputCacheToken', 'Input cache token', true)}
                ${catalogTh('outputToken', 'Output token', true)}
                ${catalogTh('outputCacheToken', 'Output cache token', true)}
              </tr>
            </thead>
            <tbody id="models-rows"></tbody>
          </table>
        </div>
      </div>
    </div>
  `);

  const tbody = wrap.querySelector('#models-rows')!;
  if (filtered.length === 0) {
    let msg = 'No models match these filters.';
    if (models.length === 0) {
      msg =
        'No models loaded. Add a provider API key under Admin → Providers, or check upstream connectivity.';
    } else if (!effectiveShowAll && providerFilter === DEFAULT_MODELS_PROVIDER && !hasOpenCodeGo) {
      msg =
        'No OpenCode Go models in catalog. Add an OpenCode Go API key under Admin → Providers, or set Provider to All providers.';
    }
    tbody.append(el(`<tr><td colspan="${colCount}" class="muted">${msg}</td></tr>`));
  } else {
    for (const row of filtered) {
      tbody.append(
        el(`
        <tr>
          <td>${esc(providerLabel(row.providerId))}</td>
          <td>${esc(catalogOwnerLabel(row.owner))}</td>
          <td class="mono">${esc(catalogModelSlug(row))}</td>
          <td class="mono">${esc(row.id)}</td>
          <td class="num">${esc(formatContextLength(row.contextLength))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.inputToken))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.inputCacheToken))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.outputToken))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.outputCacheToken))}</td>
        </tr>
      `),
      );
    }
  }

  for (const btn of wrap.querySelectorAll<HTMLButtonElement>('.th-sort')) {
    btn.addEventListener('click', () => {
      const href = btn.dataset.sortHref;
      if (href) {
        navigate(href);
      }
    });
  }

  const applyFilters = (): void => {
    const providerRaw = (wrap.querySelector('#models-provider') as HTMLSelectElement).value;
    const provider = providerRaw === 'all' ? 'all' : providerRaw;
    const free = (wrap.querySelector('#models-free') as HTMLSelectElement).value;
    const q = (wrap.querySelector('#models-q') as HTMLInputElement).value.trim();
    navigate(
      modelsRoute({
        provider,
        free,
        q,
        sort: sortKey,
        dir: sortDir,
      }),
    );
  };
  wrap.querySelector('#models-provider')!.addEventListener('change', applyFilters);
  wrap.querySelector('#models-free')!.addEventListener('change', applyFilters);
  wrap.querySelector('#models-q')!.addEventListener('change', applyFilters);
  wrap.querySelector('#models-q')!.addEventListener('keydown', (event) => {
    if (event instanceof KeyboardEvent && event.key === 'Enter') {
      event.preventDefault();
      applyFilters();
    }
  });

  return wrap;
}

function userModelsRoute(username: string): string {
  return `/user-models?username=${encodeURIComponent(username)}`;
}

async function renderUserModels(): Promise<HTMLElement> {
  const username = queryParam('username')?.trim() ?? '';
  if (!username) {
    return el(
      '<section class="panel"><h1>User models</h1><p class="muted">Pick a user from the Users page.</p></section>',
    );
  }

  const showAllProviders = queryParam('all') === '1';
  const { customized, models } = await apiFetch<{ customized: boolean; models: ModelAllowlistRow[] }>(
    `/users/${encodeURIComponent(username)}/models`,
  );
  const byProvider = new Map<string, ModelAllowlistRow[]>();
  for (const row of models) {
    const list = byProvider.get(row.providerId) ?? [];
    list.push(row);
    byProvider.set(row.providerId, list);
  }
  const providerEntries =
    customized || showAllProviders
      ? [...byProvider.entries()]
      : [...byProvider.entries()].filter(([providerId]) => providerId === DEFAULT_MODELS_PROVIDER);

  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Models for ${esc(username)}</h1>
          <p class="muted">Per-user allowlist. Until you save, this user may use every model allowed on the gateway.</p>
        </div>
        <div class="page-actions">
          <a class="secondary button-link" href="#/users">Back to users</a>
          <button id="save-user-models">Save</button>
        </div>
      </header>
      <div class="panel" id="user-model-panels"></div>
      <p class="muted" id="user-model-status"></p>
    </div>
  `);

  const panels = wrap.querySelector('#user-model-panels')!;
  for (const [providerId, rows] of providerEntries) {
    const section = el(`
      <section class="eligible-group">
        <h2>${esc(providerId)}</h2>
        <div class="eligible-list"></div>
      </section>
    `);
    const list = section.querySelector('.eligible-list')!;
    for (const row of rows) {
      list.append(
        el(`
          <label class="check eligible-row">
            <input type="checkbox" data-model="${esc(row.id)}" ${row.enabled ? 'checked' : ''} />
            <span class="mono">${esc(row.id)}</span>
          </label>
        `),
      );
    }
    if (list.childElementCount === 0) {
      list.append(el('<p class="muted">No models in this group for this user.</p>'));
    }
    panels.append(section);
  }

  const status = wrap.querySelector('#user-model-status')!;
  status.textContent = customized
    ? 'Using a saved per-user allowlist.'
    : 'Default: all gateway-allowed models (not saved yet for this user).';

  wrap.querySelector('#save-user-models')!.addEventListener('click', async () => {
    const enabled = [...wrap.querySelectorAll<HTMLInputElement>('input[data-model]:checked')].map(
      (input) => input.dataset.model!,
    );
    try {
      await apiFetch(`/users/${encodeURIComponent(username)}/models`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      navigate(userModelsRoute(username));
    } catch (error) {
      status.textContent = errorText(error);
    }
  });

  return wrap;
}

async function renderProviders(): Promise<HTMLElement> {
  const keys = await apiFetch<ProviderKeyStatus[]>('/providers');
  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Provider keys</h1>
          <p class="muted">Stored keys win over environment variables. Leave blank and save to clear.</p>
        </div>
      </header>
      <div class="grid-2" id="cards"></div>
    </div>
  `);
  const cards = wrap.querySelector('#cards')!;
  for (const row of keys) {
    const card = el(`
      <div class="panel">
        <div class="panel-head">
          <h2>${esc(row.id)}</h2>
          <span class="badge ${row.source === 'none' ? 'bad' : 'good'}">${esc(row.source)}</span>
        </div>
        <p class="mono muted">${esc(row.maskedKey ?? 'no key')}</p>
        <label>API key</label>
        <input data-input="${esc(row.id)}" type="password" placeholder="Paste key (empty clears)" />
        <button data-save="${esc(row.id)}">Save</button>
      </div>
    `);
    card.querySelector('[data-save]')!.addEventListener('click', async () => {
      const input = card.querySelector('input') as HTMLInputElement;
      await apiFetch(`/providers/${encodeURIComponent(row.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ apiKey: input.value }),
      });
      navigate('/providers');
    });
    cards.append(card);
  }
  return wrap;
}

function userRow(user: UserRecord): HTMLElement {
  return el(`
    <tr>
      <td>${esc(user.username)}</td>
      <td class="muted">${esc([user.firstName, user.lastName].filter(Boolean).join(' ') || '—')}</td>
      <td class="muted">${esc(user.email || '—')}</td>
      <td><span class="badge ${user.admin ? 'good' : ''}">${user.admin ? 'admin' : 'member'}</span></td>
      <td><span class="badge ${user.enabled ? 'good' : 'bad'}">${user.enabled ? 'enabled' : 'disabled'}</span></td>
      <td><button type="button" class="key-prefix" data-show-key="${esc(user.username)}" title="Show full gateway key">${esc(user.gatewayApiKeyPrefix)}</button></td>
      <td><a class="secondary small button-link" href="#${userModelsRoute(user.username)}">Models</a></td>
      <td><button class="secondary small" data-rotate="${esc(user.username)}">Rotate key</button></td>
    </tr>
  `);
}

async function renderUsers(): Promise<HTMLElement> {
  const users = await apiFetch<UserRecord[]>('/users');
  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Users</h1>
          <p class="muted">${num(users.length)} accounts.</p>
        </div>
      </header>
      <div class="panel">
        <table>
          <thead>
            <tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Key</th><th>Models</th><th></th></tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
        <p class="muted small">Click a key prefix to reveal the full gateway key (stored when the key was created or rotated).</p>
        <div class="secret" id="created-key" hidden></div>
      </div>
      <div class="panel">
        <h2>Create user</h2>
        <div class="form-grid">
          <div><label>Username</label><input id="new-username" /></div>
          <div><label>Password</label><input id="new-password" type="password" /></div>
          <div><label>Email</label><input id="new-email" /></div>
          <div><label>First name</label><input id="new-first" /></div>
          <div><label>Last name</label><input id="new-last" /></div>
        </div>
        <label class="check"><input id="new-admin" type="checkbox" /> Admin</label>
        <button id="create-user">Create</button>
      </div>
    </div>
  `);

  const tbody = wrap.querySelector('#rows')!;
  for (const user of users) {
    tbody.append(userRow(user));
  }
  const secret = wrap.querySelector('#created-key') as HTMLElement;
  tbody.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const showKey = target.closest('[data-show-key]') as HTMLElement | null;
    if (showKey) {
      const username = showKey.dataset.showKey!;
      try {
        const result = await apiFetch<{ gatewayApiKey: string }>(
          `/users/${encodeURIComponent(username)}/gateway-key`,
        );
        secret.textContent = `${username} key: ${result.gatewayApiKey}`;
        secret.hidden = false;
      } catch (error) {
        secret.textContent = errorText(error);
        secret.hidden = false;
      }
      return;
    }
    const button = target.closest('[data-rotate]') as HTMLElement | null;
    if (!button) {
      return;
    }
    const username = button.dataset.rotate!;
    const result = await apiFetch<{ gatewayApiKey: string }>(`/users/${encodeURIComponent(username)}/gateway-key/rotate`, {
      method: 'POST',
    });
    secret.textContent = `${username} new key: ${result.gatewayApiKey}`;
    secret.hidden = false;
  });

  wrap.querySelector('#create-user')!.addEventListener('click', async () => {
    const value = (id: string): string => (wrap.querySelector(id) as HTMLInputElement).value.trim();
    const username = value('#new-username');
    try {
      const result = await apiFetch<{ gatewayApiKey: string }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: (wrap.querySelector('#new-password') as HTMLInputElement).value,
          email: value('#new-email'),
          firstName: value('#new-first'),
          lastName: value('#new-last'),
          enabled: true,
          admin: (wrap.querySelector('#new-admin') as HTMLInputElement).checked,
        }),
      });
      secret.textContent = `${username} key: ${result.gatewayApiKey}`;
      secret.hidden = false;
      navigate('/users');
    } catch (error) {
      secret.textContent = errorText(error);
      secret.hidden = false;
    }
  });
  return wrap;
}

/* endpoints --------------------------------------------------------------- */

type EndpointAuth = 'token' | 'gateway' | 'none';

interface EndpointDef {
  id: string;
  group: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  base: 'api' | 'gateway';
  auth: EndpointAuth;
  summary: string;
  admin?: boolean;
  body?: string;
  stream?: boolean;
}

/** Gateway routes sit beside `/api`, not under it: same origin behind nginx, host+port in dev. */
const API_ROOT = /^https?:\/\//i.test(API_BASE) ? API_BASE : `${location.origin}${API_BASE}`;
const GATEWAY_BASE = API_ROOT.replace(/\/api$/, '');

/** Doc paths keep their `/api` prefix for readability; the base already carries it. */
function endpointUrl(route: EndpointDef): string {
  return route.base === 'api' ? `${API_ROOT}${route.path.replace(/^\/api/, '')}` : `${GATEWAY_BASE}${route.path}`;
}
const GATEWAY_KEY_STORAGE = 'pont_gateway_key';

const CHAT_BODY = `{
  "model": "opencode-<model-slug>",
  "messages": [{ "role": "user", "content": "Say hi in five words." }]
}`;
const RESPONSES_BODY = `{
  "model": "opencode-<model-slug>",
  "input": "Say hi in five words."
}`;
const MESSAGES_BODY = `{
  "model": "opencode-<model-slug>",
  "max_tokens": 64,
  "messages": [{ "role": "user", "content": "Say hi in five words." }]
}`;

const ENDPOINTS: EndpointDef[] = [
  { id: 'unified-models', group: 'Gateway', method: 'GET', path: '/api/v1/models', base: 'gateway', auth: 'gateway', summary: 'All providers with a key, as Pont ids.' },
  { id: 'unified-chat', group: 'Gateway', method: 'POST', path: '/api/v1/chat/completions', base: 'gateway', auth: 'gateway', summary: 'One endpoint; model prefix picks the provider.', body: CHAT_BODY },
  { id: 'unified-responses', group: 'Gateway', method: 'POST', path: '/api/v1/responses', base: 'gateway', auth: 'gateway', summary: 'OpenAI Responses API; model prefix picks the provider.', body: RESPONSES_BODY },
  { id: 'unified-messages', group: 'Gateway', method: 'POST', path: '/api/v1/messages', base: 'gateway', auth: 'gateway', summary: 'Anthropic messages API; model prefix picks the provider.', body: MESSAGES_BODY },

  { id: 'openrouter-models', group: 'Gateway (pinned provider)', method: 'GET', path: '/openrouter/v1/models', base: 'gateway', auth: 'gateway', summary: 'List OpenRouter models as Pont ids.' },
  { id: 'openrouter-chat', group: 'Gateway (pinned provider)', method: 'POST', path: '/openrouter/v1/chat/completions', base: 'gateway', auth: 'gateway', summary: 'OpenAI chat completions.', body: CHAT_BODY },
  { id: 'openrouter-responses', group: 'Gateway (pinned provider)', method: 'POST', path: '/openrouter/v1/responses', base: 'gateway', auth: 'gateway', summary: 'OpenAI Responses API.', body: RESPONSES_BODY },
  { id: 'opencode-models', group: 'Gateway (pinned provider)', method: 'GET', path: '/opencode-go/v1/models', base: 'gateway', auth: 'gateway', summary: 'List OpenCode Go models.' },
  { id: 'opencode-chat', group: 'Gateway (pinned provider)', method: 'POST', path: '/opencode-go/v1/chat/completions', base: 'gateway', auth: 'gateway', summary: 'OpenAI chat completions (bridged to Anthropic when needed).', body: CHAT_BODY },
  { id: 'opencode-responses', group: 'Gateway (pinned provider)', method: 'POST', path: '/opencode-go/v1/responses', base: 'gateway', auth: 'gateway', summary: 'OpenAI Responses API.', body: RESPONSES_BODY },
  { id: 'opencode-messages', group: 'Gateway (pinned provider)', method: 'POST', path: '/opencode-go/v1/messages', base: 'gateway', auth: 'gateway', summary: 'Anthropic messages API.', body: MESSAGES_BODY },

  { id: 'legacy-models', group: 'Gateway (legacy)', method: 'GET', path: '/zen/go/v1/models', base: 'gateway', auth: 'gateway', summary: 'OpenCode Go models on the old path.' },
  { id: 'legacy-chat', group: 'Gateway (legacy)', method: 'POST', path: '/zen/go/v1/chat/completions', base: 'gateway', auth: 'gateway', summary: 'Old path kept for existing clients.', body: CHAT_BODY },
  { id: 'legacy-responses', group: 'Gateway (legacy)', method: 'POST', path: '/zen/go/v1/responses', base: 'gateway', auth: 'gateway', summary: 'Old responses path.', body: RESPONSES_BODY },
  { id: 'legacy-messages', group: 'Gateway (legacy)', method: 'POST', path: '/zen/go/v1/messages', base: 'gateway', auth: 'gateway', summary: 'Old Anthropic messages path.', body: MESSAGES_BODY },

  { id: 'health', group: 'Health', method: 'GET', path: '/health', base: 'gateway', auth: 'none', summary: 'Liveness probe.' },
  { id: 'health-opencode', group: 'Health', method: 'GET', path: '/health/opencode', base: 'gateway', auth: 'none', summary: 'Upstream OpenCode Go reachability.' },

  { id: 'login', group: 'API', method: 'POST', path: '/api/login', base: 'api', auth: 'none', summary: 'Exchange username/password for a session token.', body: `{
  "username": "<username>",
  "password": "<password>"
}` },
  { id: 'me', group: 'API', method: 'GET', path: '/api/me', base: 'api', auth: 'token', summary: 'Current account.' },
  { id: 'me-key', group: 'API', method: 'GET', path: '/api/me/gateway-key', base: 'api', auth: 'token', summary: 'Own gateway key prefix.' },
  { id: 'me-key-rotate', group: 'API', method: 'POST', path: '/api/me/gateway-key/rotate', base: 'api', auth: 'token', summary: 'Rotate own gateway key; the new key is returned once.' },
  { id: 'logs', group: 'API', method: 'GET', path: '/api/logs?limit=20&offset=0', base: 'api', auth: 'token', summary: 'Own request logs (all users for admins).' },
  { id: 'stats', group: 'API', method: 'GET', path: '/api/stats', base: 'api', auth: 'token', summary: '24h usage breakdown.' },
  { id: 'models-catalog', group: 'API', method: 'GET', path: '/api/models', base: 'api', auth: 'token', summary: 'Keyed providers’ models with upstream pricing and context metadata.' },
  { id: 'vpn-status', group: 'API', method: 'GET', path: '/api/vpn/status?refresh=1', base: 'api', auth: 'token', summary: 'VPN tunnel state and egress public IP.' },
  { id: 'events', group: 'API', method: 'GET', path: '/api/events', base: 'api', auth: 'token', summary: 'Server-sent events live log stream (3s sample).', stream: true },

  { id: 'users', group: 'Admin', method: 'GET', path: '/api/users', base: 'api', auth: 'token', admin: true, summary: 'List accounts.' },
  { id: 'user-create', group: 'Admin', method: 'POST', path: '/api/users', base: 'api', auth: 'token', admin: true, summary: 'Create an account; returns its gateway key.', body: `{
  "username": "new-user",
  "password": "changeme123",
  "email": "",
  "firstName": "",
  "lastName": "",
  "enabled": true,
  "admin": false
}` },
  { id: 'user-update', group: 'Admin', method: 'PUT', path: '/api/users/:username', base: 'api', auth: 'token', admin: true, summary: 'Update an account (all fields required).', body: `{
  "email": "",
  "firstName": "Test",
  "lastName": "User",
  "enabled": true,
  "admin": false
}` },
  { id: 'user-delete', group: 'Admin', method: 'DELETE', path: '/api/users/:username', base: 'api', auth: 'token', admin: true, summary: 'Delete an account.' },
  { id: 'user-key', group: 'Admin', method: 'GET', path: '/api/users/:username/gateway-key', base: 'api', auth: 'token', admin: true, summary: "Reveal a user's stored gateway key (admin)." },
  { id: 'user-key-rotate', group: 'Admin', method: 'POST', path: '/api/users/:username/gateway-key/rotate', base: 'api', auth: 'token', admin: true, summary: "Rotate another user's gateway key." },
  { id: 'user-models', group: 'Admin', method: 'GET', path: '/api/users/:username/models', base: 'api', auth: 'token', admin: true, summary: 'Per-user model allowlist.' },
  { id: 'user-models-save', group: 'Admin', method: 'PUT', path: '/api/users/:username/models', base: 'api', auth: 'token', admin: true, summary: 'Save which models a user may call.', body: `{
  "enabled": ["opencode-deepseek-4-1-free"]
}` },
  { id: 'providers', group: 'Admin', method: 'GET', path: '/api/providers', base: 'api', auth: 'token', admin: true, summary: 'Provider key status.' },
  { id: 'provider-key', group: 'Admin', method: 'PUT', path: '/api/providers/:id', base: 'api', auth: 'token', admin: true, summary: 'Set or clear a provider key.', body: `{
  "apiKey": ""
}` },
  { id: 'providers-catalog', group: 'Admin', method: 'GET', path: '/api/providers/catalog', base: 'api', auth: 'token', admin: true, summary: 'Provider catalog and their gateway prefixes.' },
  { id: 'provider-models', group: 'Admin', method: 'GET', path: '/api/providers/:id/models', base: 'api', auth: 'token', admin: true, summary: 'Live model list from a provider.' },
  { id: 'provider-test', group: 'Admin', method: 'POST', path: '/api/providers/:id/test', base: 'api', auth: 'token', admin: true, summary: 'Send a test chat through a provider.', body: `{
  "model": "opencode-<model-slug>"
}` },
];

function renderEndpoints(me: UserRecord): HTMLElement {
  const routes = ENDPOINTS.filter((endpoint) => !endpoint.admin || me.admin);
  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Endpoints</h1>
          <p class="muted">${routes.length} routes. Pick one, edit the path and body, then send a real request.</p>
        </div>
      </header>
      <div class="grid-2">
        <div class="panel"><h2>Routes</h2><div id="route-list"></div></div>
        <div class="panel" id="tester"></div>
      </div>
    </div>
  `);
  const list = wrap.querySelector('#route-list')!;
  const tester = wrap.querySelector<HTMLElement>('#tester')!;
  let selected = routes[0];

  const groups = new Map<string, EndpointDef[]>();
  for (const route of routes) {
    groups.set(route.group, [...(groups.get(route.group) ?? []), route]);
  }
  for (const [group, items] of groups) {
    const section = el(`<div class="endpoint-group"><h3>${esc(group)}</h3></div>`);
    section.append(
      el(`
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr class="endpoint-row" role="button" tabindex="0" data-id="${esc(item.id)}">
              <td><span class="badge">${esc(item.method)}</span></td>
              <td class="mono">${esc(item.path)}</td>
              <td class="muted">${esc(item.summary)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    `),
    );
    list.append(section);
  }

  function select(id: string | undefined): void {
    const route = routes.find((item) => item.id === id);
    if (!route) {
      return;
    }
    selected = route;
    for (const row of list.querySelectorAll<HTMLElement>('.endpoint-row')) {
      row.classList.toggle('selected', row.dataset.id === id);
    }
    drawTester();
  }

  list.addEventListener('click', (event) => {
    select((event.target as HTMLElement).closest<HTMLElement>('.endpoint-row')?.dataset.id);
  });
  list.addEventListener('keydown', (event) => {
    if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }
    const row = (event.target as HTMLElement).closest<HTMLElement>('.endpoint-row');
    if (row?.dataset.id) {
      event.preventDefault();
      select(row.dataset.id);
    }
  });

  function drawTester(): void {
    const hasBody = selected.method !== 'GET' && selected.method !== 'DELETE';
    tester.innerHTML = `
      <div class="panel-head"><h2>Try it</h2><span class="badge">${esc(selected.group)}</span></div>
      <p class="muted">${esc(selected.summary)}</p>
      <label for="ep-url">Request URL <span class="muted">— replace <code>:param</code> segments</span></label>
      <div class="field-row">
        <span class="badge">${esc(selected.method)}</span>
        <input id="ep-url" class="mono" value="${esc(endpointUrl(selected))}" />
      </div>
      <label for="ep-auth">Authorization</label>
      <select id="ep-auth">
        <option value="token">Session token (signed in)</option>
        <option value="gateway">Gateway key</option>
        <option value="none">None</option>
      </select>
      <div id="ep-gateway" hidden>
        <label for="ep-key">Gateway key</label>
        <input id="ep-key" class="mono" placeholder="pont_..." />
      </div>
      <label for="ep-body">Body (JSON)</label>
      <textarea id="ep-body" spellcheck="false" placeholder="${hasBody ? '' : 'No body for GET/DELETE.'}" ${hasBody ? '' : 'disabled'}></textarea>
      <button id="ep-send">Send</button>
      <div id="ep-result"></div>
    `;
    const auth = tester.querySelector('#ep-auth') as HTMLSelectElement;
    auth.value = selected.auth;
    const gateway = tester.querySelector('#ep-gateway') as HTMLElement;
    const syncAuth = (): void => {
      gateway.hidden = auth.value !== 'gateway';
    };
    auth.addEventListener('change', syncAuth);
    syncAuth();
    (tester.querySelector('#ep-key') as HTMLInputElement).value = localStorage.getItem(GATEWAY_KEY_STORAGE) ?? '';
    if (hasBody) {
      (tester.querySelector('#ep-body') as HTMLTextAreaElement).value = selected.body ?? '';
    }
    (tester.querySelector('#ep-send') as HTMLButtonElement).addEventListener('click', () => void sendRequest());
  }

  async function sendRequest(): Promise<void> {
    const url = (tester.querySelector('#ep-url') as HTMLInputElement).value.trim();
    const auth = (tester.querySelector('#ep-auth') as HTMLSelectElement).value as EndpointAuth;
    const body = (tester.querySelector('#ep-body') as HTMLTextAreaElement).value.trim();
    const result = tester.querySelector('#ep-result')!;
    const hasBody = selected.method !== 'GET' && selected.method !== 'DELETE';

    const headers: Record<string, string> = {};
    if (auth === 'token' && token()) {
      headers.Authorization = `Bearer ${token()}`;
    }
    if (auth === 'gateway') {
      const key = (tester.querySelector('#ep-key') as HTMLInputElement).value.trim();
      localStorage.setItem(GATEWAY_KEY_STORAGE, key);
      if (key) {
        headers.Authorization = `Bearer ${key}`;
      }
    }
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    const started = performance.now();
    result.innerHTML = '<p class="muted">Sending…</p>';
    // `/api/events` never ends on its own: stop listening after a few seconds and show what arrived.
    const controller = new AbortController();
    const streamTimer = selected.stream ? setTimeout(() => controller.abort(), 3000) : undefined;
    try {
      const response = await fetch(url, {
        method: selected.method,
        headers,
        body: hasBody ? body || undefined : undefined,
        signal: controller.signal,
      });
      const text = selected.stream ? await readStream(response, controller.signal) : await response.text();
      const pre = document.createElement('pre');
      pre.className = 'response';
      pre.textContent = prettyJson(text) || '(empty body)';
      result.replaceChildren(responseMeta(response, performance.now() - started), pre);
    } catch (error) {
      result.innerHTML = `<div class="alert">${esc(errorText(error))}</div>`;
    } finally {
      if (streamTimer) {
        clearTimeout(streamTimer);
      }
    }
  }

  async function readStream(response: Response, signal: AbortSignal): Promise<string> {
    if (!response.body) {
      return '';
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
    } catch {
      // aborted on purpose once the timer fires
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return text;
  }

  function responseMeta(response: Response, durationMs: number): HTMLElement {
    return el(`
      <div class="response-meta">
        <span class="badge ${response.ok ? 'good' : 'bad'}">${response.status} ${esc(response.statusText)}</span>
        <span class="muted">${Math.round(durationMs)} ms</span>
        <span class="muted mono">${esc(response.headers.get('content-type') ?? '')}</span>
      </div>
    `);
  }

  function prettyJson(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return trimmed; // SSE frames and plain text stay as-is
    }
  }

  select(selected.id);
  return wrap;
}

window.addEventListener('hashchange', () => {
  void render();
});
void render();
