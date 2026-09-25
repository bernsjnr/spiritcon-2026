/* Home: next-run hero with countdown, coming up list, live challenges. */
import {
  loadEvents,
  findNextEvent,
  eventFinish,
  isUpcoming,
  now,
  esc,
  EVENT_TYPES,
  formatLongDate,
  formatTime,
  formatTimeRange,
  renderEventMeta,
  renderAddToCalendar,
  renderEventCard,
} from './core.js';
import { loadChallenges, challengePhase, renderChallengeCard } from './challenge-ui.js';

const heroEl = document.querySelector('[data-next-run]');
const upcomingEl = document.querySelector('[data-upcoming]');
const challengesEl = document.querySelector('[data-home-challenges]');

const MAX_TIMEOUT = 2 ** 31 - 1;
let events = [];
let tickTimer;
let phaseTimer;

/* ---- Hero --------------------------------------------------------------- */

const pad = (n) => String(n).padStart(2, '0');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function splitDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function countdownLabel({ d, h, m }) {
  const parts = [];
  if (d) parts.push(plural(d, 'day'));
  if (d || h) parts.push(plural(h, 'hour'));
  parts.push(plural(m, 'minute'));
  return `Starts in ${parts.join(', ')}`;
}

function renderTbc() {
  heroEl.closest('.hero').classList.add('hero--tbc');
  heroEl.innerHTML = `
    <div class="next-run">
      <div>
        <h2 class="next-run__title" id="next-run-title">Next run: TBC</h2>
        <p class="next-run__when"><span>We're lining up the next one. Join the community and you'll hear first.</span></p>
        <div class="button-row next-run__cta">
          <a class="btn btn--inverse" href="/join/">Join the community</a>
          <a class="btn btn--outline-inverse" href="/calendar/">See the calendar</a>
        </div>
      </div>
    </div>`;
}

function renderHero() {
  clearInterval(tickTimer);
  clearTimeout(phaseTimer);

  const next = findNextEvent(events);
  if (!next) return renderTbc();
  heroEl.closest('.hero').classList.remove('hero--tbc');

  const at = now();
  const started = next.start <= at;
  const label = started ? 'Happening now' : next.type === 'run' ? 'Next run' : 'Next up';

  const timing = started
    ? `<p class="next-run__note">Started at ${esc(formatTime(next.start))}${next.end ? `, finishing around ${esc(formatTime(next.end))}` : ''}.</p>`
    : `<div class="countdown" role="timer" data-countdown>
         <div class="countdown__part"><span class="countdown__num" data-d>00</span><span class="countdown__unit">Days</span></div>
         <div class="countdown__part"><span class="countdown__num" data-h>00</span><span class="countdown__unit">Hours</span></div>
         <div class="countdown__part"><span class="countdown__num" data-m>00</span><span class="countdown__unit">Mins</span></div>
         <div class="countdown__part"><span class="countdown__num" data-s>00</span><span class="countdown__unit">Secs</span></div>
       </div>`;

  heroEl.innerHTML = `
    <div class="next-run">
      <div class="next-run__main">
        <p class="eyebrow next-run__eyebrow">
          <span>${label}</span><span class="rule" aria-hidden="true"></span>
          <span class="chip chip--inverse">${esc(EVENT_TYPES[next.type] ?? 'Other')}</span>
        </p>
        <h2 class="next-run__title" id="next-run-title">${esc(next.title)}</h2>
        <p class="next-run__when">
          <time datetime="${esc(next.starts_at)}">${esc(formatLongDate(next.start))}</time>
          <span>${esc(formatTimeRange(next.start, next.end))}</span>
        </p>
        ${timing}
      </div>
      <div class="next-run__side">
        ${renderEventMeta(next)}
        <div class="next-run__actions">
          ${renderAddToCalendar(next, { inverse: true })}
          <a class="btn btn--outline-inverse btn--sm" href="/calendar/">Full calendar</a>
        </div>
      </div>
    </div>`;

  if (started) {
    /* Move on to the following event once this one finishes. */
    phaseTimer = setTimeout(renderHero, Math.min(eventFinish(next) - now() + 1000, MAX_TIMEOUT));
  } else {
    startCountdown(next);
  }
  renderUpcoming(next);
}

function startCountdown(event) {
  const el = heroEl.querySelector('[data-countdown]');
  const out = { d: el.querySelector('[data-d]'), h: el.querySelector('[data-h]'), m: el.querySelector('[data-m]'), s: el.querySelector('[data-s]') };
  let lastLabel = '';

  const tick = () => {
    const ms = event.start - now();
    if (ms <= 0) return renderHero();
    const t = splitDuration(ms);
    out.d.textContent = pad(t.d);
    out.h.textContent = pad(t.h);
    out.m.textContent = pad(t.m);
    out.s.textContent = pad(t.s);
    /* Screen readers get a minute-level label, not a ticking second hand. */
    const label = countdownLabel(t);
    if (label !== lastLabel) {
      el.setAttribute('aria-label', label);
      lastLabel = label;
    }
  };

  tick();
  tickTimer = setInterval(tick, 1000);
}

/* ---- Coming up ---------------------------------------------------------- */

function renderUpcoming(heroEvent) {
  const list = events.filter((e) => e !== heroEvent && isUpcoming(e)).slice(0, 4);
  if (!list.length) {
    upcomingEl.innerHTML = `
      <div class="empty">
        <p class="empty__title">Nothing else in the diary yet.</p>
        <p class="muted">New runs land in the WhatsApp community first.</p>
        <a class="btn" href="/join/">Join the community</a>
      </div>`;
    return;
  }
  upcomingEl.innerHTML = `
    <ol class="event-list" role="list">
      ${list.map((e) => `<li>${renderEventCard(e, { compact: true })}</li>`).join('')}
    </ol>`;
}

/* ---- Challenges --------------------------------------------------------- */

async function renderChallenges() {
  const section = document.querySelector('[data-home-challenges-section]');
  try {
    const challenges = (await loadChallenges()).filter((c) => challengePhase(c) !== 'ended');
    if (!challenges.length) {
      section.hidden = true;
      return;
    }
    challengesEl.innerHTML = challenges
      .map((c, i) => `<li>${renderChallengeCard(c, { compact: true, featured: i === 0 })}</li>`)
      .join('');
  } catch {
    section.hidden = true;
  }
}

/* ---- Boot --------------------------------------------------------------- */

async function init() {
  try {
    events = await loadEvents();
  } catch (err) {
    console.error(err);
    events = [];
  }
  renderHero();
  if (!findNextEvent(events)) renderUpcoming(null);
  renderChallenges();
}

/* Re-sync when a backgrounded tab comes back (timers drift while hidden). */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && events.length) renderHero();
});

init();
