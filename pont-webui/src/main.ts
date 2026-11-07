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
  timezone: string;
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
  sessionId: string;
  clientIp: string;
  promptTokens: number;
  completionTokens: number;
  inputCacheTokens: number;
  outputCacheTokens: number;
  totalTokens: number;
  durationMs: number;
  status: number;
  createdAt: string;
  requestJson?: string;
  responseCapture?: string;
}

interface SessionLogSummary {
  sessionId: string;
  username: string;
  providerModels: string[];
  ips: string[];
  promptTokens: number;
  completionTokens: number;
  inputCacheTokens: number;
  outputCacheTokens: number;
  durationMs: number;
  startedAt: string;
  statusCodes: number[];
  promptCount: number;
}

interface LogFilterOptions {
  apps: string[];
  users: string[];
  providerModels: string[];
  statuses: number[];
}

interface ConversationTurn {
  id: number;
  createdAt: string;
  providerModel: string;
  status: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  userText: string;
  assistantText: string;
  capturePreview: string | null;
}

interface SessionConversation {
  sessionId: string;
  username: string;
  turns: ConversationTurn[];
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
const SIDEBAR_COLLAPSED_KEY = 'pont.sidebarCollapsed';
const TIMEZONE_STORAGE_KEY = 'pont.webui.timezone';
let displayTimezone = 'UTC';
const app = document.querySelector<HTMLDivElement>('#app')!;

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function el(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement;
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function brandFullHtml(): string {
  return `<picture class="brand-full">
    <img src="${import.meta.env.BASE_URL}brand/dark-full.png" alt="Pont" width="220" height="294" decoding="async" />
  </picture>`;
}

function userDisplayName(me: UserRecord): string {
  const name = [me.firstName, me.lastName].filter(Boolean).join(' ').trim();
  return name || me.username;
}

function profileInitials(me: UserRecord): string {
  const first = me.firstName?.trim();
  const last = me.lastName?.trim();
  if (first && last) return (first.charAt(0) + last.charAt(0)).toUpperCase();
  const parts = userDisplayName(me).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  const fromUser = me.username.slice(0, 2);
  return (fromUser || '?').toUpperCase();
}

function sidebarToggleSvg(collapsed: boolean): string {
  if (collapsed) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`;
}

const NAV_ICON: Record<string, string> = {
  '/': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  '/providers':
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M6 6h12"/><path d="M6 6v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M9 12h6"/></svg>',
  '/playground':
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>',
  '/logs':
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
  '/settings':
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  '/endpoints':
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  '/users':
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

function navLinkHtml(href: string, label: string, active: boolean): string {
  const icon = NAV_ICON[href] ?? NAV_ICON['/'];
  return `<a class="nav-link${active ? ' active' : ''}" href="#${href}" title="${esc(label)}"><span class="nav-link-icon" aria-hidden="true">${icon}</span><span class="nav-link-label">${esc(label)}</span></a>`;
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
  return qs ? `/providers?${qs}` : '/providers';
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

function readTimezoneFallback(): string {
  try {
    return localStorage.getItem(TIMEZONE_STORAGE_KEY) || 'UTC';
  } catch {
    return 'UTC';
  }
}

function applyUserTimezone(me: UserRecord): void {
  displayTimezone = me.timezone?.trim() || readTimezoneFallback();
  try {
    localStorage.setItem(TIMEZONE_STORAGE_KEY, displayTimezone);
  } catch {
    /* private mode */
  }
}

function parseUtcDate(iso: string): Date {
  const normalized = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Date(normalized);
}

function splitProviderModel(providerModel: string): { provider: string; model: string } {
  const slash = providerModel.indexOf('/');
  if (slash <= 0) {
    return { provider: providerModel.trim() || '—', model: '—' };
  }
  return {
    provider: providerModel.slice(0, slash).trim() || '—',
    model: providerModel.slice(slash + 1).trim() || '—',
  };
}

function splitProviderModelsList(providerModels: string[]): { providers: string; models: string } {
  const providers = new Set<string>();
  const models = new Set<string>();
  for (const combined of providerModels) {
    const { provider, model } = splitProviderModel(combined);
    if (provider !== '—') providers.add(provider);
    if (model !== '—') models.add(model);
  }
  return {
    providers: [...providers].join(', ') || '—',
    models: [...models].join(', ') || '—',
  };
}

function formatDurationMmSs(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(iso: string, timeZone = displayTimezone): string {
  const date = parseUtcDate(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const tz = timeZone?.trim() || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(date)
      .replace(',', '');
  } catch {
    return iso;
  }
}

function time(iso: string): string {
  return formatDateTime(iso);
}

function listTimezones(): string[] {
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
  }
  return ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tehran'];
}

interface TzParts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

function partsInTimeZone(ms: number, timeZone: string): TzParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const pick = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: pick('year'), m: pick('month'), d: pick('day'), h: pick('hour'), min: pick('minute'), s: pick('second') };
}

/** Local calendar date (YYYY-MM-DD) at 00:00 in timeZone → UTC ISO instant. */
function localDateMidnightUtcIso(ymd: string, timeZone: string): string {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  let ms = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 96; i += 1) {
    const p = partsInTimeZone(ms, timeZone);
    const deltaMs = ((p.h * 3600 + p.min * 60 + p.s) * 1000);
    ms -= deltaMs;
    const p2 = partsInTimeZone(ms, timeZone);
    if (p2.y === y && p2.m === m && p2.d === d && p2.h === 0 && p2.min === 0 && p2.s === 0) {
      return new Date(ms).toISOString();
    }
  }
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function logsSessionIdFromRoute(): string | undefined {
  const match = route().match(/^\/logs\/sessions\/([^/]+)$/);
  return match?.[1];
}

function logsQueryParams(): URLSearchParams {
  const query = location.hash.split('?')[1];
  return new URLSearchParams(query ?? '');
}

function logsFilterQuery(extra: Record<string, string | number | undefined> = {}): string {
  const params = logsQueryParams();
  const keys = ['tab', 'app', 'user', 'providerModel', 'status', 'from', 'to', 'session'];
  const search = new URLSearchParams();
  for (const key of keys) {
    const value = extra[key] ?? params.get(key);
    if (value !== undefined && value !== null && String(value) !== '') {
      search.set(key, String(value));
    }
  }
  if (extra.offset !== undefined) {
    search.set('offset', String(extra.offset));
  } else if (params.has('offset')) {
    search.set('offset', params.get('offset')!);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

function logsApiQuery(offset: number): string {
  const params = logsQueryParams();
  const search = new URLSearchParams();
  search.set('limit', String(PAGE_SIZE));
  search.set('offset', String(offset));
  for (const key of ['app', 'user', 'providerModel', 'status', 'session']) {
    const value = params.get(key);
    if (value) {
      search.set(key === 'user' ? 'user' : key, value);
    }
  }
  const from = params.get('from');
  const to = params.get('to');
  if (from) {
    search.set('from', localDateMidnightUtcIso(from, displayTimezone));
  }
  if (to) {
    search.set('to', localDateMidnightUtcIso(addDaysYmd(to, 1), displayTimezone));
  }
  return search.toString();
}

function statusBadge(status: number): string {
  return `<span class="badge ${status >= 400 ? 'bad' : 'good'}">${status}</span>`;
}

function statusBadges(codes: number[]): string {
  if (!codes.length) {
    return '<span class="muted">—</span>';
  }
  return codes.map((code) => statusBadge(code)).join(' ');
}

/** Old `#/admin/...` bookmarks land on the new top-level routes. */
const LEGACY_ROUTES: Record<string, string> = {
  '/admin': '/',
  '/admin/': '/',
  '/admin/logs': '/logs',
  '/admin/providers': '/providers',
  '/admin/users': '/users',
  '/api-key': '/endpoints',
  '/models': '/providers',
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

  applyUserTimezone(me);

  const target = LEGACY_ROUTES[path] ?? path;
  if (target !== path) {
    const query = location.hash.split('?')[1];
    const hash = target === '/' ? '' : `#${target}${query ? `?${query}` : ''}`;
    history.replaceState(null, '', hash || location.pathname);
  }
  document.title = `Pont · ${userDisplayName(me)}`;

  const sidebarCollapsed = readSidebarCollapsed();
  const roleLabel = me.admin ? 'Administrator' : 'Member';
  const shell = el(`
    <div class="shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}">
      <aside class="sidebar">
        <div class="sidebar-top">
          <a class="sidebar-brand" href="#/" title="Pont overview">
            <img class="sidebar-brand-mark" src="${import.meta.env.BASE_URL}brand/dark-icon.png" alt="" width="28" height="28" decoding="async" />
            <span class="sidebar-brand-name">Pont</span>
          </a>
          <button type="button" class="sidebar-toggle" id="sidebar-toggle" aria-expanded="${sidebarCollapsed ? 'false' : 'true'}" aria-label="${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}" title="${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">${sidebarToggleSvg(sidebarCollapsed)}</button>
        </div>
        <p class="sidebar-section-label">Menu</p>
        <nav class="nav" id="nav" aria-label="Main"></nav>
        <div class="sidebar-footer">
          <div class="sidebar-user" title="${esc(userDisplayName(me))}">
            <div class="sidebar-user-avatar" aria-hidden="true">${esc(profileInitials(me))}</div>
            <div class="sidebar-user-text">
              <div class="sidebar-user-name">${esc(userDisplayName(me))}</div>
              <div class="sidebar-user-meta mono">${esc(me.username)} · ${esc(roleLabel)}</div>
            </div>
          </div>
          <button type="button" class="sidebar-logout secondary small" id="logout"><span class="sidebar-logout-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg></span><span class="sidebar-logout-label">Sign out</span></button>
        </div>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `);

  const links: Array<[string, string]> = [
    ['/', 'Overview'],
    ['/providers', 'Providers'],
    ['/playground', 'Playground'],
    ['/logs', 'Logs'],
    ['/endpoints', 'Endpoints'],
    ['/settings', 'Settings'],
    ...(me.admin ? ([['/users', 'Users']] as Array<[string, string]>) : []),
  ];
  const nav = shell.querySelector('#nav')!;
  const navActive =
    target === '/user-models' ? '/users' : target.startsWith('/logs') ? '/logs' : target;
  for (const [href, label] of links) {
    nav.append(el(navLinkHtml(href, label, navActive === href)));
  }
  const shellRoot = shell as HTMLDivElement;
  shell.querySelector('#sidebar-toggle')!.addEventListener('click', () => {
    const collapsed = shellRoot.classList.toggle('sidebar-collapsed');
    writeSidebarCollapsed(collapsed);
    const toggle = shell.querySelector('#sidebar-toggle') as HTMLButtonElement;
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    toggle.innerHTML = sidebarToggleSvg(collapsed);
  });
  shell.querySelector('#logout')!.addEventListener('click', () => {
    setToken(null);
    navigate('/login');
  });

  const main = shell.querySelector('#main')!;
  app.append(shell);

  try {
    if (target === '/') {
      main.append(await renderOverview(me));
    } else if (target.startsWith('/logs')) {
      const sessionId = logsSessionIdFromRoute();
      if (sessionId) {
        main.append(await renderLogSession(me, sessionId));
      } else {
        main.append(await renderLogs(me));
      }
    } else if (target === '/settings') {
      main.append(await renderSettings(me));
    } else if (target === '/endpoints') {
      main.append(renderEndpoints());
    } else if (target === '/providers') {
      main.append(await renderProvidersPage(me));
    } else if (target === '/playground') {
      main.append(await renderPlayground(me));
    } else if (me.admin && (target === '/users' || target === '/user-models')) {
      const modelsUsername =
        target === '/user-models' ? queryParam('username')?.trim() || undefined : undefined;
      main.append(await renderUsers(modelsUsername));
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
      void fetchSignedInGatewayKey().then((key) => {
        if (key) {
          persistGatewayKey(key);
        }
      });
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

function logsTabLink(tab: 'session' | 'prompt', label: string, active: boolean): string {
  const params = logsQueryParams();
  params.set('tab', tab);
  params.delete('offset');
  const qs = params.toString();
  return `<a class="logs-tab${active ? ' active' : ''}" href="#/logs${qs ? `?${qs}` : ''}">${esc(label)}</a>`;
}

async function showPromptModal(promptId: number): Promise<void> {
  const row = await apiFetch<LogRecord>(`/logs/prompts/${promptId}`);
  let userText = row.title;
  let assistantText = '';
  if (row.sessionId) {
    try {
      const conversation = await apiFetch<SessionConversation>(`/logs/sessions/${encodeURIComponent(row.sessionId)}`);
      const turn = conversation.turns.find((t) => t.id === promptId);
      if (turn) {
        userText = turn.userText;
        assistantText = turn.assistantText || turn.capturePreview || '';
      }
    } catch {
      /* use title */
    }
  }
  if (!assistantText && row.responseCapture) {
    assistantText = row.responseCapture.length > 4000 ? `${row.responseCapture.slice(0, 4000)}…` : row.responseCapture;
  }
  const backdrop = el(`
    <div class="modal-backdrop" data-prompt-close tabindex="-1">
      <div class="modal panel" role="dialog" aria-labelledby="prompt-modal-title">
        <div class="panel-head">
          <h2 id="prompt-modal-title">Prompt</h2>
          <button type="button" class="secondary small" data-prompt-close>Close</button>
        </div>
        <p class="muted mono">${esc(row.providerModel)} · ${esc(formatDateTime(row.createdAt))} · ${statusBadge(row.status)}</p>
        <h3>User</h3>
        <pre class="log-turn-text">${esc(userText || '—')}</pre>
        <h3>Assistant</h3>
        <pre class="log-turn-text">${esc(assistantText || '—')}</pre>
      </div>
    </div>
  `);
  const close = (): void => backdrop.remove();
  backdrop.querySelectorAll('[data-prompt-close]').forEach((node) => node.addEventListener('click', close));
  document.body.append(backdrop);
}

function attachLogActionHandlers(root: HTMLElement, me: UserRecord, reload: () => void): void {
  root.querySelectorAll<HTMLButtonElement>('[data-log-prompts]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const session = btn.dataset.logPrompts;
      if (!session) return;
      const params = logsQueryParams();
      params.set('tab', 'prompt');
      params.set('session', session);
      params.delete('offset');
      navigate(`/logs?${params.toString()}`);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-log-prompt]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const id = Number(btn.dataset.logPrompt);
      if (Number.isFinite(id)) void showPromptModal(id);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-log-delete]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const kind = btn.dataset.logDelete;
      const id = btn.dataset.logDeleteId;
      const session = btn.dataset.logDeleteSession;
      const label = kind === 'session' ? `session ${session}` : `log #${id}`;
      if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
      void (async () => {
        if (kind === 'session' && session) {
          await apiFetch(`/logs/sessions/${encodeURIComponent(session)}`, { method: 'DELETE' });
        } else if (id) {
          await apiFetch(`/logs/${id}`, { method: 'DELETE' });
        }
        reload();
      })();
    });
  });
  root.querySelectorAll<HTMLTableRowElement>('tr[data-session-row]').forEach((row) => {
    row.addEventListener('click', () => {
      const sessionId = row.dataset.sessionRow;
      if (sessionId) navigate(`/logs/sessions/${encodeURIComponent(sessionId)}`);
    });
  });
}

function renderLogsFilters(options: LogFilterOptions, me: UserRecord): HTMLElement {
  const params = logsQueryParams();
  const appOpts = ['<option value="">All apps</option>', ...options.apps.map((a) => `<option value="${esc(a)}"${params.get('app') === a ? ' selected' : ''}>${esc(a)}</option>`)].join('');
  const userOpts = me.admin
    ? ['<option value="">All users</option>', ...options.users.map((u) => `<option value="${esc(u)}"${params.get('user') === u ? ' selected' : ''}>${esc(u)}</option>`)].join('')
    : '';
  const modelOpts = [
    '<option value="">All provider/models</option>',
    ...options.providerModels.map(
      (m) => `<option value="${esc(m)}"${params.get('providerModel') === m ? ' selected' : ''}>${esc(m)}</option>`,
    ),
  ].join('');
  const statusOpts = [
    '<option value="">All statuses</option>',
    ...options.statuses.map(
      (s) => `<option value="${s}"${params.get('status') === String(s) ? ' selected' : ''}>${s}</option>`,
    ),
  ].join('');
  const filters = el(`
    <div class="filters-row filters-row--catalog logs-filters">
      <label>App <select id="log-filter-app">${appOpts}</select></label>
      ${me.admin ? `<label>User <select id="log-filter-user">${userOpts}</select></label>` : ''}
      <label>Provider/Model <select id="log-filter-model">${modelOpts}</select></label>
      <label>Status <select id="log-filter-status">${statusOpts}</select></label>
      <label>From <input id="log-filter-from" type="date" value="${esc(params.get('from') ?? '')}" /></label>
      <label>To <input id="log-filter-to" type="date" value="${esc(params.get('to') ?? '')}" /></label>
      <button type="button" class="secondary small" id="log-filter-apply">Apply</button>
      <button type="button" class="secondary small" id="log-filter-clear">Clear</button>
    </div>
  `);
  const apply = (): void => {
    const next = logsQueryParams();
    const tab = next.get('tab') || 'session';
    next.set('tab', tab);
    next.delete('offset');
    const setOrDelete = (key: string, value: string): void => {
      if (value) next.set(key, value);
      else next.delete(key);
    };
    setOrDelete('app', (filters.querySelector('#log-filter-app') as HTMLSelectElement).value.trim());
    if (me.admin) {
      setOrDelete('user', (filters.querySelector('#log-filter-user') as HTMLSelectElement).value.trim());
    }
    setOrDelete('providerModel', (filters.querySelector('#log-filter-model') as HTMLSelectElement).value.trim());
    setOrDelete('status', (filters.querySelector('#log-filter-status') as HTMLSelectElement).value.trim());
    setOrDelete('from', (filters.querySelector('#log-filter-from') as HTMLInputElement).value.trim());
    setOrDelete('to', (filters.querySelector('#log-filter-to') as HTMLInputElement).value.trim());
    navigate(`/logs?${next.toString()}`);
  };
  filters.querySelector('#log-filter-apply')!.addEventListener('click', apply);
  filters.querySelector('#log-filter-clear')!.addEventListener('click', () => {
    const tab = logsQueryParams().get('tab') || 'session';
    navigate(`/logs?tab=${tab}`);
  });
  return filters;
}

function renderSessionLogsTable(items: SessionLogSummary[], showUser: boolean): HTMLElement {
  const colSpan = showUser ? 13 : 12;
  const rows = items.length
    ? items
        .map(
          (row) => {
            const { providers, models } = splitProviderModelsList(row.providerModels);
            return `
        <tr class="logs-row-clickable" data-session-row="${esc(row.sessionId)}" title="Open conversation">
          ${showUser ? `<td>${esc(row.username)}</td>` : ''}
          <td class="mono">${esc(providers)}</td>
          <td class="mono">${esc(models)}</td>
          <td class="mono">${esc(row.ips.filter(Boolean).join(', ') || '—')}</td>
          <td class="mono truncate" title="${esc(row.sessionId)}">${esc(row.sessionId)}</td>
          <td class="num">${num(row.promptTokens)}</td>
          <td class="num">${num(row.completionTokens)}</td>
          <td class="num">${num(row.inputCacheTokens)}</td>
          <td class="num">${num(row.outputCacheTokens)}</td>
          <td class="num mono">${esc(formatDurationMmSs(row.durationMs))}</td>
          <td class="muted nowrap">${esc(formatDateTime(row.startedAt))}</td>
          <td>${statusBadges(row.statusCodes)}</td>
          <td class="logs-actions">
            <button type="button" class="secondary small" data-log-prompts="${esc(row.sessionId)}">Prompts</button>
            <button type="button" class="secondary small" data-log-delete="session" data-log-delete-session="${esc(row.sessionId)}">Delete</button>
          </td>
        </tr>`;
          },
        )
        .join('')
    : `<tr><td colspan="${colSpan}" class="muted">No sessions yet.</td></tr>`;
  return el(`
    <table>
      <thead>
        <tr>
          ${showUser ? '<th>User</th>' : ''}
          <th>Provider</th><th>Model</th><th>IPs</th><th>Session</th>
          <th class="num">Input tokens</th><th class="num">Output tokens</th>
          <th class="num">Input cache</th><th class="num">Output cache</th>
          <th class="num">Duration</th><th>Started at</th><th>Status codes</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

function renderPromptLogsTable(items: LogRecord[], showUser: boolean): HTMLElement {
  const colSpan = showUser ? 11 : 10;
  const rows = items.length
    ? items
        .map(
          (row) => {
            const { provider, model } = splitProviderModel(row.providerModel);
            return `
        <tr>
          ${showUser ? `<td>${esc(row.username)}</td>` : ''}
          <td class="mono">${esc(provider)}</td>
          <td class="mono">${esc(model)}</td>
          <td class="mono">${esc(row.clientIp || '—')}</td>
          <td class="title" title="${esc(row.title)}">${esc(row.title) || '<span class="muted">—</span>'}</td>
          <td class="num">${num(row.promptTokens)}</td>
          <td class="num">${num(row.completionTokens)}</td>
          <td class="num mono">${esc(formatDurationMmSs(row.durationMs))}</td>
          <td class="muted nowrap">${esc(formatDateTime(row.createdAt))}</td>
          <td>${statusBadge(row.status)}</td>
          <td class="logs-actions">
            <button type="button" class="secondary small" data-log-prompt="${row.id}">Prompt</button>
            <button type="button" class="secondary small" data-log-delete="prompt" data-log-delete-id="${row.id}">Delete</button>
          </td>
        </tr>`;
          },
        )
        .join('')
    : `<tr><td colspan="${colSpan}" class="muted">No prompts yet.</td></tr>`;
  return el(`
    <table>
      <thead>
        <tr>
          ${showUser ? '<th>User</th>' : ''}
          <th>Provider</th><th>Model</th><th>IP</th><th>Prompt</th>
          <th class="num">Input tokens</th><th class="num">Output tokens</th>
          <th class="num">Duration</th><th>Created at</th><th>Status code</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

async function renderLogs(me: UserRecord): Promise<HTMLElement> {
  const params = logsQueryParams();
  const tab = params.get('tab') === 'prompt' ? 'prompt' : 'session';
  const offset = Number(params.get('offset') ?? 0) || 0;
  const apiQs = logsApiQuery(offset);
  const filterOptions = await apiFetch<LogFilterOptions>('/logs/filter-options');

  let total = 0;
  let table: HTMLElement;
  if (tab === 'prompt') {
    const { items, total: promptTotal } = await apiFetch<{ items: LogRecord[]; total: number }>(`/logs/prompts?${apiQs}`);
    total = promptTotal;
    table = renderPromptLogsTable(items, me.admin);
  } else {
    const { items, total: sessionTotal } = await apiFetch<{ items: SessionLogSummary[]; total: number }>(
      `/logs/sessions?${apiQs}`,
    );
    total = sessionTotal;
    table = renderSessionLogsTable(items, me.admin);
  }

  const wrap = el(`
    <div class="page">
      <div class="logs-tabs">${logsTabLink('session', 'By session', tab === 'session')}${logsTabLink('prompt', 'By prompt', tab === 'prompt')}</div>
      <div class="panel panel--flush-table" id="logs-panel"></div>
    </div>
  `);
  const panel = wrap.querySelector('#logs-panel')!;
  panel.append(renderLogsFilters(filterOptions, me));
  panel.append(el('<div class="table-scroll"></div>'));
  panel.querySelector('.table-scroll')!.append(table);

  const reload = (): void => void render();
  attachLogActionHandlers(panel, me, reload);

  const pager = el('<div class="pager"></div>');
  const prev = el(`<button class="secondary small" ${offset === 0 ? 'disabled' : ''}>Previous</button>`);
  const next = el(`<button class="secondary small" ${offset + PAGE_SIZE >= total ? 'disabled' : ''}>Next</button>`);
  const goPage = (nextOffset: number): void => {
    const nextParams = logsQueryParams();
    nextParams.set('offset', String(nextOffset));
    navigate(`/logs?${nextParams.toString()}`);
  };
  prev.addEventListener('click', () => goPage(Math.max(0, offset - PAGE_SIZE)));
  next.addEventListener('click', () => goPage(offset + PAGE_SIZE));
  pager.append(
    prev,
    el(`<span class="muted">${num(offset + 1)}–${num(Math.min(offset + PAGE_SIZE, total))} of ${num(total)}</span>`),
    next,
  );
  panel.append(pager);
  return wrap;
}

async function renderLogSession(me: UserRecord, sessionId: string): Promise<HTMLElement> {
  const conversation = await apiFetch<SessionConversation>(`/logs/sessions/${encodeURIComponent(sessionId)}`);
  const turnsHtml = conversation.turns.length
    ? conversation.turns
        .map(
          (turn) => `
        <article class="log-turn panel">
          <header class="log-turn-head">
            <span class="mono">${esc(turn.providerModel)}</span>
            <span class="muted">${esc(formatDateTime(turn.createdAt))}</span>
            ${statusBadge(turn.status)}
            <span class="muted">${esc(formatDurationMmSs(turn.durationMs))} · in ${num(turn.promptTokens)} / out ${num(turn.completionTokens)}</span>
          </header>
          <h3>User</h3>
          <pre class="log-turn-text">${esc(turn.userText || '—')}</pre>
          <h3>Assistant</h3>
          <pre class="log-turn-text">${esc(turn.assistantText || turn.capturePreview || '—')}</pre>
        </article>`,
        )
        .join('')
    : '<p class="muted">No turns in this session.</p>';

  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <p><a class="muted" href="#/logs?tab=session">← Back to sessions</a></p>
          <h1>Session</h1>
          <p class="mono muted">${esc(conversation.sessionId)}</p>
          ${me.admin ? `<p class="muted">User ${esc(conversation.username)}</p>` : ''}
        </div>
      </header>
      <div class="log-conversation">${turnsHtml}</div>
    </div>
  `);
  return wrap;
}

async function renderSettings(me: UserRecord): Promise<HTMLElement> {
  const zones = listTimezones();
  const options = zones.map((zone) => `<option value="${esc(zone)}"${zone === displayTimezone ? ' selected' : ''}>${esc(zone)}</option>`).join('');
  const wrap = el(`
    <div class="page">
      <header class="page-head"><div><h1>Settings</h1><p class="muted">Panel preferences for ${esc(userDisplayName(me))}.</p></div></header>
      <form class="panel" id="settings-form">
        <label for="timezone">Timezone</label>
        <select id="timezone" name="timezone">${options}</select>
        <p class="muted">Log timestamps and dates use this timezone. Values are stored in UTC on the server.</p>
        <div class="alert" id="settings-error" hidden></div>
        <div class="alert good" id="settings-ok" hidden>Saved.</div>
        <button type="submit">Save</button>
      </form>
    </div>
  `);
  wrap.querySelector('#settings-form')!.addEventListener('submit', (event) => {
    event.preventDefault();
    const timezone = (wrap.querySelector('#timezone') as HTMLSelectElement).value.trim();
    const errorEl = wrap.querySelector('#settings-error') as HTMLElement;
    const okEl = wrap.querySelector('#settings-ok') as HTMLElement;
    errorEl.hidden = true;
    okEl.hidden = true;
    void (async () => {
      try {
        const updated = await apiFetch<UserRecord>('/me/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ timezone }),
        });
        applyUserTimezone(updated);
        okEl.hidden = false;
      } catch (error) {
        errorEl.textContent = errorText(error);
        errorEl.hidden = false;
      }
    })();
  });
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

const PONT_PROVIDER_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'opencode-go', label: 'OpenCode Go' },
  { id: 'opencode-zen', label: 'OpenCode Zen' },
  { id: 'openai-compatible', label: 'OpenAI-Compatible' },
];

function providerLabel(id: string): string {
  return PONT_PROVIDER_OPTIONS.find((row) => row.id === id)?.label ?? id;
}

function providerSlug(id: string): string {
  return id.replace(/[^a-z0-9-]/gi, '-');
}

function providerSelectOptions(selectedId: string): string {
  return PONT_PROVIDER_OPTIONS.map((row) => {
    const selected = selectedId === row.id;
    return `<option value="${esc(row.id)}"${selected ? ' selected' : ''}>${esc(row.label)}</option>`;
  }).join('');
}

function trimDecimalZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
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
    return '0';
  }
  const perMillion = perToken * 1_000_000;
  if (perMillion >= 1) {
    return trimDecimalZeros(perMillion.toFixed(2));
  }
  if (perMillion >= 0.01) {
    return trimDecimalZeros(perMillion.toFixed(3));
  }
  for (let decimals = 4; decimals <= 10; decimals++) {
    const formatted = trimDecimalZeros(perMillion.toFixed(decimals));
    if (Number(formatted) !== 0) {
      return formatted;
    }
  }
  return trimDecimalZeros(perMillion.toFixed(10));
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
  const match = pontId.trim().match(/^(opencodego|opencode|openrouter)-(.+)$/i);
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

function catalogRowIsFreeById(id: string): boolean {
  return id.toLowerCase().includes('free');
}

function catalogIdCell(row: CatalogModelRow): string {
  const badge = catalogRowIsFreeById(row.id) ? '<span class="badge good">free</span>' : '';
  return `<span class="id-cell"><span class="mono id-cell__id">${esc(row.id)}</span>${badge}</span>`;
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
    if (filters.free === '1' && !catalogRowIsFreeById(row.id)) {
      return false;
    }
    if (filters.free === '0' && catalogRowIsFreeById(row.id)) {
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

async function buildModelsCatalogPanel(
  isAdmin: boolean,
  catalogModels?: CatalogModelRow[],
): Promise<HTMLElement> {
  const rawProvider = queryParam('provider');
  const providerFilter =
    rawProvider && PONT_PROVIDER_OPTIONS.some((row) => row.id === rawProvider)
      ? rawProvider
      : DEFAULT_MODELS_PROVIDER;
  const freeFilter = queryParam('free') ?? '';
  const qFilter = queryParam('q') ?? '';
  const sortKey = catalogSortKey(queryParam('sort'));
  const sortDir = queryParam('dir') === 'desc' ? 'desc' : 'asc';
  const models =
    catalogModels ?? (await apiFetch<{ models: CatalogModelRow[] }>('/models')).models;
  const enabledById = new Map<string, boolean>();
  let gatewayAllowlistExplicit = false;
  if (isAdmin) {
    const eligibility = await apiFetch<{ explicit: boolean; models: ModelAllowlistRow[] }>(
      '/models/eligibility',
    );
    gatewayAllowlistExplicit = eligibility.explicit;
    for (const row of eligibility.models) {
      enabledById.set(row.id, row.enabled);
    }
    for (const row of models) {
      if (!enabledById.has(row.id)) {
        enabledById.set(
          row.id,
          gatewayAllowlistExplicit ? false : row.providerId === DEFAULT_MODELS_PROVIDER,
        );
      }
    }
  }
  const filtered = sortCatalogRows(
    filterCatalogRows(models, {
      provider: providerFilter,
      free: freeFilter || undefined,
      q: qFilter || undefined,
    }),
    sortKey,
    sortDir,
  );
  const providerSelectValue = providerFilter;
  const colCount = isAdmin ? 10 : 9;

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
      <div class="panel panel--flush-table providers-catalog-panel">
        <div class="panel-head providers-catalog-head">
          <div>
            <h2>Model catalog</h2>
            <p class="muted small">${
              isAdmin
                ? 'Toggle gateway access in the first column. Sort columns by clicking headers.'
                : 'Filter by provider, pricing tier, or search.'
            }</p>
          </div>
          <p class="catalog-count-badge mono" aria-live="polite">
            <span class="catalog-count-strong">${num(filtered.length)}</span>
            <span class="catalog-count-sep muted">/</span>
            <span class="muted">${num(models.length)}</span>
          </p>
        </div>
        <div class="filters-row filters-row--catalog">
          <label>
            Provider
            <select id="models-provider">
              ${providerSelectOptions(providerSelectValue)}
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
          <label class="filters-row-search">
            Search
            <span class="search-field-row">
              <input id="models-q" type="search" placeholder="Model, owner, id…" value="${esc(qFilter)}" aria-label="Search models" />
              <button type="button" class="secondary small" id="models-refresh" title="Reload catalog from providers">Refresh</button>
            </span>
          </label>
          ${isAdmin ? '<p class="muted small filters-eligibility" id="models-eligibility-status"></p>' : ''}
        </div>
        <div class="table-scroll providers-table-scroll">
          <table class="providers-table">
            <thead>
              <tr>
                ${isAdmin ? '<th class="num">Gateway</th>' : ''}
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
  `);

  const tbody = wrap.querySelector('#models-rows')!;
  const eligibilityStatus = wrap.querySelector('#models-eligibility-status') as HTMLElement | null;

  function syncEligibilityInputs(): void {
    for (const input of wrap.querySelectorAll<HTMLInputElement>('input[data-model-enable]')) {
      const id = input.dataset.modelEnable!;
      input.checked = enabledById.get(id) ?? false;
    }
  }

  async function persistGatewayEligibility(nextEnabled: string[]): Promise<void> {
    if (!isAdmin) {
      return;
    }
    if (eligibilityStatus) {
      eligibilityStatus.textContent = 'Saving…';
    }
    for (const input of wrap.querySelectorAll<HTMLInputElement>('input[data-model-enable]')) {
      input.disabled = true;
    }
    try {
      const result = await apiFetch<{ enabled: string[] }>('/models/eligibility', {
        method: 'PUT',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      gatewayAllowlistExplicit = true;
      enabledById.clear();
      for (const id of result.enabled) {
        enabledById.set(id, true);
      }
      for (const row of models) {
        if (!enabledById.has(row.id)) {
          enabledById.set(row.id, false);
        }
      }
      syncEligibilityInputs();
      if (eligibilityStatus) {
        eligibilityStatus.textContent = `${num(result.enabled.length)} model(s) enabled on gateway.`;
      }
    } catch (error) {
      syncEligibilityInputs();
      if (eligibilityStatus) {
        eligibilityStatus.textContent = errorText(error);
      }
    } finally {
      for (const input of wrap.querySelectorAll<HTMLInputElement>('input[data-model-enable]')) {
        input.disabled = false;
      }
    }
  }

  function onGatewayToggle(modelId: string, nextOn: boolean): void {
    const enabled = new Set<string>();
    for (const [id, on] of enabledById) {
      if (on) {
        enabled.add(id);
      }
    }
    if (nextOn) {
      enabled.add(modelId);
    } else {
      enabled.delete(modelId);
    }
    void persistGatewayEligibility([...enabled].sort((a, b) => a.localeCompare(b)));
  }
  if (filtered.length === 0) {
    let msg = 'No models match these filters.';
    if (models.length === 0) {
      msg = isAdmin
        ? 'No models loaded. Add a provider API key above, or check upstream connectivity.'
        : 'No models available for your account. Ask an administrator to configure provider keys.';
    } else {
      msg = isAdmin
        ? `No ${providerLabel(providerFilter)} models in catalog. Add an API key for this provider above.`
        : `No ${providerLabel(providerFilter)} models in your catalog. Ask an administrator to add a provider key.`;
    }
    tbody.append(el(`<tr><td colspan="${colCount}" class="muted">${msg}</td></tr>`));
  } else {
    for (const row of filtered) {
      const gatewayOn = enabledById.get(row.id) ?? false;
      const gatewayCell = isAdmin
        ? `<td class="num"><label class="switch-cell" title="Allow this model on the gateway"><input type="checkbox" class="switch" data-model-enable="${esc(row.id)}" ${gatewayOn ? 'checked' : ''} aria-label="Enable ${esc(row.id)} on gateway" /></label></td>`
        : '';
      const tr = el(`
        <tr>
          ${gatewayCell}
          <td><span class="badge provider-badge provider-badge--${esc(providerSlug(row.providerId))}">${esc(providerLabel(row.providerId))}</span></td>
          <td>${esc(catalogOwnerLabel(row.owner))}</td>
          <td class="mono">${esc(catalogModelSlug(row))}</td>
          <td>${catalogIdCell(row)}</td>
          <td class="num">${esc(formatContextLength(row.contextLength))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.inputToken))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.inputCacheToken))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.outputToken))}</td>
          <td class="num mono">${esc(pricePerMillionUsd(row.outputCacheToken))}</td>
        </tr>
      `);
      if (isAdmin) {
        const toggle = tr.querySelector<HTMLInputElement>('input[data-model-enable]')!;
        toggle.addEventListener('change', () => {
          onGatewayToggle(row.id, toggle.checked);
        });
      }
      tbody.append(tr);
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
    const provider = (wrap.querySelector('#models-provider') as HTMLSelectElement).value;
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
  wrap.querySelector('#models-refresh')!.addEventListener('click', () => {
    const refreshBtn = wrap.querySelector('#models-refresh') as HTMLButtonElement;
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    navigate(
      modelsRoute({
        provider: providerSelectValue,
        free: freeFilter,
        q: qFilter,
        sort: sortKey,
        dir: sortDir,
      }),
    );
  });

  return wrap;
}

function userModelsRoute(username: string): string {
  return `/user-models?username=${encodeURIComponent(username)}`;
}

async function openUserModelsModal(wrap: HTMLElement, username: string): Promise<void> {
  const modal = wrap.querySelector('#user-models-modal') as HTMLElement;
  const title = wrap.querySelector('#user-models-title')!;
  const hint = wrap.querySelector('#user-models-hint') as HTMLElement;
  const panels = wrap.querySelector('#user-model-panels')!;
  const status = wrap.querySelector('#user-model-status')!;
  const saveBtn = wrap.querySelector('#save-user-models') as HTMLButtonElement;

  title.textContent = `Models for ${username}`;
  hint.hidden = false;
  panels.innerHTML = '<p class="muted">Loading…</p>';
  status.textContent = '';
  saveBtn.disabled = true;
  modal.hidden = false;

  const showAllProviders = queryParam('all') === '1';
  let customized = false;
  try {
    const result = await apiFetch<{ customized: boolean; models: ModelAllowlistRow[] }>(
      `/users/${encodeURIComponent(username)}/models`,
    );
    customized = result.customized;
    const byProvider = new Map<string, ModelAllowlistRow[]>();
    for (const row of result.models) {
      const list = byProvider.get(row.providerId) ?? [];
      list.push(row);
      byProvider.set(row.providerId, list);
    }
    const providerEntries =
      customized || showAllProviders
        ? [...byProvider.entries()]
        : [...byProvider.entries()].filter(([providerId]) => providerId === DEFAULT_MODELS_PROVIDER);

    panels.innerHTML = '';
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
    status.textContent = customized
      ? 'Using a saved per-user allowlist.'
      : 'Default: all gateway-allowed models (not saved yet for this user).';
  } catch (error) {
    panels.innerHTML = `<p class="alert">${esc(errorText(error))}</p>`;
    hint.hidden = true;
  } finally {
    saveBtn.disabled = false;
  }

  saveBtn.onclick = async () => {
    const enabled = [...modal.querySelectorAll<HTMLInputElement>('input[data-model]:checked')].map(
      (input) => input.dataset.model!,
    );
    try {
      await apiFetch(`/users/${encodeURIComponent(username)}/models`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      status.textContent = 'Saved.';
      await openUserModelsModal(wrap, username);
    } catch (error) {
      status.textContent = errorText(error);
    }
  };
}

async function renderProviderKeySection(): Promise<HTMLElement> {
  const keys = await apiFetch<ProviderKeyStatus[]>('/providers');
  const byId = new Map(keys.map((row) => [row.id, row]));
  const initialId =
    PONT_PROVIDER_OPTIONS.find((opt) => (byId.get(opt.id)?.source ?? 'none') !== 'none')?.id ??
    PONT_PROVIDER_OPTIONS[0].id;

  function statusFor(id: string): ProviderKeyStatus {
    return byId.get(id) ?? { id, source: 'none', maskedKey: undefined };
  }

  const configuredCount = PONT_PROVIDER_OPTIONS.filter(
    (opt) => statusFor(opt.id).source !== 'none',
  ).length;

  const statusCards = PONT_PROVIDER_OPTIONS.map((opt) => {
    const row = statusFor(opt.id);
    const connected = row.source !== 'none';
    return `
      <button type="button" class="provider-status-card${connected ? ' is-connected' : ''}" data-provider-pick="${esc(opt.id)}" aria-pressed="false">
        <span class="provider-status-card-top">
          <span class="provider-status-name">${esc(opt.label)}</span>
          <span class="badge ${connected ? 'good' : 'bad'}">${connected ? 'Connected' : 'Not set'}</span>
        </span>
        <span class="provider-status-meta mono">${connected ? esc(row.source) : 'No API key'}</span>
      </button>`;
  }).join('');

  const wrap = el(`
    <section class="provider-credentials" aria-labelledby="provider-credentials-title">
      <div class="provider-status-grid" role="list" aria-label="Provider connection status">${statusCards}</div>
      <div class="panel provider-key-panel">
        <div class="panel-head">
          <div>
            <h2 id="provider-credentials-title">API credentials</h2>
            <p class="muted small">${configuredCount} of ${PONT_PROVIDER_OPTIONS.length} providers configured</p>
          </div>
        </div>
        <div class="provider-key-row filters-row">
          <label>
            Provider
            <select id="provider-key-select">
              ${providerSelectOptions(initialId)}
            </select>
          </label>
          <label class="provider-key-field">
            API key
            <input id="provider-key-input" type="password" autocomplete="off" spellcheck="false" placeholder="Paste key (empty clears)" />
          </label>
          <button type="button" id="provider-key-save">Save key</button>
          <p class="provider-key-status mono muted" id="provider-key-status"></p>
        </div>
      </div>
    </section>
  `);
  const select = wrap.querySelector('#provider-key-select') as HTMLSelectElement;
  const input = wrap.querySelector('#provider-key-input') as HTMLInputElement;
  const statusEl = wrap.querySelector('#provider-key-status')!;
  let storedMask: string | undefined;
  let keyEditing = false;

  function showStoredKey(mask: string | undefined): void {
    storedMask = mask;
    keyEditing = false;
    if (mask) {
      input.type = 'text';
      input.readOnly = true;
      input.value = mask;
      input.placeholder = '';
    } else {
      input.type = 'password';
      input.readOnly = false;
      input.value = '';
      input.placeholder = 'Paste key (empty clears)';
    }
  }

  function syncStatus(providerId: string): void {
    const row = statusFor(providerId);
    const badgeClass = row.source === 'none' ? 'bad' : 'good';
    const hint =
      row.source === 'none' ? 'No API key · not set' : 'Click the field to replace the stored key';
    statusEl.innerHTML = `<span class="badge ${badgeClass}">${esc(row.source)}</span> ${esc(hint)}`;
    showStoredKey(row.maskedKey);
  }

  input.addEventListener('focus', () => {
    if (!input.readOnly || !storedMask) {
      return;
    }
    keyEditing = true;
    input.readOnly = false;
    input.type = 'password';
    input.value = '';
    input.placeholder = 'Paste new key (Save with empty clears)';
  });

  input.addEventListener('blur', () => {
    if (keyEditing && !input.value.trim() && storedMask) {
      showStoredKey(storedMask);
    }
  });

  function syncProviderCards(selectedId: string): void {
    for (const card of wrap.querySelectorAll<HTMLButtonElement>('.provider-status-card')) {
      const active = card.dataset.providerPick === selectedId;
      card.classList.toggle('is-selected', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  syncStatus(select.value);
  syncProviderCards(select.value);
  select.addEventListener('change', () => {
    syncStatus(select.value);
    syncProviderCards(select.value);
  });

  for (const card of wrap.querySelectorAll<HTMLButtonElement>('[data-provider-pick]')) {
    card.addEventListener('click', () => {
      const id = card.dataset.providerPick!;
      select.value = id;
      syncStatus(id);
      syncProviderCards(id);
      input.focus();
    });
  }

  wrap.querySelector('#provider-key-save')!.addEventListener('click', async () => {
    const providerId = select.value;
    if (!keyEditing && storedMask) {
      return;
    }
    await apiFetch(`/providers/${encodeURIComponent(providerId)}`, {
      method: 'PUT',
      body: JSON.stringify({ apiKey: input.value }),
    });
    navigate('/providers');
  });
  return wrap;
}

async function renderProvidersPage(me: UserRecord): Promise<HTMLElement> {
  const { models } = await apiFetch<{ models: CatalogModelRow[] }>('/models');
  const page = el('<div class="page providers-page"></div>');
  page.append(
    el(`
      <header class="page-head providers-page-head">
        <div>
          <h1>Providers</h1>
          <p class="muted">${
            me.admin
              ? 'Connect upstream APIs, browse models, and control which ones the gateway exposes.'
              : 'Models available on your gateway with pricing and context limits from the catalog.'
          }</p>
        </div>
        <div class="providers-head-meta">
          <span class="catalog-count-badge mono" title="Total models in catalog">${num(models.length)}<span class="muted"> models</span></span>
        </div>
      </header>
    `),
  );
  if (me.admin) {
    page.append(await renderProviderKeySection());
  }
  page.append(await buildModelsCatalogPanel(me.admin, models));
  return page;
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

async function renderUsers(openModelsFor?: string): Promise<HTMLElement> {
  const users = await apiFetch<UserRecord[]>('/users');
  const wrap = el(`
    <div class="page">
      <div class="panel">
        <div class="panel-head">
          <span></span>
          <button type="button" id="add-user">Add user</button>
        </div>
        <table>
          <thead>
            <tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Key</th><th>Models</th><th></th></tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
        <p class="muted small">Click a key prefix to reveal the full gateway key (stored when the key was created or rotated).</p>
        <div class="secret" id="created-key" hidden></div>
      </div>
      <div class="modal" id="create-user-modal" hidden>
        <div class="modal-backdrop" data-modal-close tabindex="-1"></div>
        <div class="modal-dialog panel" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
          <div class="panel-head">
            <h2 id="create-user-title">Create user</h2>
            <button type="button" class="secondary small" data-modal-close>Cancel</button>
          </div>
          <div class="form-grid">
            <div><label>Username</label><input id="new-username" autocomplete="off" /></div>
            <div><label>Password</label><input id="new-password" type="password" autocomplete="new-password" /></div>
            <div><label>Email</label><input id="new-email" type="email" autocomplete="off" /></div>
            <div><label>First name</label><input id="new-first" autocomplete="off" /></div>
            <div><label>Last name</label><input id="new-last" autocomplete="off" /></div>
          </div>
          <label class="check"><input id="new-admin" type="checkbox" /> Admin</label>
          <div class="modal-actions">
            <button type="button" class="secondary" data-modal-close>Cancel</button>
            <button type="button" id="create-user">Create</button>
          </div>
        </div>
      </div>
      <div class="modal" id="user-models-modal" hidden>
        <div class="modal-backdrop" data-user-models-close tabindex="-1"></div>
        <div class="modal-dialog panel modal-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="user-models-title">
          <div class="panel-head">
            <h2 id="user-models-title">User models</h2>
            <button type="button" class="secondary small" data-user-models-close>Close</button>
          </div>
          <p class="muted" id="user-models-hint">Per-user allowlist. Until you save, this user may use every model allowed on the gateway.</p>
          <div id="user-model-panels"></div>
          <p class="muted" id="user-model-status"></p>
          <div class="modal-actions">
            <button type="button" class="secondary" data-user-models-close>Cancel</button>
            <button type="button" id="save-user-models">Save</button>
          </div>
        </div>
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

  const modal = wrap.querySelector('#create-user-modal') as HTMLElement;
  const openCreateModal = (): void => {
    modal.hidden = false;
    (wrap.querySelector('#new-username') as HTMLInputElement).focus();
  };
  const closeCreateModal = (): void => {
    modal.hidden = true;
  };

  wrap.querySelector('#add-user')!.addEventListener('click', openCreateModal);
  for (const node of modal.querySelectorAll('[data-modal-close]')) {
    node.addEventListener('click', closeCreateModal);
  }
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeCreateModal();
    }
  });

  const userModelsModal = wrap.querySelector('#user-models-modal') as HTMLElement;
  const closeUserModelsModal = (): void => {
    userModelsModal.hidden = true;
    if (route() === '/user-models') {
      navigate('/users');
    }
  };
  for (const node of userModelsModal.querySelectorAll('[data-user-models-close]')) {
    node.addEventListener('click', closeUserModelsModal);
  }
  userModelsModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !userModelsModal.hidden) {
      closeUserModelsModal();
    }
  });

  if (openModelsFor) {
    void openUserModelsModal(wrap, openModelsFor);
  }

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
      closeCreateModal();
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

interface EndpointParam {
  name: string;
  in: 'header' | 'query' | 'path' | 'body';
  required: boolean;
  type?: string;
  description: string;
}

interface EndpointDef {
  id: string;
  group: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  base: 'api' | 'gateway';
  auth: EndpointAuth;
  summary: string;
  body?: string;
  params?: EndpointParam[];
}

/** Gateway routes sit beside `/api`, not under it: same origin behind nginx, host+port in dev. */
const API_ROOT = /^https?:\/\//i.test(API_BASE) ? API_BASE : `${location.origin}${API_BASE}`;
const GATEWAY_BASE = API_ROOT.replace(/\/api$/, '');

/** Doc paths keep their `/api` prefix for readability; the base already carries it. */
function endpointUrl(route: EndpointDef): string {
  return route.base === 'api' ? `${API_ROOT}${route.path.replace(/^\/api/, '')}` : `${GATEWAY_BASE}${route.path}`;
}
const GATEWAY_KEY_STORAGE = 'pont_gateway_key';

/** Signed-in users: server-stored secret beats stale localStorage (rotate, new volume). */
async function fetchSignedInGatewayKey(): Promise<string | null> {
  if (!token()) {
    return null;
  }
  try {
    const result = await apiFetch<{ gatewayApiKey: string }>('/me/gateway-key/reveal');
    return result.gatewayApiKey;
  } catch {
    return null;
  }
}

function persistGatewayKey(key: string): void {
  localStorage.setItem(GATEWAY_KEY_STORAGE, key);
}

async function ensureGatewayKeyPrefilled(input: HTMLInputElement): Promise<void> {
  const latest = await fetchSignedInGatewayKey();
  if (latest) {
    input.value = latest;
    persistGatewayKey(latest);
    return;
  }
  if (!input.value.trim()) {
    input.value = localStorage.getItem(GATEWAY_KEY_STORAGE) ?? '';
  }
}

async function resolveGatewayKeyForSend(keyInput: HTMLInputElement): Promise<string> {
  const latest = await fetchSignedInGatewayKey();
  if (latest) {
    keyInput.value = latest;
    persistGatewayKey(latest);
    return latest;
  }
  return keyInput.value.trim();
}

interface ProviderTestResult {
  providerId: string;
  endpointId: string;
  model?: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  sample: string;
}

const DEFAULT_PLAYGROUND_PROMPT = 'Reply with OK.';

function playgroundResultBlock(
  ok: boolean,
  status: number,
  latencyMs: number,
  sample: string,
  extra?: string,
): HTMLElement {
  const wrap = el('<div></div>');
  wrap.append(
    el(`
      <div class="response-meta">
        <span class="badge ${ok ? 'good' : 'bad'}">${status}</span>
        <span class="muted">${Math.round(latencyMs)} ms</span>
        ${extra ? `<span class="muted">${esc(extra)}</span>` : ''}
      </div>
    `),
  );
  const pre = document.createElement('pre');
  pre.className = 'response';
  pre.textContent = sample;
  wrap.append(pre);
  return wrap;
}

async function renderPlayground(me: UserRecord): Promise<HTMLElement> {
  const { models } = await apiFetch<{ models: CatalogModelRow[] }>('/models');
  const providers = [...new Set(models.map((row) => row.providerId))].sort();
  const wrap = el(`
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Playground</h1>
          <p class="muted">Send a short prompt through the gateway or, as admin, test a provider upstream.</p>
        </div>
      </header>
      <div class="grid-2">
        <div class="panel" id="pg-controls"></div>
        <div class="panel" id="pg-result">
          <h2>Result</h2>
          <p class="muted" id="pg-placeholder">Run a test to see the response here.</p>
        </div>
      </div>
    </div>
  `);

  const controls = wrap.querySelector('#pg-controls')!;
  const result = wrap.querySelector('#pg-result')!;
  const placeholder = wrap.querySelector('#pg-placeholder') as HTMLElement;

  controls.append(
    el(`
      <div class="playground-form">
      <h2>Request</h2>
      <label for="pg-mode">Mode</label>
      <select id="pg-mode">
        <option value="gateway">Gateway (unified /api/v1)</option>
        ${me.admin ? '<option value="upstream">Provider upstream (direct)</option>' : ''}
      </select>
      <label for="pg-provider">Provider</label>
      <select id="pg-provider">
        <option value="">All providers</option>
        ${providers
          .map((id) => `<option value="${esc(id)}">${esc(providerLabel(id))}</option>`)
          .join('')}
      </select>
      <label for="pg-model">Model</label>
      <select id="pg-model"></select>
      <label for="pg-prompt">Prompt</label>
      <textarea id="pg-prompt" spellcheck="false" rows="4">${esc(DEFAULT_PLAYGROUND_PROMPT)}</textarea>
      <button type="button" id="pg-run">Run test</button>
      </div>
    `),
  );

  const modeSelect = controls.querySelector('#pg-mode') as HTMLSelectElement;
  const providerSelect = controls.querySelector('#pg-provider') as HTMLSelectElement;
  const modelSelect = controls.querySelector('#pg-model') as HTMLSelectElement;
  const promptInput = controls.querySelector('#pg-prompt') as HTMLTextAreaElement;
  const runBtn = controls.querySelector('#pg-run') as HTMLButtonElement;

  let upstreamModelsByProvider = new Map<string, string[]>();

  function catalogModelsForProvider(providerId: string): CatalogModelRow[] {
    if (!providerId) {
      return models;
    }
    return models.filter((row) => row.providerId === providerId);
  }

  function fillModelSelect(providerId: string, upstreamIds?: string[]): void {
    modelSelect.innerHTML = '';
    const list =
      modeSelect.value === 'upstream' && upstreamIds
        ? upstreamIds.map((id) => ({ id, label: id }))
        : catalogModelsForProvider(providerId).map((row) => ({
            id: row.id,
            label: `${catalogModelSlug(row)} (${row.id})`,
          }));
    if (list.length === 0) {
      modelSelect.append(el('<option value="">No models</option>'));
      return;
    }
    for (const item of list) {
      modelSelect.append(el(`<option value="${esc(item.id)}">${esc(item.label)}</option>`));
    }
  }

  async function syncUpstreamModels(): Promise<void> {
    const providerId = providerSelect.value;
    if (!providerId) {
      fillModelSelect('');
      return;
    }
    if (!upstreamModelsByProvider.has(providerId)) {
      const { models: ids } = await apiFetch<{ models: string[] }>(
        `/providers/${encodeURIComponent(providerId)}/models`,
      );
      upstreamModelsByProvider.set(providerId, ids);
    }
    fillModelSelect(providerId, upstreamModelsByProvider.get(providerId));
  }

  function syncModeUi(): void {
    const upstream = modeSelect.value === 'upstream';
    if (upstream) {
      if (!providerSelect.value && providers[0]) {
        providerSelect.value = providers[0];
      }
      providerSelect.querySelector('option[value=""]')?.remove();
      void syncUpstreamModels();
    } else {
      if (!providerSelect.querySelector('option[value=""]')) {
        providerSelect.prepend(el('<option value="">All providers</option>'));
      }
      fillModelSelect(providerSelect.value);
    }
  }

  modeSelect.addEventListener('change', () => {
    upstreamModelsByProvider = new Map();
    syncModeUi();
  });
  providerSelect.addEventListener('change', () => {
    if (modeSelect.value === 'upstream') {
      void syncUpstreamModels();
    } else {
      fillModelSelect(providerSelect.value);
    }
  });

  fillModelSelect('');

  runBtn.addEventListener('click', () => void runTest());

  async function runTest(): Promise<void> {
    const prompt = promptInput.value.trim();
    const model = modelSelect.value.trim();
    if (!model) {
      placeholder.hidden = true;
      result.querySelectorAll('.response-meta, pre.response, .alert').forEach((node) => node.remove());
      result.append(el('<div class="alert">Pick a model first.</div>'));
      return;
    }
    if (!prompt) {
      placeholder.hidden = true;
      result.querySelectorAll('.response-meta, pre.response, .alert').forEach((node) => node.remove());
      result.append(el('<div class="alert">Prompt cannot be empty.</div>'));
      return;
    }

    runBtn.disabled = true;
    placeholder.hidden = true;
    result.querySelectorAll('.response-meta, pre.response, .alert').forEach((node) => node.remove());
    result.append(el('<p class="muted" id="pg-loading">Sending…</p>'));

    const started = performance.now();
    try {
      if (modeSelect.value === 'upstream') {
        const providerId = providerSelect.value;
        if (!providerId) {
          throw new Error('Select a provider for upstream tests.');
        }
        const test = await apiFetch<ProviderTestResult>(`/providers/${encodeURIComponent(providerId)}/test`, {
          method: 'POST',
          body: JSON.stringify({ model }),
        });
        result.querySelector('#pg-loading')?.remove();
        result.append(
          playgroundResultBlock(
            test.ok,
            test.status,
            test.latencyMs,
            test.sample,
            `${test.providerId} · ${test.endpointId}${test.model ? ` · ${test.model}` : ''}`,
          ),
        );
      } else {
        const keyInput = document.createElement('input');
        keyInput.value = localStorage.getItem(GATEWAY_KEY_STORAGE) ?? '';
        await ensureGatewayKeyPrefilled(keyInput);
        const key = await resolveGatewayKeyForSend(keyInput);
        if (!key) {
          throw new Error('Missing gateway key. Sign in or rotate a key under Users.');
        }
        const response = await fetch(`${GATEWAY_BASE}/api/v1/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 256,
          }),
        });
        const text = await response.text();
        const latencyMs = performance.now() - started;
        let sample = text.trim();
        try {
          const parsed = JSON.parse(text) as {
            choices?: { message?: { content?: string } }[];
            error?: { message?: string };
          };
          if (parsed.error?.message) {
            sample = parsed.error.message;
          } else if (parsed.choices?.[0]?.message?.content) {
            sample = parsed.choices[0].message!.content!;
          } else {
            sample = JSON.stringify(parsed, null, 2);
          }
        } catch {
          /* keep raw text */
        }
        result.querySelector('#pg-loading')?.remove();
        result.append(
          playgroundResultBlock(response.ok, response.status, latencyMs, sample, 'Gateway · chat/completions'),
        );
      }
    } catch (error) {
      result.querySelector('#pg-loading')?.remove();
      result.append(el(`<div class="alert">${esc(errorText(error))}</div>`));
    } finally {
      runBtn.disabled = false;
    }
  }

  return wrap;
}

const CHAT_BODY = `{
  "model": "opencodego-<model-slug>",
  "messages": [{ "role": "user", "content": "Say hi in five words." }]
}`;
const RESPONSES_BODY = `{
  "model": "opencodego-<model-slug>",
  "input": "Say hi in five words."
}`;

const GATEWAY_CLIENT_APP_HEADER: EndpointParam[] = [
  {
    name: 'client-app',
    in: 'header',
    required: false,
    type: 'string',
    description: 'Client label stored in request logs (chat, agent, extension, …).',
  },
];

const GATEWAY_CHAT_OPTIONAL_HEADERS: EndpointParam[] = [
  ...GATEWAY_CLIENT_APP_HEADER,
  {
    name: 'x-opencode-session',
    in: 'header',
    required: false,
    type: 'string',
    description: 'Stable conversation id for OpenCode Go; Pont generates one if omitted.',
  },
];

const GATEWAY_OPTIONAL_HEADERS: EndpointParam[] = [
  ...GATEWAY_CLIENT_APP_HEADER,
  {
    name: 'username',
    in: 'header',
    required: false,
    type: 'string',
    description: 'End-user id for this request (who invoked the client).',
  },
  {
    name: 'x-opencode-session',
    in: 'header',
    required: false,
    type: 'string',
    description: 'Stable conversation id for OpenCode Go; Pont generates one if omitted.',
  },
];

const CHAT_BODY_PARAMS: EndpointParam[] = [
  {
    name: 'model',
    in: 'body',
    required: true,
    type: 'string',
    description: 'Pont model id; prefix picks the provider (openrouter-…, opencode-…).',
  },
  {
    name: 'messages',
    in: 'body',
    required: true,
    type: 'array',
    description: 'Chat turns with role and content (OpenAI chat format).',
  },
  { name: 'max_tokens', in: 'body', required: false, type: 'number', description: 'Upper bound on generated tokens.' },
  { name: 'temperature', in: 'body', required: false, type: 'number', description: 'Sampling temperature.' },
  { name: 'stream', in: 'body', required: false, type: 'boolean', description: 'Stream tokens with SSE when true.' },
];

const RESPONSES_BODY_PARAMS: EndpointParam[] = [
  {
    name: 'model',
    in: 'body',
    required: true,
    type: 'string',
    description: 'Pont model id; prefix picks the provider.',
  },
  {
    name: 'input',
    in: 'body',
    required: true,
    type: 'string | array',
    description: 'Prompt or structured input for the Responses API.',
  },
  {
    name: 'max_output_tokens',
    in: 'body',
    required: false,
    type: 'number',
    description: 'Cap on generated output tokens.',
  },
  { name: 'stream', in: 'body', required: false, type: 'boolean', description: 'Stream with SSE when true.' },
];

function authParamsForRoute(route: EndpointDef): EndpointParam[] {
  if (route.auth === 'gateway') {
    return [
      {
        name: 'Authorization',
        in: 'header',
        required: true,
        type: 'Bearer pont_sk_…',
        description:
          'Per-user gateway key from the Pont panel (sign in with username/password, then reveal or rotate under Users). Session login tokens are rejected.',
      },
    ];
  }
  if (route.auth === 'token') {
    return [
      {
        name: 'Authorization',
        in: 'header',
        required: true,
        type: 'Bearer session',
        description: 'Session token from POST /api/login.',
      },
    ];
  }
  return [];
}

function renderEndpointParams(route: EndpointDef): string {
  const rows = [...authParamsForRoute(route), ...(route.params ?? [])];
  if (rows.length === 0) {
    return '<p class="muted small">No parameters.</p>';
  }
  return `
    <table class="param-table">
      <thead><tr><th>Name</th><th>In</th><th></th><th>Description</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (param) => `
          <tr>
            <td class="mono">${esc(param.name)}</td>
            <td class="muted">${esc(param.in)}</td>
            <td><span class="badge ${param.required ? 'param-required' : 'param-optional'}">${param.required ? 'Required' : 'Optional'}</span></td>
            <td class="muted">${param.type ? `<span class="mono">${esc(param.type)}</span> — ` : ''}${esc(param.description)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
}

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'unified-models',
    group: 'Gateway',
    method: 'GET',
    path: '/api/v1/models',
    base: 'gateway',
    auth: 'gateway',
    summary: 'All providers with a key, as Pont ids.',
    params: [...GATEWAY_CLIENT_APP_HEADER],
  },
  {
    id: 'unified-chat',
    group: 'Gateway',
    method: 'POST',
    path: '/api/v1/chat/completions',
    base: 'gateway',
    auth: 'gateway',
    summary: 'One endpoint; model prefix picks the provider.',
    body: CHAT_BODY,
    params: [...GATEWAY_CHAT_OPTIONAL_HEADERS, ...CHAT_BODY_PARAMS],
  },
  {
    id: 'unified-responses',
    group: 'Gateway',
    method: 'POST',
    path: '/api/v1/responses',
    base: 'gateway',
    auth: 'gateway',
    summary: 'OpenAI Responses API; model prefix picks the provider.',
    body: RESPONSES_BODY,
    params: [...GATEWAY_OPTIONAL_HEADERS, ...RESPONSES_BODY_PARAMS],
  },

  { id: 'health', group: 'Health', method: 'GET', path: '/health', base: 'gateway', auth: 'none', summary: 'Liveness probe.' },
];

function authSelectOptions(route: EndpointDef): Array<{ value: EndpointAuth; label: string }> {
  if (route.auth === 'gateway') {
    return [{ value: 'gateway', label: 'Gateway key (from panel after sign-in)' }];
  }
  if (route.auth === 'token') {
    return [{ value: 'token', label: 'Session token (signed in)' }];
  }
  return [{ value: 'none', label: 'None' }];
}

function renderEndpoints(): HTMLElement {
  const routes = ENDPOINTS;
  const wrap = el(`
    <div class="page">
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
        <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr class="endpoint-row" role="button" tabindex="0" data-id="${esc(item.id)}">
              <td><span class="badge">${esc(item.method)}</span></td>
              <td class="mono">${esc(endpointUrl(item))}</td>
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
      <h3>Parameters</h3>
      ${renderEndpointParams(selected)}
      <label for="ep-url">Request URL <span class="muted">— replace <code>:param</code> segments</span></label>
      <div class="field-row">
        <span class="badge">${esc(selected.method)}</span>
        <input id="ep-url" class="mono" value="${esc(endpointUrl(selected))}" />
      </div>
      <label for="ep-auth">Authorization</label>
      <select id="ep-auth">
        ${authSelectOptions(selected)
          .map((option) => `<option value="${esc(option.value)}">${esc(option.label)}</option>`)
          .join('')}
      </select>
      <div id="ep-gateway" hidden>
        <label for="ep-key">Gateway key</label>
        <input id="ep-key" class="mono" placeholder="pont_sk_..." />
        <p class="muted small">Only <code>pont_sk_…</code> keys issued for your account work here—not the login JWT. When signed in, Pont loads your key from the server.</p>
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
    const keyInput = tester.querySelector('#ep-key') as HTMLInputElement;
    keyInput.value = localStorage.getItem(GATEWAY_KEY_STORAGE) ?? '';
    void ensureGatewayKeyPrefilled(keyInput);
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
    if (auth === 'token' && selected.auth === 'token' && token()) {
      headers.Authorization = `Bearer ${token()}`;
    }
    if (auth === 'gateway') {
      const keyInput = tester.querySelector('#ep-key') as HTMLInputElement;
      const key = await resolveGatewayKeyForSend(keyInput);
      if (!key) {
        result.innerHTML =
          '<div class="alert">Missing gateway key. Sign in so Pont can prefill it, paste a <code>pont_sk_…</code> key, or rotate one under Users.</div>';
        return;
      }
      headers.Authorization = `Bearer ${key}`;
    }
    if (hasBody) {
      headers['Content-Type'] = 'application/json';
    }

    const started = performance.now();
    result.innerHTML = '<p class="muted">Sending…</p>';
    try {
      const response = await fetch(url, {
        method: selected.method,
        headers,
        body: hasBody ? body || undefined : undefined,
      });
      const text = await response.text();
      const pre = document.createElement('pre');
      pre.className = 'response';
      pre.textContent = prettyJson(text) || '(empty body)';
      result.replaceChildren(responseMeta(response, performance.now() - started), pre);
    } catch (error) {
      result.innerHTML = `<div class="alert">${esc(errorText(error))}</div>`;
    }
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
      return trimmed;
    }
  }

  select(selected.id);
  return wrap;
}

window.addEventListener('hashchange', () => {
  void render();
});
void render();
