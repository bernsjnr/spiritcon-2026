# BULLY THE ROADS · website

Central hub for BTR. Plain HTML, CSS and vanilla JS up front, PHP 8 + MySQL behind it from Phase 2. No frameworks, no build step. The full brief is in `CLAUDE.md`.

**Status: Phase 1, static prototype.** Every page is built and runs on mock JSON. There's no back end yet.

## Run it locally

```bash
cd btr/public_html
php -S localhost:8000
```

Then open http://localhost:8000. No PHP? `python3 -m http.server 8000` from the same folder works too. Opening the files directly (`file://`) won't work, because the pages load their data with `fetch`.

| Page | URL |
| --- | --- |
| Home | `/` |
| Calendar | `/calendar/` |
| Join the community | `/join/` |
| Challenges | `/challenges/` |
| Privacy notice | `/privacy/` |
| Admin (not linked anywhere) | `/admin/` |

### Preview other moments with `?now=`

The next-run hero, the calendar and the challenge states all work off the current time. Add `?now=` to any page to see how it looks at another moment:

- `/?now=2026-09-27T09:00` shows the hero mid-run ("Happening now")
- `/?now=2026-10-02T12:00` shows a social as the next event ("Next up")
- `/?now=2027-02-01` shows the "Next run: TBC" fallback
- `/challenges/?now=2026-10-25` shows ended challenges waiting for winners
- `/challenges/?now=2026-09-10` shows challenges that haven't started yet

A small banner reminds you you're previewing. It's a display-only testing aid.

### Admin prototype

Any password signs you in. Everything works in memory so you can click through the flows: create, edit, duplicate (defaults to a week later) and cancel events, review, approve, decline and add notes to applications, export them to CSV, edit challenges and add winners, and change settings. Nothing is saved; refresh and it resets.

## Structure

```
btr/
├── CLAUDE.md                 the brief
├── README.md
└── public_html/              web root (maps to Hostinger's public_html)
    ├── index.html            home
    ├── calendar/  join/  challenges/  privacy/  admin/
    ├── assets/
    │   ├── css/tokens.css    every colour, type and spacing value
    │   ├── css/site.css      public site
    │   ├── css/admin.css     admin only
    │   ├── js/core.js        data, dates, escaping, add-to-calendar, shared rendering
    │   ├── js/site.js        header, footer, admin-editable links (every page)
    │   ├── js/home.js  calendar.js  join.js  challenges.js  challenge-ui.js  admin.js
    │   └── img/              placeholder photos (SVG), favicon, share image
    └── data/                 PHASE 1 ONLY: mock JSON, deleted in Phase 2
```

Phase 2 adds `api/`, `config.example.php` and a private config folder that sits outside `public_html`.

## Dropping in the design system

- **Tokens:** everything lives in `assets/css/tokens.css`. Change the values and the whole site follows. `--heading-transform` switches display headings between uppercase and sentence case.
- **Typeface:** self-host the files in `assets/fonts/`, uncomment the `@font-face` block at the top of `tokens.css`, and put the family first in `--font-sans`. (No Google Fonts, so there's nothing tracking visitors.)
- **Photos:** swap the SVGs in `assets/img/` for real JPG/WebP files at the sizes printed on each placeholder, and update the `src`. Hero and community band are full-bleed with a dark overlay, controlled by `--overlay-hero` and `--overlay-band`.
- **Share image:** `og.svg` is a stand-in. Social platforms need a 1200×630 JPG or PNG before launch.

## How later phases plug in

- **Data:** `ENDPOINTS` at the top of `core.js` points at `/data/*.json`. Phase 2 repoints it to `/api/*.php`, which return the same shapes. Page code doesn't change.
- **Join form:** `join.js` validates in the browser and fakes the submit. Phase 3 swaps that for a POST to `/api/apply.php` with the Turnstile and CSRF tokens, and the server validates everything again.
- **Admin:** each in-memory action becomes a POST behind a real session. The prototype's data flow already matches.

### Data model tweaks so far

- `applications`: added `training_for` (events they're training for; the brief lists it on the form but not in the table) and `heard_from_other`. `availability` is stored as one readable string, e.g. `Wed, Sun · Morning, Evening`.
- `events`: times are ISO 8601 with the London offset. Admin enters London wall-clock time and BST/GMT is handled automatically. `pace_groups` is comma-separated text.
- `challenges`: `status` is `published` or `draft`. Live, upcoming and ended are worked out from the dates, so nobody has to flip them by hand.

## Open questions

Nothing in the brief was marked CONFIRM, so these are the calls I made that need your eye:

1. **Repo:** this sits in `btr/` inside `spiritcon-2026` because that's the repo this session could reach. Move it to its own repo before launch, and don't merge it into SPIRITCON's `main`.
2. **Hero label:** says "Next run" for runs and "Next up" for socials, Track + Play and other events. The TBC fallback always says "Next run: TBC".
3. **In-progress events:** the hero keeps showing a run until it finishes ("Happening now") rather than jumping to the next event the moment it starts. Cancelled events are skipped.
4. **Privacy notice:** controller name and legal form, Hostinger data centre region, retention for inactive members, IP logs and winners. All highlighted on the page.
5. **Instagram:** the footer links to `instagram.com/bullytheroads`. Confirm the handle.
6. **Winners:** shown as first name plus surname initial.
7. **Copy and mock content:** event names, locations, challenge rules and prizes are placeholders. The Autumn challenges are set live (21 Sep to 18 Oct) so you can see the live state.
