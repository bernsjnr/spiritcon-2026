/* Challenges page: current (live + upcoming) and past with winners. */
import { getJSON, safeUrl, ENDPOINTS } from './core.js';
import { loadChallenges, challengePhase, renderChallengeCard, STRAVA_CLUB_FALLBACK } from './challenge-ui.js';

const currentEl = document.querySelector('[data-current]');
const pastEl = document.querySelector('[data-past]');
const pastSection = document.querySelector('[data-past-section]');

async function stravaClubUrl() {
  try {
    const settings = await getJSON(ENDPOINTS.settings);
    return safeUrl(settings.strava_club_url) || STRAVA_CLUB_FALLBACK;
  } catch {
    return STRAVA_CLUB_FALLBACK;
  }
}

async function init() {
  let challenges;
  try {
    challenges = await loadChallenges();
  } catch (err) {
    console.error(err);
    currentEl.innerHTML = `<li class="empty"><p class="empty__title">We couldn't load challenges.</p><p class="muted">Refresh the page to try again.</p></li>`;
    return;
  }
  const stravaFallback = await stravaClubUrl();

  const current = challenges
    .filter((c) => challengePhase(c) !== 'ended')
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id - b.id);
  const past = challenges
    .filter((c) => challengePhase(c) === 'ended')
    .sort((a, b) => b.ends_on.localeCompare(a.ends_on));

  currentEl.innerHTML = current.length
    ? current.map((c, i) => `<li>${renderChallengeCard(c, { featured: i === 0, stravaFallback })}</li>`).join('')
    : `<li class="empty">
         <p class="empty__title">Next challenge coming soon.</p>
         <p class="muted">Join the community and the Strava club to hear when it opens.</p>
       </li>`;

  if (past.length) {
    pastEl.innerHTML = past.map((c) => `<li>${renderChallengeCard(c, { stravaFallback })}</li>`).join('');
    pastSection.hidden = false;
  }

  /* Honour deep links like /challenges/#challenge-2 after render. */
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'start' });
}

init();
