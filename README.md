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
- **Case File.** This Round (the current candidate's card + a running
  decision history right below it, each fake flagged with a collapsible
  "Why was this flagged?" reason) and a High Scores page, which persists
  across reloads via `localStorage`.
- **Story Mode.** A five-night campaign that runs through all 100 applicants,
  reusing the same windows/Case File flow as Endless mode. Each night opens
  with a redesigned briefing overlay and ends only when you read the boss's
  end-of-shift message in MailHub. The roster is rebuilt each playthrough:
  applicants are sorted into nights by difficulty (so the week escalates) but
  shuffled within their band (so the order varies), while four anchors stay
  pinned to specific nights and the named antagonist, Zyan Roch (impersonating
  real employee Ryan Zoch via the `aegisdynarnics.com` typosquat), is always
  the final card. Story Mode hides the integrity/threat/score/approval stats
  (only the case counter shows), gives no correct/wrong feedback on decisions,
  and signals a wrong call by glitching — escalating with the fake's difficulty,
  from a screen flash up to flashing intrusion popups and temporarily-corrupted
  windows. Approving the final card triggers a full "system crash" before the
  reveal. Six endings: COMMENDATION, YOU HELD THE LINE, AEGIS WAS BREACHED,
  TOTAL COMPROMISE, TERMINATED (integrity), and TERMINATED / POOR JUDGMENT
  (too many wrongful denials). Story Mode never writes to the high-score table.
- **Escalating mechanics (Story Mode).** Each night layers a new mechanic on
  top of the last, Papers-Please style:
  - **Night 2 — Company Directory:** the SecOps Console unlocks an allowlist of
    the genuine `aegisdynamics.com` domain and verified internal staff to
    cross-check against.
  - **Night 3 — Threat Bulletin:** a cumulative blocklist of flagged domains,
    emails, and aliases (the operator's breadcrumbs). Approving a blocklisted
    applicant bypasses the mistake buffer and deals extra integrity damage.
  - **Night 4 — CISO Directive (Engineering Freeze):** a command order that
    overrides normal judgment — every "Engineer" role must be denied that night,
    legitimate or not. Stays in effect Night 5. The Case File history explains
    any role denied under the freeze.
  - **Night 5 — Live Intrusions:** scripted, timed "pick the malicious
    indicator" interrupts mid-shift; failing or timing out costs integrity.
  - **Mistake allowance:** a shrinking per-night free-mistake buffer
    (3/2/2/1/1) before approvals-that-should-be-denials start draining integrity.

  The SecOps Console is a new desktop app whose sections unlock on the nights
  above, with an icon alert when fresh intel arrives. Denying a real applicant
  (a wrongful denial) is tracked separately from approving a hostile actor (a
  security incident) and a directive violation, so the firing and breach
  endings are independent failure tracks.
- **MailHub inbox.** MailHub has a real inbox list (current applicant plus
  the boss's messages) with an unread-count badge on its desktop icon and the
  Inbox header. End-of-shift consequences (routine note, warning, threat,
  firing, termination, or the finale) arrive as a boss email; the night does
  not advance until you open and acknowledge it. Nobody is fired mid-shift —
  every ending is delivered through that email.
- **Fullscreen prompt + button.** On load, a popup recommends playing in
  fullscreen with a button to request it (or continue windowed); a small
  fullscreen toggle also lives in the taskbar.

## Content pipeline

All applicant content — name, age, job, LinkedIn bio/experience, email,
text message, scam links, fake/real flag, difficulty — lives in
[`data/people.csv`](data/people.csv) (100 rows: 55 legitimate applicants and
45 fakes, spread across difficulty 1–5). `script.js` parses the CSV
client-side at load (hand-rolled CSV parser, no library) and normalizes each
row into a `person` object consumed by the renderers. Adding or editing an
applicant only requires editing the CSV; no code changes needed.

The reason text shown for each fake in the Case File history ("Why was this
flagged?") is a separate hand-written map (`FAKE_REASONS` in `script.js`,
keyed by applicant id) rather than a CSV column.

Profile pictures live in [`images/`](images) as `p1.jpeg`–`p100.jpeg`. If an
image fails to load (several higher-numbered photos are not yet supplied),
`setImgWithFallback()` swaps in a generated initials-on-gray-circle
placeholder instead of a broken image icon.

## Project structure

```
index.html       All screens/windows markup (login, desktop, end screen,
                  Story Mode briefing/reveal/crash overlays)
styles.css        All styling, including the draggable-window chrome and
                  Story Mode glitch/popup/crash keyframes
script.js         Game state, CSV loading, rendering, window management,
                  shake-reminder logic, decision/scoring logic, high scores,
                  Story Mode flow and glitch escalation, FAKE_REASONS map
data/people.csv   Source of truth for every applicant's content (51 rows)
data/gen_avatars.js  Legacy script that generated the original placeholder
                     SVG avatars from the CSV (images are now real .jpeg
                     photos and no longer regenerated by this script)
images/           Profile photos (p1.jpeg ... p51.jpeg)
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

Both Endless mode and Story Mode are implemented and tested, including the
Story Mode glitch-escalation system and finale. `data/people copy.csv` and
`images copy/` (the original placeholder SVG avatars, pre-photo-swap) are
leftover backups from earlier drafts and aren't used by the game.

Two profile photos are currently missing from `images/` (`p39.jpeg`,
`p40.jpeg` — Jerick Hernandez and Zyan Roch, the Story Mode finale
antagonist); both fall back to the generated initials placeholder via
`setImgWithFallback()` until real photos are added.
