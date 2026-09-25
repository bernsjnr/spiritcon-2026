/* Challenge helpers shared by the home teaser and the Challenges page. */
import { ENDPOINTS, getJSON, esc, safeUrl, splitLines, formatDateSpan, dayKey, now, ICON_ARROW, ICON_RIGHT } from './core.js';

export const STRAVA_CLUB_FALLBACK = 'https://www.strava.com/clubs/bullytheroads';

export async function loadChallenges() {
  const data = await getJSON(ENDPOINTS.challenges);
  return (data.challenges ?? data).filter((c) => c.status !== 'draft');
}

/* Challenges run on whole London days, inclusive of both ends. */
export function challengePhase(c, at = now()) {
  const today = dayKey(at);
  if (today < c.starts_on) return 'upcoming';
  if (today > c.ends_on) return 'ended';
  return 'live';
}

function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

function phaseBadge(c, phase, at) {
  if (phase === 'live') {
    const left = daysBetween(dayKey(at), c.ends_on);
    const label = left === 0 ? 'Live · last day' : `Live · ${left} day${left === 1 ? '' : 's'} left`;
    return `<span class="badge badge--live">${label}</span>`;
  }
  if (phase === 'upcoming') {
    const until = daysBetween(dayKey(at), c.starts_on);
    return `<span class="badge badge--upcoming">Starts in ${until} day${until === 1 ? '' : 's'}</span>`;
  }
  return '<span class="badge badge--ended">Ended</span>';
}

function renderWinners(c, level) {
  const h = `h${level}`;
  const results = [...(c.results ?? [])].sort((a, b) => a.position - b.position);
  if (!results.length) {
    return `
      <div class="winners winners--pending">
        <${h} class="winners__title">Winners</${h}>
        <p>Results are being checked. Winners announced here soon.</p>
      </div>`;
  }
  return `
    <div class="winners">
      <${h} class="winners__title">Winners</${h}>
      <ol>
        ${results
          .map(
            (r) => `
          <li>
            <span class="winners__pos"><span class="visually-hidden">Position </span>${esc(r.position)}</span>
            <span class="winners__name">${esc(r.name)}</span>
            <span class="winners__result">${esc(r.result)}</span>
          </li>`,
          )
          .join('')}
      </ol>
    </div>`;
}

export function renderChallengeCard(c, { level = 3, compact = false, featured = false, at = now(), stravaFallback = STRAVA_CLUB_FALLBACK } = {}) {
  const phase = challengePhase(c, at);
  const h = `h${level}`;
  const id = `challenge-${esc(c.id)}`;
  const url = safeUrl(c.strava_url) || stravaFallback;
  const rules = splitLines(c.rules);

  const meta = [
    c.distance && `<div><dt>Distance</dt><dd>${esc(c.distance)}</dd></div>`,
    c.prize && `<div><dt>Prize</dt><dd>${esc(c.prize)}</dd></div>`,
    c.sponsor && `<div><dt>Sponsor</dt><dd>${esc(c.sponsor)}</dd></div>`,
  ].filter(Boolean);

  let cta;
  if (compact) {
    cta = `<a class="link-arrow" href="/challenges/#${id}">Details and rules ${ICON_RIGHT}</a>`;
  } else if (phase === 'ended') {
    cta = `<a class="btn btn--secondary" href="${esc(url)}" target="_blank" rel="noopener">View on Strava ${ICON_ARROW}<span class="visually-hidden"> (opens in new tab)</span></a>`;
  } else {
    const btn = featured ? 'btn btn--inverse' : 'btn';
    cta = `<a class="${btn}" href="${esc(url)}" target="_blank" rel="noopener">Join the challenge on Strava ${ICON_ARROW}<span class="visually-hidden"> (opens in new tab)</span></a>`;
  }

  return `
    <article class="challenge ${featured ? 'challenge--featured' : ''}" id="${id}" aria-labelledby="${id}-title">
      <div class="challenge__top">
        <p class="challenge__distance" aria-hidden="true">${esc(c.distance)}</p>
        ${phaseBadge(c, phase, at)}
      </div>
      <div>
        <${h} class="challenge__title" id="${id}-title">${esc(c.title)}</${h}>
        <p class="challenge__dates">${esc(formatDateSpan(c.starts_on, c.ends_on))}</p>
      </div>
      ${meta.length ? `<dl class="meta">${meta.join('')}</dl>` : ''}
      ${
        !compact && rules.length
          ? `<div>
              <${`h${level + 1}`} class="challenge__rules-title">Rules</${`h${level + 1}`}>
              <ul class="challenge__rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
            </div>`
          : ''
      }
      ${!compact && phase === 'ended' ? renderWinners(c, level + 1) : ''}
      <div class="challenge__cta">${cta}</div>
    </article>`;
}
