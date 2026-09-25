/* Calendar: list view (default) and month view, filterable by type.
   State lives in the URL (?view=month&type=run&month=2026-10) so any
   filtered view can be shared or bookmarked. */
import {
  loadEvents,
  isUpcoming,
  dayKey,
  monthKey,
  now,
  esc,
  EVENT_TYPES,
  renderEventCard,
} from './core.js';

const els = {
  status: document.querySelector('[data-status]'),
  list: document.querySelector('[data-list-view]'),
  month: document.querySelector('[data-month-view]'),
  monthTitle: document.querySelector('[data-month-title]'),
  monthCaption: document.querySelector('[data-month-caption]'),
  monthBody: document.querySelector('[data-month-body]'),
  monthDetail: document.querySelector('[data-month-detail]'),
  viewButtons: document.querySelectorAll('[data-view]'),
  typeInputs: document.querySelectorAll('input[name="type"]'),
};

const state = { view: 'list', type: 'all', month: null, day: null };
let events = [];

/* ---- Pure date helpers (calendar dates, no time zone involved) ---------- */

const utcFmt = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });
const dayLabel = (key) => utcFmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00Z`));
const monthLabel = (key) => utcFmt({ month: 'long', year: 'numeric' }).format(new Date(`${key}-15T12:00:00Z`));

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/* Monday-first grid covering the whole month. */
function monthGrid(key) {
  const [y, m] = key.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, 1 - offset + i));
    return { key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
  });
}

/* ---- State and URL ------------------------------------------------------ */

function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('view') === 'month') state.view = 'month';
  if (EVENT_TYPES[p.get('type')]) state.type = p.get('type');
  if (/^\d{4}-\d{2}$/.test(p.get('month') ?? '')) state.month = p.get('month');
}

function writeUrl() {
  const p = new URLSearchParams(location.search);
  state.view === 'month' ? p.set('view', 'month') : p.delete('view');
  state.type !== 'all' ? p.set('type', state.type) : p.delete('type');
  state.view === 'month' ? p.set('month', state.month) : p.delete('month');
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

const visible = () => (state.type === 'all' ? events : events.filter((e) => e.type === state.type));
const typeName = () => (state.type === 'all' ? '' : `${EVENT_TYPES[state.type]} `);

function announce(text) {
  els.status.textContent = text;
}

/* ---- List view ---------------------------------------------------------- */

function renderList() {
  const list = visible().filter((e) => isUpcoming(e));

  if (!list.length) {
    els.list.innerHTML = `
      <div class="empty">
        <p class="empty__title">No upcoming ${esc(typeName().toLowerCase())}events yet.</p>
        <p class="muted">New dates go to the community first.</p>
        <div class="button-row button-row--center">
          <a class="btn" href="/join/">Join the community</a>
          ${state.type !== 'all' ? '<button class="btn btn--secondary" type="button" data-reset-filter>Show all types</button>' : ''}
        </div>
      </div>`;
    announce(`No upcoming ${typeName().toLowerCase()}events`);
    return;
  }

  const groups = new Map();
  for (const e of list) {
    const k = monthKey(e.start);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }

  els.list.innerHTML = [...groups]
    .map(
      ([k, items]) => `
      <h2 class="calendar__month-heading">${esc(monthLabel(k))}</h2>
      <ol class="event-list" role="list">
        ${items.map((e) => `<li>${renderEventCard(e)}</li>`).join('')}
      </ol>`,
    )
    .join('');

  els.list.insertAdjacentHTML(
    'beforeend',
    `<p class="muted calendar__footnote">Looking for something that's already happened? <button class="link-button" type="button" data-show-month>Switch to month view</button>.</p>`,
  );

  announce(`Showing ${list.length} upcoming ${typeName().toLowerCase()}event${list.length === 1 ? '' : 's'}`);
}

/* ---- Month view --------------------------------------------------------- */

