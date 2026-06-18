# Aegis Dynamics — Security Screening Game

A *Papers, Please*-style browser game with a cybersecurity twist. You play the
night-shift access-vetting officer at a defense contractor, working from a
simulated 2010s-style desktop OS. Applicants show up across three "apps" —
a LinkedIn-style profile, an email inbox, and a texting app — and it's your
job to cross-reference all three, spot the scam, and Approve or Deny before
your company's integrity runs out.

Vanilla HTML/CSS/JS, no build step, no backend. Open `index.html` in a
browser (via a local static server — see below) and play.

## How it works

- **Desktop UI.** `index.html` renders a login screen, then a desktop with
  draggable/resizable/minimizable windows (`LinkedOut`, `MailHub`, `PingMe`,
  `Case File`, `Tips`), a taskbar, and desktop icons that shake if you leave
  a required window closed too long.
- **One applicant, three windows.** Each round, a single applicant's profile,
  email, and text message are rendered identically across LinkedOut, MailHub,
  and PingMe. You open the **Case File** window to actually Approve or Deny —
  it's the only place a decision can be made.
- **Difficulty & scoring.** Applicants are pulled from a pool with a
  difficulty rating (1–5). Correct calls build a streak that raises
  difficulty; wrong calls cost "company integrity" (health) and lower it.
  Clicking a scam link in a text message also costs integrity. The game ends
  when integrity hits zero or the applicant pool is exhausted.
- **Case File.** A sidebar lets you switch between the current round, a
  history of past decisions, and a High Scores page. High scores persist
  across reloads via `localStorage`.
- **Fullscreen prompt.** On load, a popup recommends playing in fullscreen
  with a button to request it (or continue windowed).

## Content pipeline

All applicant content — name, age, job, LinkedIn bio/experience, email,
text message, scam links, fake/real flag, difficulty — lives in
[`data/people.csv`](data/people.csv) (40 rows). `script.js` parses the CSV
client-side at load (hand-rolled CSV parser, no library) and normalizes each
row into a `person` object consumed by the renderers. Adding or editing an
applicant only requires editing the CSV; no code changes needed.

Profile pictures live in [`images/`](images) as `p1.svg`–`p40.svg`, generated
by [`data/gen_avatars.js`](data/gen_avatars.js) (a small Node script that
builds initials-on-color-background SVG avatars from the CSV).

## Project structure

```
index.html       All screens/windows markup (login, desktop, end screen)
styles.css        All styling, including the draggable-window chrome
script.js         Game state, CSV loading, rendering, window management,
                  shake-reminder logic, decision/scoring logic, high scores
data/people.csv   Source of truth for every applicant's content
data/gen_avatars.js  One-off script that generates images/p*.svg from the CSV
images/           Generated avatar SVGs (p1.svg ... p40.svg)
```

## Running locally

Opening `index.html` directly via `file://` will fail (the CSV is loaded
with `fetch`, which most browsers block for local files). Serve the folder
instead, e.g.:

```
python -m http.server 8765
```

then visit `http://localhost:8765/index.html`.

## Status

The core loop, window management, difficulty/scoring, and Case File
(stats + history + high scores) are implemented and tested. A `data/people
copy.csv` backup and a larger "Zero Trust" narrative redesign (shift-based
structure, a named antagonist storyline, a citation system) have been
discussed but are not yet built — the current game is the single-shared-
applicant model described above.
