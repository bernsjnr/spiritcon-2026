/* Admin prototype. Everything happens in memory so the flows can be
   clicked through and signed off. Phase 2 and 3 replace each action with
   a POST to /api/admin/*.php behind a real session and CSRF token. */
import {
  getJSON,
  ENDPOINTS,
  esc,
  EVENT_TYPES,
  normaliseEvent,
  londonParts,
  formatTime,
  formatDateSpan,
  now,
} from './core.js';
import { challengePhase } from './challenge-ui.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  events: [],
  applications: [],
  challenges: [],
  settings: {
    whatsapp_url: 'https://chat.whatsapp.com/REPLACE-WITH-INVITE-CODE',
    strava_club_url: 'https://www.strava.com/clubs/bullytheroads',
    notify_email_1: 'bullytheroads@gmail.com',
    notify_email_2: 'info@bernsds.com',
  },
  eventScope: 'upcoming',
  appSearch: '',
  appStatus: 'all',
};

const LEVELS = {
  new: 'Brand new',
  getting_going: 'Getting going',
  regular: 'Regular',
  experienced: 'Experienced',
  competitive: 'Competitive',
};
const PACES = {
  not_sure: 'Not sure',
  '7plus': '7:00+/km',
  '6-7': '6:00–7:00/km',
  '5-6': '5:00–6:00/km',
  '4:30-5': '4:30–5:00/km',
  'sub4:30': 'Sub 4:30/km',
};
const HEARD = {
  instagram: 'Instagram',
  strava: 'Strava',
  tiktok: 'TikTok',
  friend: 'Friend or member',
  partner: 'Partner',
  saw_us: 'Saw us running',
  event: 'At an event',
  other: 'Other',
};

/* ---- Small helpers ------------------------------------------------------ */

let toastTimer;
function toast(message) {
  const el = $('[data-toast]');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

const shortDate = (d) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);

const statusPill = (status) => `<span class="status status--${esc(status)}">${esc(status)}</span>`;

/* Turn a London wall-clock date + time into an ISO string with the right
   offset (+01:00 in summer, +00:00 in winter). */
function londonIso(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offsetName = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'longOffset' })
    .formatToParts(guess)
    .find((p) => p.type === 'timeZoneName').value; // "GMT+01:00" or "GMT"
  const offset = offsetName === 'GMT' ? '+00:00' : offsetName.replace('GMT', '');
  return `${date}T${time}:00${offset}`;
}

function nextId(list) {
  return list.reduce((max, x) => Math.max(max, Number(x.id)), 0) + 1;
}

/* ---- Tabs --------------------------------------------------------------- */