function eventsByDay() {
  const map = new Map();
  for (const e of visible()) {
    const k = dayKey(e.start);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

function defaultDay(byDay) {
  const today = dayKey(now());
  const days = [...byDay.keys()].filter((k) => k.startsWith(state.month)).sort();
  return days.find((k) => k >= today) ?? days[0] ?? null;
}

function renderMonth({ focusDay = false } = {}) {
  const byDay = eventsByDay();
  const today = dayKey(now());
  if (!state.day || !state.day.startsWith(state.month) || !byDay.has(state.day)) state.day = defaultDay(byDay);

  const label = monthLabel(state.month);
  els.monthTitle.textContent = label;
  els.monthCaption.textContent = `${typeName()}events in ${label}`;

  const cells = monthGrid(state.month);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  els.monthBody.innerHTML = rows
    .map(
      (week) => `<tr>${week
        .map((c) => {
          const dayEvents = c.inMonth ? byDay.get(c.key) ?? [] : [];
          const classes = ['month__cell', !c.inMonth && 'month__cell--outside', c.key === today && 'month__cell--today']
            .filter(Boolean)
            .join(' ');
          const num = `<span class="month__num">${c.day}</span>`;
          if (!dayEvents.length) {
            return `<td><div class="${classes}">${num}${c.key === today ? '<span class="visually-hidden"> (today)</span>' : ''}</div></td>`;
          }
          const names = dayEvents.map((e) => `${e.title}${e.cancelled ? ' (cancelled)' : ''}`).join(', ');
          const aria = `${dayLabel(c.key)}${c.key === today ? ', today' : ''}. ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}: ${names}`;
          return `<td>
            <button type="button" class="${classes}" data-day="${c.key}" aria-pressed="${c.key === state.day}" aria-label="${esc(aria)}">
              ${num}
              <span class="month__dots" aria-hidden="true">${dayEvents
                .map((e) => `<span class="month__dot${e.cancelled ? ' month__dot--cancelled' : ''}"></span>`)
                .join('')}</span>
              <ul class="month__labels" aria-hidden="true">${dayEvents
                .map((e) => `<li class="t-${esc(e.type)}${e.cancelled ? ' is-cancelled' : ''}">${esc(e.title)}</li>`)
                .join('')}</ul>
            </button>
          </td>`;
        })
        .join('')}</tr>`,
    )
    .join('');

  renderDayDetail(byDay);

  const count = [...byDay.keys()].filter((k) => k.startsWith(state.month)).reduce((n, k) => n + byDay.get(k).length, 0);
  announce(`${label}: ${count} ${typeName().toLowerCase()}event${count === 1 ? '' : 's'}`);

  if (focusDay && state.day) els.monthBody.querySelector(`[data-day="${state.day}"]`)?.focus();
}

function renderDayDetail(byDay) {
  if (!state.day) {
    els.monthDetail.innerHTML = `
      <div class="empty">
        <p class="empty__title">Nothing on in ${esc(monthLabel(state.month))}${state.type !== 'all' ? ` for ${esc(EVENT_TYPES[state.type])}` : ''}.</p>
        <p class="muted">Try another month or type.</p>
      </div>`;
    return;
  }
  const items = byDay.get(state.day) ?? [];
  els.monthDetail.innerHTML = `
    <h3 class="month__detail-title">${esc(dayLabel(state.day))}</h3>
    <ol class="event-list" role="list">
      ${items.map((e) => `<li>${renderEventCard(e, { level: 4 })}</li>`).join('')}
    </ol>`;
}

/* ---- View switching ----------------------------------------------------- */

function render(opts) {
  els.viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  els.typeInputs.forEach((i) => (i.checked = i.value === state.type));
  els.list.hidden = state.view !== 'list';
  els.month.hidden = state.view !== 'month';
  if (state.view === 'list') renderList();
  else renderMonth(opts);
  writeUrl();
}

function setView(view) {
  state.view = view;
  if (view === 'month' && !state.month) state.month = monthKey(now());
  render();
}

/* Deep links from add-to-calendar files and elsewhere: /calendar/#event-12 */
function openFromHash() {
  const id = location.hash.match(/^#event-(\d+)$/)?.[1];
  if (!id) return;
  const e = events.find((x) => String(x.id) === id);
  if (!e) return;
  if (state.type !== 'all' && e.type !== state.type) state.type = 'all';
  if (!isUpcoming(e)) {
    state.view = 'month';
    state.month = monthKey(e.start);
    state.day = dayKey(e.start);
  }
  render();
  document.getElementById(`event-${id}`)?.scrollIntoView({ block: 'start' });
}

/* ---- Events ------------------------------------------------------------- */

els.viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

els.typeInputs.forEach((input) =>
  input.addEventListener('change', () => {
    state.type = input.value;
    state.day = null;
    render();
  }),
);

document.addEventListener('click', (ev) => {
  const step = ev.target.closest('[data-month-step]');
  if (step) {
    state.month = shiftMonth(state.month, Number(step.dataset.monthStep));
    state.day = null;
    render();
    return;
  }
  if (ev.target.closest('[data-month-today]')) {
    state.month = monthKey(now());
    state.day = null;
    render();
    return;
  }
  const day = ev.target.closest('[data-day]');
  if (day) {
    state.day = day.dataset.day;
    render({ focusDay: true });
    return;
  }
  if (ev.target.closest('[data-reset-filter]')) {
    state.type = 'all';
    render();
    return;
  }
  if (ev.target.closest('[data-show-month]')) {
    setView('month');
    els.month.querySelector('.month__title')?.scrollIntoView({ block: 'start' });
  }
});

window.addEventListener('hashchange', openFromHash);

/* ---- Boot --------------------------------------------------------------- */

async function init() {
  readUrl();
  if (!state.month) state.month = monthKey(now());
  try {
    events = await loadEvents();
  } catch (err) {
    console.error(err);
    els.list.innerHTML = `<div class="empty"><p class="empty__title">We couldn't load the calendar.</p><p class="muted">Refresh the page to try again.</p></div>`;
    return;
  }
  render();
  openFromHash();
}

init();
