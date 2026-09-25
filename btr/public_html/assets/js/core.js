/* ==========================================================================
   BULLY THE ROADS · shared helpers
   Plain ES modules, no build step.
   ========================================================================== */

/* Phase 1 reads mock JSON. Phase 2 points these at /api/*.php, which return
   the same shapes, so nothing else has to change. */
export const ENDPOINTS = {
  events: '/data/events.json',
  challenges: '/data/challenges.json',
  settings: '/data/settings.json',
};

export const TZ = 'Europe/London';
export const LOCALE = 'en-GB';

export const EVENT_TYPES = {
  run: 'Run',
  social: 'Social',
  track_play: 'Track + Play',
  other: 'Other',
};

const SITE_URL = location.origin;

/* ---- Time --------------------------------------------------------------- */

/* ?now=2026-10-20T09:00 lets you preview the site at another moment
   (next-run logic, challenge states). Testing aid only. */
const nowOffset = (() => {
  const raw = new URLSearchParams(location.search).get('now');
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t - Date.now();
})();

export const now = () => new Date(Date.now() + nowOffset);
export const isTimeTravelling = nowOffset !== 0;

const formatters = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts }));
  return formatters.get(key);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Calendar parts of a moment, as seen in London. */
export function londonParts(date) {
  const parts = Object.fromEntries(
    fmt({ year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, dow, key: `${parts.year}-${parts.month}-${parts.day}` };
}

export const dayKey = (date) => londonParts(date).key;
export const monthKey = (date) => londonParts(date).key.slice(0, 7);

export function dateBlock(date) {
  const p = londonParts(date);
  return { dow: DOW[p.dow], day: String(p.day), mon: MON[p.month - 1] };
}

export const formatLongDate = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);
export const formatFullDate = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
export const formatTime = (d) => fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
export const formatMonthYear = (d) => fmt({ month: 'long', year: 'numeric' }).format(d);

export function formatTimeRange(start, end) {
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
}

/* "1–31 October 2026", "21 September – 18 October 2026" for YYYY-MM-DD strings. */
export function formatDateSpan(startsOn, endsOn) {
  const s = new Date(`${startsOn}T12:00:00Z`);
  const e = new Date(`${endsOn}T12:00:00Z`);
  const opts = { timeZone: 'UTC' };
  const d = (x, o) => new Intl.DateTimeFormat(LOCALE, { ...opts, ...o }).format(x);
  if (s.getUTCFullYear() !== e.getUTCFullYear()) {
    return `${d(s, { day: 'numeric', month: 'long', year: 'numeric' })} – ${d(e, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (s.getUTCMonth() !== e.getUTCMonth()) {
    return `${d(s, { day: 'numeric', month: 'long' })} – ${d(e, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  return `${s.getUTCDate()}–${d(e, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/* ---- Safety ------------------------------------------------------------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/* Only allow http(s) and mailto links through from data. */
export function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, SITE_URL);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

export const splitList = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const splitLines = (value) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

/* ---- Data --------------------------------------------------------------- */

export async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

const eventRegistry = new Map();

export function normaliseEvent(raw) {
  const event = {
    ...raw,
    start: new Date(raw.starts_at),
    end: raw.ends_at ? new Date(raw.ends_at) : null,
    cancelled: raw.status === 'cancelled',
  };
  eventRegistry.set(String(event.id), event);
  return event;
}

export async function loadEvents() {
  const data = await getJSON(ENDPOINTS.events);
  return (data.events ?? data).map(normaliseEvent).sort((a, b) => a.start - b.start);
}

export const eventFinish = (e) => e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000);

/* The hero event: the first non-cancelled event that hasn't finished yet.
   An event that has started but not ended counts, so the hero can say
   "happening now" rather than jumping ahead mid-run. */
export function findNextEvent(events, at = now()) {
  return events.find((e) => !e.cancelled && eventFinish(e) > at) ?? null;
}

export const isUpcoming = (e, at = now()) => eventFinish(e) > at;

export function mapUrl(e) {
  return (
    safeUrl(e.location_url) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.location_name}, London`)}`
  );
}

/* ---- Add to calendar ---------------------------------------------------- */

const utcStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function eventDetails(e) {
  const lines = [];
  if (e.description) lines.push(e.description);
  if (e.distance) lines.push(`Distance: ${e.distance}`);
  if (e.pace_groups) lines.push(`Pace groups: ${e.pace_groups}`);
  if (e.partner) lines.push(`With ${e.partner}`);
  lines.push(`${SITE_URL}/calendar/#event-${e.id}`);
  return lines.join('\n');
}

export function googleCalendarUrl(e) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${e.title} · BULLY THE ROADS`,
    dates: `${utcStamp(e.start)}/${utcStamp(eventFinish(e))}`,
    details: eventDetails(e),
    location: e.location_name ?? '',
    ctz: TZ,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/* RFC 5545 says lines over 75 octets must be folded. */
function icsFold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function icsText(e) {
  const host = location.hostname || 'bullytheroads';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BULLY THE ROADS//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:btr-event-${e.id}@${host}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(eventFinish(e))}`,
    `SUMMARY:${icsEscape(`${e.title} · BULLY THE ROADS`)}`,
    `LOCATION:${icsEscape(e.location_name)}`,
    `DESCRIPTION:${icsEscape(eventDetails(e))}`,
    `URL:${SITE_URL}/calendar/#event-${e.id}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function downloadIcs(e) {
  const blob = new Blob([icsText(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `btr-${slug(e.title)}-${dayKey(e.start)}.ics`,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderAddToCalendar(e, { inverse = false, align = '' } = {}) {
  if (e.cancelled) return '';
  const summaryClass = inverse ? 'btn btn--outline-inverse btn--sm' : 'btn btn--secondary btn--sm';
  return `
    <details class="atc ${align ? `atc--${align}` : ''}" data-atc>
      <summary class="${summaryClass}">Add to calendar</summary>
      <div class="atc__menu">
        <a class="atc__item" href="${esc(googleCalendarUrl(e))}" target="_blank" rel="noopener">
          Google Calendar <small>Opens in new tab</small>
        </a>
        <button class="atc__item" type="button" data-ics="${esc(e.id)}">
          Apple, Outlook, other <small>.ics file</small>
        </button>
      </div>
    </details>`;
}

/* ---- Rendering ---------------------------------------------------------- */

export const ICON_ARROW = `<svg class="btn__icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 12 12 4M5.5 4H12v6.5"/></svg>`;
export const ICON_RIGHT = `<svg class="btn__icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M2 8h11M9 4l4 4-4 4"/></svg>`;

export function renderPaceList(value) {
  const items = splitList(value);
  if (!items.length) return '';
  return `<ul class="pace-list">${items.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
}

export function renderEventMeta(e) {
  const rows = [];
  if (e.location_name) {
    rows.push(`<div class="meta__wide"><dt>Meeting point</dt><dd><a href="${esc(mapUrl(e))}" target="_blank" rel="noopener">${esc(e.location_name)}<span class="visually-hidden"> (map, opens in new tab)</span></a></dd></div>`);
  }
  if (e.distance) rows.push(`<div><dt>Distance</dt><dd>${esc(e.distance)}</dd></div>`);
  if (e.pace_groups) rows.push(`<div class="meta__wide"><dt>Pace groups</dt><dd>${renderPaceList(e.pace_groups)}</dd></div>`);
  if (e.partner) rows.push(`<div><dt>Partner</dt><dd>${esc(e.partner)}</dd></div>`);
  return rows.length ? `<dl class="meta">${rows.join('')}</dl>` : '';
}

export function renderEventCard(e, { level = 3, compact = false, at = now() } = {}) {
  const b = dateBlock(e.start);
  const past = !isUpcoming(e, at);
  const classes = ['event', compact && 'event--compact', e.cancelled && 'event--cancelled', past && 'event--past']
    .filter(Boolean)
    .join(' ');
  const h = `h${level}`;
  return `
    <article class="${classes}" id="event-${esc(e.id)}" aria-labelledby="event-${esc(e.id)}-title">
      <div class="event__date" aria-hidden="true">
        <span class="event__dow">${b.dow}</span>
        <span class="event__day">${b.day}</span>
        <span class="event__mon">${b.mon}</span>
      </div>
      <div class="event__body">
        <div class="event__tags">
          <span class="chip chip--${esc(e.type)}">${esc(EVENT_TYPES[e.type] ?? 'Other')}</span>
          ${e.cancelled ? '<span class="badge badge--cancelled">Cancelled</span>' : ''}
          ${past && !e.cancelled ? '<span class="badge badge--upcoming">Past</span>' : ''}
        </div>
        <${h} class="event__title" id="event-${esc(e.id)}-title">${esc(e.title)}${e.cancelled ? '<span class="visually-hidden"> (cancelled)</span>' : ''}</${h}>
        <p class="event__when"><time datetime="${esc(e.starts_at)}">${esc(formatLongDate(e.start))}, ${esc(formatTimeRange(e.start, e.end))}</time></p>
        ${compact ? '' : renderEventMeta(e)}
        ${!compact && e.description ? `<p class="event__desc">${esc(e.description)}</p>` : ''}
      </div>
      ${!past ? `<div class="event__actions">${renderAddToCalendar(e, { align: 'right' })}</div>` : ''}
    </article>`;
}

/* ---- Site chrome -------------------------------------------------------- */

function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('site-nav');
  const header = document.querySelector('[data-header]');
  if (!toggle || !nav) return;

  const label = toggle.querySelector('[data-nav-label]');
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Close' : 'Menu';
    nav.classList.toggle('is-open', open);
    header?.classList.toggle('is-open', open);
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia('(min-width: 48rem)').addEventListener('change', () => setOpen(false));
}

function initAddToCalendar() {
  document.addEventListener('click', (ev) => {
    const icsBtn = ev.target.closest('[data-ics]');
    if (icsBtn) {
      const e = eventRegistry.get(icsBtn.dataset.ics);
      if (e) downloadIcs(e);
      icsBtn.closest('details')?.removeAttribute('open');
      return;
    }
    document.querySelectorAll('details[data-atc][open]').forEach((d) => {
      if (!d.contains(ev.target)) d.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const open = document.querySelector('details[data-atc][open]');
    if (open) {
      open.removeAttribute('open');
      open.querySelector('summary')?.focus();
    }
  });
}

/* Admin-editable links (Strava club etc.) live in settings. Static hrefs in
   the HTML are the fallback; this swaps in whatever admin has saved. */
async function hydrateSettings() {
  const targets = document.querySelectorAll('[data-setting-href]');
  if (!targets.length) return;
  try {
    const settings = await getJSON(ENDPOINTS.settings);
    targets.forEach((el) => {
      const value = safeUrl(settings[el.dataset.settingHref]);
      if (value) el.href = value;
    });
  } catch {
    /* keep the static fallback */
  }
}

function initTimeTravelBanner() {
  if (!isTimeTravelling) return;
  const bar = document.createElement('p');
  bar.className = 'notice';
  bar.style.cssText = 'position:fixed;bottom:1rem;left:1rem;z-index:99;margin:0;box-shadow:var(--shadow-pop)';
  bar.textContent = `Preview: pretending it's ${formatFullDate(now())}, ${formatTime(now())}`;
  document.body.append(bar);
}

export function initSite() {
  initNav();
  initAddToCalendar();
  hydrateSettings();
  initTimeTravelBanner();
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
}
