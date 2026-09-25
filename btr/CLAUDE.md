# BULLY THE ROADS website: build brief

You're building the central hub site for BULLY THE ROADS (BTR), a grassroots London community sports club, running first, "for all people and all paces". Work in phases. Finish each phase, tell me how to test it locally, and wait for my sign-off before starting the next. Ask before making assumptions on anything marked CONFIRM.

## Hosting and stack

- Domain and hosting: Hostinger Premium (PHP + MySQL + email available).
- Front end: plain HTML, CSS and vanilla JS. No frameworks, no build step. Mobile first.
- Back end: PHP 8 + MySQL, small JSON endpoints under `/api`.
- Email: PHPMailer over SMTP using a Hostinger mailbox on the BTR domain (not PHP `mail()`).
- Local testing: `php -S localhost:8000` plus a local MySQL/SQLite fallback, with seed data.
- Secrets (DB creds, SMTP, Turnstile keys, admin password hash) live in a config file outside `public_html`. Provide a `config.example.php`.
- Deploy: give me step-by-step Hostinger instructions (File Manager or Git), including creating the DB and running the schema.

## Design

- BTR design system is in progress. Put all colour, type and spacing in CSS custom properties in one `tokens.css` so I can drop the real values in. Use neutral placeholders for now.
- One primary sans for headings and body. Bold, confident, lots of space. Photography-led (placeholder images for now).
- Accessible: semantic HTML, keyboard navigable, AA contrast, respects reduced motion.

## Pages

1. Home
2. Calendar
3. Join the community (application form)
4. Challenges
5. Privacy notice
6. Admin (password protected, not linked publicly)

## Features

### 1. Next run (home hero)
- The most prominent element on the homepage. Shows the next upcoming event: title, date, time, meeting point (with map link), distance, pace groups, partner (e.g. Runlimited).
- Pulls automatically from the events table (first event after now).
- Fallback when nothing is scheduled: "Next run: TBC" with a CTA to join the community to hear first.
- Countdown to start time.

### 2. Calendar
- List view by default (best on mobile), month view as a toggle.
- Event types: Run, Social, Track + Play, Other. Filterable.
- Each event has an "Add to calendar" button (.ics download + Google Calendar link).
- Events managed in the admin panel: create, edit, duplicate, cancel (cancelled events show as cancelled, not deleted).

### 3. Join the community (gated WhatsApp access)
The WhatsApp invite link must never appear on the public site. Flow:

1. Applicant fills in the form:
   - Name, email, mobile, rough area/postcode district, Instagram or Strava handle (optional)
   - Current running level and comfortable pace
   - Goals and ambitions, target times/distances, events they're training for
   - Why they want to join BTR, how they heard about us
   - Preferred days and times
   - Consent checkbox linked to the privacy notice, optional newsletter opt-in
2. Spam and fraud protection: Cloudflare Turnstile, honeypot field, rate limiting per IP and email, server-side validation, duplicate email/phone check.
3. Email verification: applicant gets a confirm-your-email link. Unverified applications expire after 7 days.
4. On verification, status becomes `pending` and a notification email goes to both:
   - bullytheroads@gmail.com
   - info@bernsds.com
   Include the full application and a direct link to review it in admin.
5. Admin approves or declines in the dashboard.
   - Approve: applicant receives a welcome email with the WhatsApp community link (link stored in config, changeable in admin).
   - Decline: optional polite email, or silent.
6. Admin can search, filter by status, add notes, and export all applicants to CSV.

Note for me in the handover: set the WhatsApp community to "approve new members" and reset the invite link periodically, so a leaked link still can't be used without approval.

### 4. Strava and challenges
Strava's API terms don't allow showing athletes' data to other users or powering competitions, so do NOT integrate the Strava API. Keep it simple:

- A "Join BTR on Strava" button linking to https://www.strava.com/clubs/bullytheroads. Show it in the footer, on the Join page and on the Challenges page.
- Challenges page: simple cards (name, distance, dates, rules, prize, sponsor) with a button linking out to the Strava Group Challenge. No entry form, no leaderboard on our site.
- Launch content: two concurrent challenges, 20k and 40k, each with its own prize.
- After a challenge ends, admin enters winners manually (position, name, result) and the card shows a winners panel.

### 5. Admin
- Single admin login (password hash in config), sessions, CSRF tokens on every form, logout.
- Sections: Events, Applications, Challenges (cards + winners), Settings (WhatsApp link, Strava club link, notification emails).

## Data model (starting point, refine as needed)

- `events`: id, title, type, starts_at, ends_at, location_name, location_url, distance, pace_groups, partner, description, status
- `applications`: id, name, email, phone, area, handle, level, pace, goals, target_times, why_btr, heard_from, availability, newsletter_opt_in, status (unverified/pending/approved/declined), verify_token, notes, created_at, updated_at
- `challenges`: id, title, distance, starts_on, ends_on, rules, prize, sponsor, strava_url, status
- `challenge_results`: id, challenge_id, position, name, result

## Security and privacy (UK GDPR)

- Prepared statements everywhere, output escaping, CSRF, secure session cookies, HTTPS only.
- Privacy notice page: what we collect, why, who sees it, retention (declined/unverified data deleted after 90 days via a cleanup script), how to request deletion.
- No tracking scripts by default.

## Phases

1. Static prototype: all pages with mock JSON data, responsive, tokens in place. No back end.
2. Back end: database, events, calendar, next-run logic, admin for events.
3. Join flow: form, Turnstile, verification, notifications, approval, CSV export.
4. Strava link and challenges: cards, winners panel.
5. Deploy guide for Hostinger and a pre-launch checklist.