function showTab() {
  const tab = (location.hash || '#events').slice(1);
  const valid = ['events', 'applications', 'challenges', 'settings'].includes(tab) ? tab : 'events';
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== valid));
  $$('[data-tab]').forEach((a) => (a.dataset.tab === valid ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

/* ---- Events ------------------------------------------------------------- */

function renderEvents() {
  const at = now();
  let list = [...state.events];
  if (state.eventScope === 'upcoming') list = list.filter((e) => (e.end ?? e.start) > at);
  if (state.eventScope === 'past') list = list.filter((e) => (e.end ?? e.start) <= at).reverse();

  $$('[data-event-scope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.eventScope === state.eventScope)));

  $('[data-events-body]').innerHTML = list.length
    ? list
        .map((e) => {
          const past = (e.end ?? e.start) <= at;
          return `
        <tr class="${e.cancelled ? 'is-cancelled' : ''} ${past ? 'is-past' : ''}">
          <td class="nowrap">${esc(shortDate(e.start))}<span class="row-sub">${esc(formatTime(e.start))}${e.end ? `–${esc(formatTime(e.end))}` : ''}</span></td>
          <td><span class="row-title">${esc(e.title)}</span><span class="row-sub">${esc(e.location_name)}</span></td>
          <td class="nowrap">${esc(EVENT_TYPES[e.type])}</td>
          <td>${statusPill(e.cancelled ? 'cancelled' : 'scheduled')}</td>
          <td>
            <div class="actions">
              <button class="text-btn" type="button" data-edit-event="${e.id}">Edit</button>
              <button class="text-btn" type="button" data-duplicate-event="${e.id}">Duplicate</button>
              ${
                e.cancelled
                  ? `<button class="text-btn" type="button" data-restore-event="${e.id}">Restore</button>`
                  : `<button class="text-btn text-btn--danger" type="button" data-cancel-event="${e.id}">Cancel</button>`
              }
            </div>
          </td>
        </tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="table-empty">No ${state.eventScope === 'all' ? '' : state.eventScope} events.</td></tr>`;
}

const eventDialog = $('[data-event-dialog]');
const eventForm = $('[data-event-form]');

function openEventDialog(event, { duplicate = false } = {}) {
  eventForm.reset();
  $('#event-dialog-title').textContent = event ? (duplicate ? 'Duplicate event' : 'Edit event') : 'New event';
  if (event) {
    const f = eventForm.elements;
    f.id.value = duplicate ? '' : event.id;
    f.title.value = event.title;
    f.type.value = event.type;
    f.status.value = duplicate ? 'scheduled' : event.status;
    /* A duplicate starts a week later, the most common reason to copy one. */
    const start = duplicate ? new Date(event.start.getTime() + 7 * 86400000) : event.start;
    f.date.value = londonParts(start).key;
    f.start.value = formatTime(event.start);
    f.end.value = event.end ? formatTime(event.end) : '';
    f.location_name.value = event.location_name ?? '';
    f.location_url.value = event.location_url ?? '';
    f.distance.value = event.distance ?? '';
    f.partner.value = event.partner ?? '';
    f.pace_groups.value = event.pace_groups ?? '';
    f.description.value = event.description ?? '';
  }
  eventDialog.showModal();
  eventForm.elements.title.focus();
}

eventForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!eventForm.reportValidity()) return;
  const f = Object.fromEntries(new FormData(eventForm));
  if (f.end && f.end <= f.start) {
    eventForm.elements.end.setCustomValidity('End time needs to be after the start');
    eventForm.reportValidity();
    eventForm.elements.end.setCustomValidity('');
    return;
  }
  const raw = {
    id: f.id ? Number(f.id) : nextId(state.events),
    title: f.title.trim(),
    type: f.type,
    starts_at: londonIso(f.date, f.start),
    ends_at: f.end ? londonIso(f.date, f.end) : null,
    location_name: f.location_name.trim(),
    location_url: f.location_url.trim(),
    distance: f.distance.trim(),
    pace_groups: f.pace_groups.trim(),
    partner: f.partner.trim(),
    description: f.description.trim(),
    status: f.status,
  };
  const event = normaliseEvent(raw);
  const i = state.events.findIndex((e) => e.id === event.id);
  if (i >= 0) state.events[i] = event;
  else state.events.push(event);
  state.events.sort((a, b) => a.start - b.start);
  eventDialog.close();
  renderEvents();
  toast(i >= 0 ? 'Event updated (prototype, not saved)' : 'Event created (prototype, not saved)');
});

function setEventStatus(id, status) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  if (status === 'cancelled' && !confirm(`Cancel "${e.title}"? It stays on the calendar, marked as cancelled.`)) return;
  Object.assign(e, normaliseEvent({ ...e, status }));
  renderEvents();
  toast(status === 'cancelled' ? 'Event marked as cancelled' : 'Event restored');
}

/* ---- Applications ------------------------------------------------------- */

function filteredApplications() {
  const q = state.appSearch.toLowerCase();
  return state.applications.filter((a) => {
    if (state.appStatus !== 'all' && a.status !== state.appStatus) return false;
    if (!q) return true;
    return [a.name, a.email, a.phone, a.area, a.handle].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
}

function renderApplications() {
  const counts = { pending: 0, approved: 0, declined: 0, unverified: 0 };
  state.applications.forEach((a) => (counts[a.status] = (counts[a.status] ?? 0) + 1));

  $('[data-pending-count]').textContent = counts.pending || '';
  $('[data-app-stats]').innerHTML = Object.entries(counts)
    .map(
      ([status, n]) => `
      <button class="stat" type="button" data-stat="${status}" aria-pressed="${state.appStatus === status}">
        <span class="stat__num">${n}</span><span class="stat__label">${status}</span>
      </button>`,
    )
    .join('');

  const list = filteredApplications();
  $('[data-apps-body]').innerHTML = list.length
    ? list
        .map(
          (a) => `
      <tr>
        <td><span class="row-title">${esc(a.name)}</span><span class="row-sub">${esc(a.email)}</span></td>
        <td class="nowrap">${esc(a.area)}</td>
        <td>${esc(LEVELS[a.level] ?? a.level)}<span class="row-sub">${esc(PACES[a.pace] ?? a.pace)}</span></td>
        <td class="nowrap">${esc(shortDate(new Date(a.created_at)))}</td>
        <td>${statusPill(a.status)}</td>
        <td><div class="actions"><button class="text-btn" type="button" data-view-app="${a.id}">Review</button></div></td>
      </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="table-empty">No applications match.</td></tr>';
}

const appDialog = $('[data-app-dialog]');

function openApplication(id) {
  const a = state.applications.find((x) => x.id === id);
  if (!a) return;
  $('#app-dialog-title').textContent = a.name;
  const row = (label, value, wide = false) =>
    `<div class="${wide ? 'detail__wide' : ''}"><dt>${label}</dt><dd>${esc(value || '—')}</dd></div>`;

  $('[data-app-detail]').innerHTML = `
    <p>${statusPill(a.status)} <span class="muted">Applied ${esc(shortDate(new Date(a.created_at)))}</span></p>
    <dl class="detail">
      ${row('Email', a.email)}
      ${row('Mobile', a.phone)}
      ${row('Area', a.area)}
      ${row('Instagram or Strava', a.handle)}
      ${row('Level', LEVELS[a.level] ?? a.level)}
      ${row('Easy pace', PACES[a.pace] ?? a.pace)}
      ${row('Goals', a.goals, true)}
      ${row('Target times', a.target_times)}
      ${row('Training for', a.training_for)}
      ${row('Why BTR', a.why_btr, true)}
      ${row('Heard about us', HEARD[a.heard_from] ?? a.heard_from)}
      ${row('Availability', a.availability)}
      ${row('Newsletter', a.newsletter_opt_in ? 'Yes' : 'No')}
    </dl>
    <div class="field">
      <label class="field__label" for="app-notes">Notes (only admins see these)</label>
      <textarea class="textarea" id="app-notes" data-app-notes>${esc(a.notes)}</textarea>
    </div>
    ${
      a.status === 'pending'
        ? `<div class="checkbox">
            <input id="decline-email" type="checkbox" data-decline-email>
            <label for="decline-email">If declining, send a polite email</label>
          </div>`
        : ''
    }
    ${a.status === 'unverified' ? '<p class="notice">Waiting for the applicant to confirm their email. Links expire after 7 days.</p>' : ''}`;

  $('[data-app-actions]').innerHTML = `
    <button class="btn btn--secondary btn--sm spacer" type="button" data-save-notes="${a.id}">Save notes</button>
    ${
      a.status === 'pending'
        ? `<button class="btn btn--secondary btn--sm" type="button" data-decline="${a.id}">Decline</button>
           <button class="btn btn--sm" type="button" data-approve="${a.id}">Approve and send invite</button>`
        : ''
    }`;
  appDialog.showModal();
}

function updateApplication(id, changes, message) {
  const a = state.applications.find((x) => x.id === id);
  if (!a) return;
  Object.assign(a, changes, { updated_at: new Date().toISOString() });
  renderApplications();
  appDialog.close();
  toast(message);
}

/* CSV that opens cleanly in Excel and Numbers, with formula injection
   neutralised (cells starting = + - @ get a leading apostrophe). */
function exportCsv() {
  const cols = ['id', 'name', 'email', 'phone', 'area', 'handle', 'level', 'pace', 'goals', 'target_times', 'training_for', 'why_btr', 'heard_from', 'availability', 'newsletter_opt_in', 'status', 'notes', 'created_at', 'updated_at'];
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [cols.join(','), ...state.applications.map((a) => cols.map((c) => cell(a[c])).join(','))];
  const blob = new Blob([`﻿${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `btr-applications-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${state.applications.length} applications`);
}

/* ---- Challenges --------------------------------------------------------- */

function renderChallenges() {
  const list = [...state.challenges].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  $('[data-challenges-body]').innerHTML = list.length
    ? list
        .map((c) => {
          const phase = c.status === 'draft' ? 'draft' : challengePhase(c);
          const winners = c.results?.length ?? 0;
          return `
        <tr>
          <td><span class="row-title">${esc(c.title)}</span><span class="row-sub">${esc(c.distance)} · ${esc(c.prize || 'No prize set')}</span></td>
          <td class="nowrap">${esc(formatDateSpan(c.starts_on, c.ends_on))}</td>
          <td>${statusPill(phase)}</td>
          <td>${phase === 'ended' ? (winners ? `${winners} added` : '<strong>Add winners</strong>') : '—'}</td>
          <td><div class="actions"><button class="text-btn" type="button" data-edit-challenge="${c.id}">Edit</button></div></td>
        </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="table-empty">No challenges yet.</td></tr>';
}

const challengeDialog = $('[data-challenge-dialog]');
const challengeForm = $('[data-challenge-form]');
const winnerRows = $('[data-winner-rows]');

function winnerRow(r = {}, i = 0) {
  const n = winnerRows.children.length + i + 1;
  return `
    <div class="winner-row">
      <div class="field"><label class="field__label" for="w-pos-${n}">Pos</label><input class="input" id="w-pos-${n}" name="w_position" type="number" min="1" value="${esc(r.position ?? n)}"></div>
      <div class="field"><label class="field__label" for="w-name-${n}">Name</label><input class="input" id="w-name-${n}" name="w_name" value="${esc(r.name ?? '')}" placeholder="Amara O."></div>
      <div class="field"><label class="field__label" for="w-res-${n}">Result</label><input class="input" id="w-res-${n}" name="w_result" value="${esc(r.result ?? '')}" placeholder="42.1 km"></div>
      <button class="text-btn text-btn--danger" type="button" data-remove-winner aria-label="Remove winner ${n}">Remove</button>
    </div>`;
}

function openChallenge(c) {
  challengeForm.reset();
  winnerRows.innerHTML = '';
  $('#challenge-dialog-title').textContent = c ? 'Edit challenge' : 'New challenge';
  const f = challengeForm.elements;
  f.id.value = c?.id ?? '';
  f.strava_url.value = c?.strava_url ?? state.settings.strava_club_url;
  if (c) {
    ['title', 'distance', 'starts_on', 'ends_on', 'prize', 'sponsor', 'rules', 'status'].forEach((k) => (f[k].value = c[k] ?? ''));
    winnerRows.innerHTML = (c.results ?? []).map((r, i) => winnerRow(r, i)).join('');
  }
  challengeDialog.showModal();
  f.title.focus();
}

challengeForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!challengeForm.reportValidity()) return;
  const data = new FormData(challengeForm);
  const f = Object.fromEntries(data);
  if (f.ends_on < f.starts_on) {
    challengeForm.elements.ends_on.setCustomValidity('End date needs to be on or after the start');
    challengeForm.reportValidity();
    challengeForm.elements.ends_on.setCustomValidity('');
    return;
  }
  const positions = data.getAll('w_position');
  const names = data.getAll('w_name');
  const resultsIn = data.getAll('w_result');
  const results = names
    .map((name, i) => ({ position: Number(positions[i]) || i + 1, name: name.trim(), result: resultsIn[i].trim() }))
    .filter((r) => r.name);

  const challenge = {
    id: f.id ? Number(f.id) : nextId(state.challenges),
    title: f.title.trim(),
    distance: f.distance.trim(),
    starts_on: f.starts_on,
    ends_on: f.ends_on,
    rules: f.rules.trim(),
    prize: f.prize.trim(),
    sponsor: f.sponsor.trim(),
    strava_url: f.strava_url.trim(),
    status: f.status,
    results,
  };
  const i = state.challenges.findIndex((c) => c.id === challenge.id);
  if (i >= 0) state.challenges[i] = challenge;
  else state.challenges.push(challenge);
  challengeDialog.close();
  renderChallenges();
  toast('Challenge saved (prototype, not saved)');
});

/* ---- Settings ----------------------------------------------------------- */

const settingsForm = $('[data-settings-form]');

function fillSettings() {
  Object.entries(state.settings).forEach(([k, v]) => {
    if (settingsForm.elements[k]) settingsForm.elements[k].value = v;
  });
}

settingsForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!settingsForm.reportValidity()) return;
  Object.assign(state.settings, Object.fromEntries(new FormData(settingsForm)));
  toast('Settings saved (prototype, not saved)');
});

/* ---- Wiring ------------------------------------------------------------- */

document.addEventListener('click', (ev) => {
  const t = ev.target;
  const num = (attr) => Number(t.closest(`[${attr}]`)?.getAttribute(attr));

  if (t.closest('[data-close]')) t.closest('dialog')?.close();
  else if (t.closest('[data-new-event]')) openEventDialog(null);
  else if (t.closest('[data-edit-event]')) openEventDialog(state.events.find((e) => e.id === num('data-edit-event')));
  else if (t.closest('[data-duplicate-event]')) openEventDialog(state.events.find((e) => e.id === num('data-duplicate-event')), { duplicate: true });
  else if (t.closest('[data-cancel-event]')) setEventStatus(num('data-cancel-event'), 'cancelled');
  else if (t.closest('[data-restore-event]')) setEventStatus(num('data-restore-event'), 'scheduled');
  else if (t.closest('[data-event-scope]')) {
    state.eventScope = t.closest('[data-event-scope]').dataset.eventScope;
    renderEvents();
  } else if (t.closest('[data-stat]')) {
    const status = t.closest('[data-stat]').dataset.stat;
    state.appStatus = state.appStatus === status ? 'all' : status;
    $('[data-app-status]').value = state.appStatus;
    renderApplications();
  } else if (t.closest('[data-view-app]')) openApplication(num('data-view-app'));
  else if (t.closest('[data-save-notes]')) {
    updateApplication(num('data-save-notes'), { notes: $('[data-app-notes]').value.trim() }, 'Notes saved');
  } else if (t.closest('[data-approve]')) {
    const id = num('data-approve');
    updateApplication(id, { status: 'approved', notes: $('[data-app-notes]').value.trim() }, 'Approved. Welcome email with WhatsApp link would send now.');
  } else if (t.closest('[data-decline]')) {
    const id = num('data-decline');
    const send = $('[data-decline-email]')?.checked;
    updateApplication(id, { status: 'declined', notes: $('[data-app-notes]').value.trim() }, send ? 'Declined. Polite email would send now.' : 'Declined silently.');
  } else if (t.closest('[data-export-csv]')) exportCsv();
  else if (t.closest('[data-new-challenge]')) openChallenge(null);
  else if (t.closest('[data-edit-challenge]')) openChallenge(state.challenges.find((c) => c.id === num('data-edit-challenge')));
  else if (t.closest('[data-add-winner]')) {
    winnerRows.insertAdjacentHTML('beforeend', winnerRow());
    winnerRows.lastElementChild.querySelector('[name="w_name"]').focus();
  } else if (t.closest('[data-remove-winner]')) t.closest('.winner-row').remove();
  else if (t.closest('[data-logout]')) {
    $('[data-app]').hidden = true;
    $('[data-login]').hidden = false;
    $('#admin-password').value = '';
    $('#admin-password').focus();
  }
});

$('[data-app-search]').addEventListener('input', (ev) => {
  state.appSearch = ev.target.value.trim();
  renderApplications();
});
$('[data-app-status]').addEventListener('change', (ev) => {
  state.appStatus = ev.target.value;
  renderApplications();
});

window.addEventListener('hashchange', showTab);

$('[data-login-form]').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('[data-login]').hidden = true;
  $('[data-app]').hidden = false;
  showTab();
  await loadAll();
});

let loaded = false;
async function loadAll() {
  if (loaded) return;
  loaded = true;
  try {
    const [events, apps, challenges] = await Promise.all([
      getJSON(ENDPOINTS.events),
      getJSON('/data/admin/applications.json'),
      getJSON(ENDPOINTS.challenges),
    ]);
    state.events = events.events.map(normaliseEvent).sort((a, b) => a.start - b.start);
    state.applications = apps.applications.sort((a, b) => b.created_at.localeCompare(a.created_at));
    state.challenges = challenges.challenges;
  } catch (err) {
    console.error(err);
    toast('Could not load mock data');
  }
  renderEvents();
  renderApplications();
  renderChallenges();
  fillSettings();
}
