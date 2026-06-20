/* =========================================================
   AEGIS DYNAMICS :: Papers-Please-style security screening game
   All applicant content is data-driven from data/people.csv
   ========================================================= */

/* ----------------------- CSV LOADING ----------------------- */

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      let val = fields[idx] !== undefined ? fields[idx] : '';
      val = val.replace(/\\n/g, '\n');
      obj[h.trim()] = val;
    });
    rows.push(obj);
  }
  return rows;
}

function normalizePerson(row) {
  return {
    id: Number(row.id),
    name: row.name,
    gender: row.gender,
    age: row.age,
    job: row.job,
    isFake: String(row.isFake).trim().toLowerCase() === 'true',
    difficulty: Number(row.difficulty) || 1,
    pfp: row.pfp ? `images/${row.pfp}` : '',
    pfpScale: Number(row.pfp_scale) || 1,
    li: {
      headline: row.li_headline,
      company: row.li_company,
      location: row.li_location,
      experience: row.li_experience ? row.li_experience.split('|').map(s => s.trim()).filter(Boolean) : [],
      education: row.li_education,
      mutuals: row.li_mutuals,
      bio: row.li_bio
    },
    email: row.email_subject ? {
      subject: row.email_subject,
      senderName: row.email_sender_name,
      senderAddress: row.email_sender_address,
      body: row.email_body
    } : null,
    text: row.text_body ? {
      sender: row.text_sender_display,
      body: row.text_body,
      link: row.text_link
    } : null,
    approveLabel: row.approve_label || 'APPROVE',
    denyLabel: row.deny_label || 'DENY'
  };
}

function setImgWithFallback(imgEl, src, fallbackInitials) {
  imgEl.onerror = () => {
    imgEl.onerror = null;
    const initials = (fallbackInitials || '?').slice(0, 2).toUpperCase();
    imgEl.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">` +
      `<rect width="80" height="80" fill="#5a6b7a"/>` +
      `<text x="40" y="48" font-family="Tahoma,Arial,sans-serif" font-size="28" fill="#fff" text-anchor="middle">${initials}</text>` +
      `</svg>`
    );
  };
  imgEl.src = src;
}

/* ----------------------- STORY MODE: FAKE REASONS ----------------------- */

const FAKE_REASONS = {
  31: 'Scam email domain (freemoneynow-jobs.biz), demands login credentials before starting, and the text links to a fake "pre-approved badge" claim — a classic advance-fee/phishing scam.',
  32: 'Sender domain is a typosquat (aisolutions-glabal.com instead of aisolutions-global.com), and the email requests VPN access and an administrator login before he\'s even hired.',
  33: 'Asks for a temporary login to "audit" the network before being hired, then follows up asking you to approve an MFA push for his account — a classic MFA-fatigue social engineering attempt.',
  34: 'Personal email is a .ru domain, and he asks that all offer paperwork and login credentials be redirected to a third party\'s email (zyan.roch.helper@mail.ru) — a name that resurfaces later.',
  35: 'Bio inconsistently switches between first- and third-person ("Robert is a hard worker... his deadlines"), the listed gender doesn\'t match the name/pronouns, and the email domain is a typosquat (globaIcorp.com, capital I instead of lowercase l).',
  36: 'Job history is inconsistent (claims Science Teacher but his own LinkedIn experience says English Teacher), his email domain is a typo of gmail.com (gmial.com), and he asks you to enable macros to view an attachment — a textbook malicious-document tell.',
  37: 'Asks you, the hiring screener, to verify your own employee ID and Social Security number over text — a real HR rep would never request that, especially not via SMS.',
  38: 'Profile lists him as 12 years old, but his email and text claim he\'s 21 and a Harvard graduate — the application openly contradicts itself.',
  39: 'Email and link domains are typosquats of Outlook (outlo0k.com, outlo0k-secure-login.cf), and his "grandson" asks for your administrator password before he even starts.',
  40: 'Domain is a one-letter typosquat of aegisdynamics.com (aegisdynarnics.com — "rn" standing in for "m"), and he asks you to approve an MFA push from an unfamiliar phone number while claiming technical difficulties — the same impersonation pattern flagged back on Shift 2.',
  41: 'Email claims 40 years of software/cybersecurity experience that has nothing to do with his actual LinkedIn background as a mechanical engineer, and the sender domain (securemail-verify.com) is a generic phishing-style domain, not his employer\'s.',
  42: 'Claims a "hardware anomaly" on your workstation and asks for your username and password to fix it — credential phishing dressed up as IT support, from a domain (techcorp-support.net) that isn\'t his employer\'s real domain.',
  43: 'Sender domain doesn\'t match his stated employer (Independent Legal Partners vs. legal-defense-firm.com), and he asks for your proof of employment and personal information while threatening termination if you don\'t comply.',
  44: 'Sender domain doesn\'t match her stated employer, and the link in her text is a typosquat of your own company\'s domain (agisdynamics.net is missing the "e" in Aegis) — pointing employees to a fake internal portal.',
  45: 'Email subject is an unrelated invoice rather than a job application, and the "LinkedIn" link he texts you points to linkedin.net, not the real linkedin.com — a typosquatted domain.',
  46: 'Asks the company to pay "hiring fees" before he starts (backwards for a real hire), and the link he wants you to approve points to paypaL.net — a typosquat of PayPal with no connection to the job.',
  47: 'Pushes you to immediately execute an attached "verification script" under urgent, hype-heavy language, and the link he sends is github.net — a typosquat of github.com.',
  48: 'The portfolio link he sends (sites.googIe.com) uses a capital I in place of a lowercase l to impersonate Google Sites — a classic homoglyph typosquat.',
  49: 'Asks you to double-click an .exe file attached to his "resume" — a real resume is never a Windows executable.',
  50: 'Asks for edit access to the company\'s internal Google Drive before she\'s even hired, framed as just needing to drop off a resume — an unnecessary and risky permission request.',
  51: 'Sender domain is the same "rn-for-m" typosquat as the Zyan Roch impersonation (aegisdynarnics.com), and the linked document uses another typosquat (docs.googIe.com) — someone is impersonating your own CEO to get an internal document opened.'
};

/* ----------------------- GAME STATE ----------------------- */

const REQUIRED_APPS = ['linkedin', 'email', 'text', 'application'];
const HIGH_SCORE_KEY = 'aegisHighScores';
const MAX_HIGH_SCORES = 10;

// Set to 1 for a single shared applicant shown on all three platforms,
// or 3 for three separate applicants each appearing on one platform.
const APPLICANTS_PER_ROUND = 1;
const PLATFORMS = ['linkedin', 'email', 'text'];
const PLATFORM_LABELS = { linkedin: 'LinkedOut', email: 'MailHub', text: 'PingMe' };

const Game = {
  people: [],
  pool: [],
  round: [],
  history: [],
  linkClicked: new Set(),
  health: 100,
  score: 0,
  difficulty: 1,
  streak: 0,
  caseNumber: 0,
  totalCases: 0,
  peakDifficulty: 1,
  correctCount: 0,
  over: false,
  openWindows: new Set(),
  focusedWindow: null,
  shakeWatcherId: null,
  shakeTimers: {},
  topZIndex: 30,
  storyMode: false,
  storyDays: [],
  storyDayIndex: 0,
  storyCardIndex: 0,
  storyWrongfulDenials: 0,
  securityIncidents: 0,
  policyViolations: 0,
  nightMistakes: 0,
  bossWarnSent: false,
  bossThreatSent: false,
  inbox: [],
  awaitingShiftEmail: false,
  secopsUnread: false,
  intrusionActive: false,
  intrusionCount: 0
};

/* ----------------------- STORY MODE ----------------------- */

const STORY_DAY_COUNT = 5;
const STORY_ZYAN_ID = 40;

// Applicants pinned to a specific day (0-based). Everyone else is shuffled into
// days by difficulty band so each playthrough varies but the days still escalate.
const STORY_ANCHORS = [
  { id: 28, day: 1 },              // real Ryan Zoch, internal transfer from the genuine domain
  { id: 34, day: 1 },              // Leviticus Cornwall, plants the zyan.roch.helper clue
  { id: 51, day: 3 },              // Mark Aegis, CEO impersonation
  { id: 40, day: 4, last: true }   // Zyan Roch, the finale, always the last card of the week
];

const STORY_BOSS = {
  name: 'Helen Park',
  title: 'CISO, Aegis Dynamics',
  address: 'helen.park@aegisdynamics.com'
};

const STORY_DAY_BRIEFINGS = [
  {
    title: 'NIGHT 1 / ORIENTATION',
    body: 'Welcome to the night shift. Every name on your screen wants access to a defense contractor\'s systems, and tonight is the easy part: prove each one is who they claim to be. Match the name on the profile to the name on the email, and watch the domains. Most of tonight is noise. Get your eye in.'
  },
  {
    title: 'NIGHT 2 / INTENT',
    body: 'Stop reading who they are and start reading what they want. The requests sharpen tonight: VPN logins, MFA approvals, a Social Security number "for the file." Real IT never asks you to approve their login, and no honest applicant needs your credentials. Watch one name in particular, and remember it.'
  },
  {
    title: 'NIGHT 3 / THE PATTERN',
    body: 'The SOC flagged something. The junk applications all week were not random. Someone is mapping us one harmless request at a time, and the lookalike domains are getting good. One letter off is still off. Cross-reference everything against what you already know is real.'
  },
  {
    title: 'NIGHT 4 / THE NET TIGHTENS',
    body: 'It is one operator. The SOC is certain now. The scattered scams, the borrowed names, the grandson with the foreign email address: all the same hand. Tonight they reach higher, maybe all the way to the top. If a request feels too important to question, question it twice.'
  },
  {
    title: 'NIGHT 5 / THE ADVERSARY',
    body: 'This is the night they make their move, and they will look like one of us. Everything you learned this week comes down to the last face on your screen. Verify every name against what you know to be real. Hold the line.'
  }
];

const STORY_FINALE_REVEAL = {
  denied: 'DENIED. You check the address one more time: ryan.zoch@aegisdynarnics.com — not aegisdynamics. One letter; “rn” wearing the shape of an “m.” The real Ryan Zoch signed his transfer two nights ago, from the real domain. The account belongs to Zyan Roch — the same “grandson” name on a scam you cleared on Shift 2. One operator, mapping Aegis all week. Tonight he ran out of road.',
  approved: 'ACCESS GRANTED. The signing link goes out, and within the hour “Ryan Zoch” pulls the propulsion test-stand archives and vanishes. It was never Ryan — ryan.zoch@aegisdynarnics.com, one letter off. The account belonged to Zyan Roch, the same name buried in a scam you waved through on Shift 2. He probed Aegis all week behind small, forgettable requests. Tonight you opened the door.'
};

const STORY_ENDINGS = {
  good: {
    title: 'YOU HELD THE LINE',
    subtitle: 'Aegis is secure. The operator\'s week of probing ends with nothing to show for it, and the SOC finally has a name: Zyan Roch. You caught the one that mattered.'
  },
  commendation: {
    title: 'COMMENDATION',
    subtitle: 'You held the line and barely put a foot wrong all week. The impostor never got close, no qualified hire was turned away in error, and the CISO has put your name forward for the day shift. Few screeners are ever this clean.'
  },
  breach: {
    title: 'AEGIS WAS BREACHED',
    subtitle: 'The signing link went out, and "Ryan Zoch" was never Ryan. The propulsion test-stand archives are gone by morning and the board wants answers. You caught small fish all week and let the shark walk through the front door.'
  },
  catastrophicBreach: {
    title: 'TOTAL COMPROMISE',
    subtitle: 'It was never just one bad call. You waved through the grandsons, the assistants, the returning employees, and finally the operator himself. By morning Aegis has no secrets left to steal. They will be studying this breach for years.'
  },
  termination: {
    title: 'TERMINATED',
    subtitle: 'Company integrity hit zero. Too many hostile actors walked through your gate, and Security walked you out before the week was over. Somewhere out there, Zyan Roch is still mapping Aegis. Now it is someone else\'s problem.'
  },
  deniedTooMany: {
    title: 'TERMINATED / POOR JUDGMENT',
    subtitle: 'You denied a dozen qualified applicants this week. The board does not care that the impostor never got through; they care that Aegis nearly lost a dozen good hires because you could not tell friend from foe. You are done here.'
  }
};

const WRONGFUL_DENIAL_WARN_AT = 4;
const WRONGFUL_DENIAL_THREAT_AT = 8;
const WRONGFUL_DENIAL_FIRED_AT = 12;

// End-of-shift email content from the boss. Each returns the message body shown in
// MailHub. Ending emails carry an `outcome` that fires when the player reads them.
function buildBossShiftEmail(dayIndex) {
  const lastWorkingDay = dayIndex >= STORY_DAY_COUNT - 1;
  const denials = Game.storyWrongfulDenials;
  const incidents = Game.securityIncidents;

  if (Game.health <= 0) {
    return {
      subject: 'Access revoked - end of shift',
      isEnding: true, outcome: incidents >= 4 ? 'catastrophicBreach' : 'termination',
      body: 'It is over.\n\nCompany integrity has bottomed out. Too many hostile actors got past your desk this week, and the breach team is already in the building. I argued for you as long as I could. I could not argue with the logs.\n\nSecurity is on their way to your station. Leave the badge.\n\n- Helen Park, CISO'
    };
  }
  if (denials >= WRONGFUL_DENIAL_FIRED_AT) {
    return {
      subject: 'We need to talk - effective immediately',
      isEnding: true, outcome: 'deniedTooMany',
      body: 'I have HR on the line.\n\nThat is a dozen qualified people you turned away this week. Good engineers, good hires, gone because they pinged your radar wrong. The business cannot run a gate that says no to everyone.\n\nI am sorry. This is your last shift. Hand off the queue.\n\n- Helen Park, CISO'
    };
  }
  if (denials >= WRONGFUL_DENIAL_THREAT_AT && !Game.bossThreatSent) {
    Game.bossThreatSent = true;
    return {
      subject: 'Second warning - read this',
      isEnding: false,
      body: 'This is the second time I am flagging this.\n\nThat is ' + denials + ' legitimate applicants you have denied this week. I get it, the job is to be suspicious. But suspicion that rejects every good hire is just a different kind of failure. One more pattern like this and HR makes it official.\n\nTighten it up. I am rooting for you.\n\n- Helen Park, CISO'
    };
  }
  if (denials >= WRONGFUL_DENIAL_WARN_AT && !Game.bossWarnSent) {
    Game.bossWarnSent = true;
    return {
      subject: 'Quick note on tonight',
      isEnding: false,
      body: 'Good work catching the obvious ones.\n\nOne thing: I am seeing a few denials on applicants who check out completely fine. We genuinely need these hires, so do not let the paranoia run away with you. Approve the real people. Deny the wrong ones. Easy to say, I know.\n\nSee you tomorrow night.\n\n- Helen Park, CISO'
    };
  }
  if (incidents >= 2) {
    return {
      subject: 'End of shift - flag on the logs',
      isEnding: false,
      body: 'Shift logged.\n\nHeads up: the SOC bounced a couple of approvals from your desk tonight that should never have cleared. Integrity took a hit. Whoever is probing us is getting better, so slow down and read the domains twice.\n\nWe will get them. See you tomorrow.\n\n- Helen Park, CISO'
    };
  }
  return {
    subject: lastWorkingDay ? 'Last night - stay sharp' : 'End of shift - nice work',
    isEnding: false,
    body: (lastWorkingDay
      ? 'Clean shift again. One night left.\n\nWhatever has been circling us all week is going to take its shot before the weekend. Trust what you have learned. The real ones look ordinary; the dangerous ones look almost ordinary.\n\nHold the line tomorrow.'
      : 'Clean shift. The gate held and the real hires made it through.\n\nThis is exactly what the job looks like when it is done right. Get some sleep and do it again tomorrow.')
      + '\n\n- Helen Park, CISO'
  };
}

/* ----------------------- STORY MODE: SECOPS MECHANICS ----------------------- */

// Reference panels in the SecOps Console unlock as the week escalates (0-based night).
const SECOPS_DIRECTORY_NIGHT = 1; // Night 2
const SECOPS_BULLETIN_NIGHT = 2;  // Night 3
const SECOPS_DIRECTIVE_NIGHT = 3; // Night 4

// Company Directory: the allowlist of genuine internal facts to verify against.
const STORY_DIRECTORY = {
  domain: 'aegisdynamics.com',
  domainNote: 'The ONLY genuine Aegis Dynamics email domain. Any spelling variation (extra letters, hyphens, suffixes, "rn" for "m") is an impostor.',
  employees: [
    { name: 'Ryan Zoch', dept: 'Propulsion / Aerospace', email: 'ryan.zoch@aegisdynamics.com' },
    { name: 'Priscilla Vance', dept: 'Systems Administration', email: 'priscilla.vance@aegisdynamics.com' },
    { name: 'Helen Park', dept: 'CISO (your supervisor)', email: 'helen.park@aegisdynamics.com' }
  ],
  externalNote: 'External applicants normally apply from personal mail (gmail, yahoo, outlook). A corporate-looking domain that is not on this list is a red flag.'
};

// Threat Bulletin: cumulative blocklist. Each entry is added on the given night
// and stays for the rest of the week.
const STORY_BULLETIN = [
  { night: 2, items: [
    { kind: 'domain', value: 'aegisdynarnics.com', note: 'Typosquat of aegisdynamics.com ("rn" wearing the shape of an "m"). Used to impersonate staff.' },
    { kind: 'email', value: 'zyan.roch.helper@mail.ru', note: 'Credential-drop address. Deny any applicant who redirects logins or offers here.' },
    { kind: 'domain', value: '.ru free-mail (securemail.ru, oilfieldmail.ru, mail.ru)', note: 'Foreign free-mail used for the "grandson helper" credential redirects.' }
  ]},
  { night: 3, items: [
    { kind: 'domain', value: 'aegis-dynamics.com / aegisdynamics-hr.com', note: 'Hyphen and suffix lookalikes. Not the genuine domain.' },
    { kind: 'alias', value: 'Zyan Roch', note: 'Confirmed alias of the operator running this campaign. Deny on contact.' },
    { kind: 'tactic', value: 'Credential / MFA / access requests', note: 'No real applicant needs YOUR login, MFA approval, or session token. Treat every such ask as hostile.' }
  ]},
  { night: 4, items: [
    { kind: 'tactic', value: 'CEO / executive impersonation (BEC)', note: 'Emails invoking Mark Aegis and demanding urgent, discreet admin access. The CEO does not onboard through your queue.' },
    { kind: 'domain', value: 'Vendor lookalikes (docu-sign-*, *-verify, *-careers, billing-aegis-*)', note: 'Fake e-sign, verification, recruiting, and billing portals harvesting credentials.' }
  ]}
];

// CISO Directive (Night 4 onward): the Engineering Freeze. Overrides normal judgment.
const STORY_DIRECTIVE = {
  title: 'PRIORITY DIRECTIVE: ENGINEERING FREEZE',
  rule: 'During the active incident, all engineering hiring is frozen. Deny EVERY applicant whose role contains "Engineer" tonight, legitimate or not. Process every other role normally. This directive stays in effect for the rest of the week.',
  appliesTo: (person) => /engineer/i.test(person.job || '')
};

function directiveActive() {
  return Game.storyMode && Game.storyDayIndex >= SECOPS_DIRECTIVE_NIGHT;
}

// What the correct action is for a card, accounting for the active directive.
// Returns true if APPROVE is correct, false if DENY is correct.
function approveIsCorrect(person) {
  if (directiveActive() && STORY_DIRECTIVE.appliesTo(person)) return false;
  return !person.isFake;
}

// Cumulative bulletin items visible on a given 0-based night.
function bulletinItemsForNight(dayIndex) {
  const night = dayIndex + 1;
  return STORY_BULLETIN.filter(b => b.night <= night).flatMap(b => b.items);
}

// Per-night free-mistake buffer before approvals-that-should-be-denials cost integrity.
const MISTAKE_ALLOWANCE_BY_NIGHT = [3, 2, 2, 1, 1];

// Night 5 live-intrusion mini-events fire roughly a third and two-thirds of the
// way through the final shift, scaled to however many cards that night actually has.
function intrusionPointsForDay(dayLen) {
  const pts = [];
  [Math.floor(dayLen * 0.35), Math.floor(dayLen * 0.65)].forEach(x => {
    if (x >= 1 && x < dayLen - 1 && !pts.includes(x)) pts.push(x);
  });
  return pts;
}
const STORY_INTRUSIONS = [
  {
    prompt: 'A login flood is hammering the VPN gateway. Identify and block the hostile source domain before it brute-forces in.',
    malicious: 'aegisdynarnics.com',
    benign: ['aegisdynamics.com', 'cobalt-systems.com', 'gmail.com']
  },
  {
    prompt: 'Credentials are being exfiltrated to a drop address. Block the destination before the transfer completes.',
    malicious: 'zyan.roch.helper@mail.ru',
    benign: ['helen.park@aegisdynamics.com', 'ryan.zoch@aegisdynamics.com', 'priscilla.vance@aegisdynamics.com']
  }
];

// Short "what's new tonight" callout shown on the briefing (null = nothing new).
const STORY_NIGHT_MECHANICS = [
  null,
  'NEW TOOL: The Company Directory is live in the SecOps Console. Check email domains and internal transfers against it.',
  'NEW INTEL: The Threat Bulletin is live in SecOps. Anything on the blocklist is an automatic deny.',
  'NEW ORDER: A CISO Directive is in effect (see SecOps). Engineering hiring is frozen: deny every "Engineer" role tonight, real or not.',
  'ALERT: The operator will try to breach us live tonight. Expect intrusions mid-shift, and contain them fast.'
];

/* ----------------------- BOOT LOG / LOGIN ----------------------- */

const BOOT_LINES = [
  'Initializing secure shell...........[OK]',
  'Mounting personnel database.........[OK]',
  'Loading verification subsystem......[OK]',
  'Checking phishing filter rules......[OK]',
  'Awaiting operator credentials.......'
];

function runBootLog() {
  const el = document.getElementById('boot-log');
  el.textContent = '';
  let i = 0;
  function step() {
    if (i < BOOT_LINES.length) {
      el.textContent += BOOT_LINES[i] + '\n';
      i++;
      setTimeout(step, 260);
    }
  }
  step();
}

function setupLogin() {
  runBootLog();
  const form = document.getElementById('login-form');
  const status = document.getElementById('login-status');

  function authenticate(onDone) {
    status.textContent = 'Status: Authenticating...';
    setTimeout(() => {
      status.textContent = 'Status: Access granted.';
      setTimeout(onDone, 500);
    }, 700);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    authenticate(() => startGame(false));
  });

  document.getElementById('story-mode-btn').addEventListener('click', () => {
    authenticate(() => startGame(true));
  });
}

/* ----------------------- GAME INIT ----------------------- */

async function loadPeople() {
  const res = await fetch('data/people.csv');
  const text = await res.text();
  const rows = parseCsv(text);
  return rows.map(normalizePerson);
}

function startGame(storyMode) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.remove('breach-glitch');
  document.getElementById('story-briefing').classList.add('hidden');
  document.getElementById('story-reveal').classList.add('hidden');
  document.getElementById('desktop-screen').classList.remove('hidden');

  Game.storyMode = !!storyMode;
  Game.pool = Game.people.slice();
  Game.round = [];
  Game.history = [];
  Game.linkClicked = new Set();
  Game.health = 100;
  Game.score = 0;
  Game.difficulty = 1;
  Game.streak = 0;
  Game.caseNumber = 0;
  Game.peakDifficulty = 1;
  Game.correctCount = 0;
  Game.over = false;
  Game.topZIndex = 30;
  Game.storyDayIndex = 0;
  Game.storyCardIndex = 0;
  Game.storyWrongfulDenials = 0;
  Game.securityIncidents = 0;
  Game.policyViolations = 0;
  Game.nightMistakes = 0;
  Game.bossWarnSent = false;
  Game.bossThreatSent = false;
  Game.awaitingShiftEmail = false;
  Game.secopsUnread = false;
  Game.intrusionActive = false;
  Game.intrusionCount = 0;
  Game.inbox = [];
  Game.storyDays = Game.storyMode ? buildStoryDays() : [];
  Game.totalCases = Game.storyMode
    ? Game.storyDays.reduce((n, d) => n + d.length, 0)
    : Game.people.length;
  document.getElementById('crash-overlay').classList.add('hidden');
  document.getElementById('intrusion-overlay').classList.add('hidden');
  document.getElementById('intrusion-popup-layer').innerHTML = '';
  document.getElementById('boss-notification-layer').innerHTML = '';
  document.getElementById('debrief-overlay').classList.add('hidden');
  document.getElementById('desktop-screen').classList.remove('mega-glitch');
  document.querySelectorAll('.window').forEach(w => w.classList.remove('window-glitched'));
  document.querySelector('.app-stats-bar').classList.toggle('story-minimal', Game.storyMode);
  const secopsIcon = document.getElementById('icon-secops');
  if (secopsIcon) { secopsIcon.classList.add('hidden'); secopsIcon.classList.remove('intel-alert'); }

  renderHistory();
  updateFooter();
  updateTipsCopy();
  renderInbox();
  updateMailBadge();
  renderSecops();
  updateSecopsBadge();
  startClock();
  openWindow('tips');
  centerWindow(document.getElementById('window-tips'));
  startShakeWatcher();

  if (Game.storyMode) {
    startStoryDay(0);
  } else {
    nextRound();
  }
}

function updateTipsCopy() {
  const body = document.querySelector('#window-tips .tips-body');
  if (!body) return;
  if (Game.storyMode) {
    body.querySelector('h2').textContent = 'Night Shift, Aegis Dynamics.';
    body.querySelector('h2 + p').innerHTML =
      'One applicant at a time. They appear on <strong>LinkedOut</strong>, ' +
      '<strong>MailHub</strong>, and <strong>PingMe</strong>. Approve who is real, deny who is not, ' +
      'and survive five nights.';
    body.querySelector('ul').innerHTML =
      '<li>Cross-reference the profile, the email, and the text before you decide.</li>' +
      '<li>Open the <strong>Case File</strong> to Approve or Deny. It also holds your history.</li>' +
      '<li>Watch the email domains. One letter off is still off.</li>' +
      '<li>New tools and rules arrive each night in the <strong>SecOps Console</strong>: directory, threat bulletin, and command directives.</li>' +
      '<li>Approving a hostile actor costs integrity; clicking their links does too.</li>' +
      '<li>At the end of each night, read the boss\'s message in <strong>MailHub</strong> to clock out.</li>';
    body.querySelector('.tips-reminder').innerHTML =
      'Reopen this anytime from the <strong>Tips</strong> icon.';
    return;
  }
  if (APPLICANTS_PER_ROUND === 1) {
    body.querySelector('h2 + p').innerHTML =
      'Each shift, one candidate applies at a time &mdash; and they show up identically on ' +
      '<strong>LinkedOut</strong>, <strong>MailHub</strong>, and <strong>PingMe</strong>. Cross-reference all three before you decide.';
    body.querySelector('ul').innerHTML =
      '<li>Open LinkedOut, MailHub, and PingMe &mdash; all three show the same candidate.</li>' +
      '<li>Open the <strong>Case File</strong> &mdash; the only place to Approve or Deny, with full history.</li>' +
      '<li>Watch for typos, mismatched names, urgent demands, and suspicious links.</li>' +
      '<li>Clicking a suspicious link costs integrity, just like a wrong decision.</li>' +
      '<li>Integrity, Score, Case count, and Threat Level live at the top of the Case File.</li>' +
      '<li>Drag windows by their title bar, resize them from the bottom-right corner.</li>';
  } else {
    body.querySelector('h2 + p').innerHTML =
      'Each shift, up to three candidates apply at once &mdash; one each on ' +
      '<strong>LinkedOut</strong>, <strong>MailHub</strong>, and <strong>PingMe</strong>. Check every app every round.';
    body.querySelector('ul').innerHTML =
      '<li>Open LinkedOut, MailHub, and PingMe &mdash; each shows a different candidate.</li>' +
      '<li>Open the <strong>Case File</strong> &mdash; the only place to Approve or Deny, with full history.</li>' +
      '<li>Watch for typos, mismatched names, urgent demands, and suspicious links.</li>' +
      '<li>Clicking a suspicious link costs integrity, just like a wrong decision.</li>' +
      '<li>Integrity, Score, Case count, and Threat Level live at the top of the Case File.</li>' +
      '<li>Drag windows by their title bar, resize them from the bottom-right corner.</li>';
  }
}

/* ----------------------- STORY MODE FLOW ----------------------- */

function buildStoryDays() {
  const anchorIds = new Set(STORY_ANCHORS.map(a => a.id));
  const pool = Game.people.filter(p => !anchorIds.has(p.id));
  // Sort by difficulty with a random tiebreak: days escalate, but which same-tier
  // applicants land on which day varies every playthrough.
  const ranked = pool.map(p => ({ p, rk: p.difficulty + Math.random() * 0.999 }));
  ranked.sort((a, b) => a.rk - b.rk);
  const sorted = ranked.map(r => r.p);

  const anchorsPerDay = new Array(STORY_DAY_COUNT).fill(0);
  STORY_ANCHORS.forEach(a => { anchorsPerDay[a.day]++; });
  const target = Math.round(Game.people.length / STORY_DAY_COUNT); // ~20

  const days = [];
  let cursor = 0;
  for (let d = 0; d < STORY_DAY_COUNT; d++) {
    const take = Math.max(0, target - anchorsPerDay[d]);
    days.push(sorted.slice(cursor, cursor + take));
    cursor += take;
  }
  if (cursor < sorted.length) days[STORY_DAY_COUNT - 1].push(...sorted.slice(cursor));

  for (let d = 0; d < STORY_DAY_COUNT; d++) days[d] = shuffle(days[d]);

  STORY_ANCHORS.filter(a => !a.last).forEach(a => {
    const person = Game.people.find(p => p.id === a.id);
    if (!person) return;
    const arr = days[a.day];
    arr.splice(Math.floor(Math.random() * (arr.length + 1)), 0, person);
  });
  STORY_ANCHORS.filter(a => a.last).forEach(a => {
    const person = Game.people.find(p => p.id === a.id);
    if (person) days[a.day].push(person);
  });
  return days;
}

function showStoryBriefing(dayIndex, onDone) {
  const overlay = document.getElementById('story-briefing');
  const brief = STORY_DAY_BRIEFINGS[dayIndex];
  document.getElementById('story-briefing-title').textContent = brief.title;
  document.getElementById('story-briefing-body').textContent = brief.body;
  const dayEl = document.getElementById('story-briefing-day');
  if (dayEl) dayEl.textContent = 'NIGHT ' + (dayIndex + 1) + ' OF ' + STORY_DAY_COUNT;
  const mechEl = document.getElementById('story-briefing-mechanic');
  if (mechEl) {
    const m = STORY_NIGHT_MECHANICS[dayIndex];
    mechEl.textContent = m || '';
    mechEl.classList.toggle('hidden', !m);
  }
  overlay.classList.remove('hidden');
  const btn = document.getElementById('story-briefing-btn');
  const handler = () => {
    overlay.classList.add('hidden');
    btn.removeEventListener('click', handler);
    onDone();
  };
  btn.addEventListener('click', handler);
}

function showStoryReveal(text, onDone) {
  const overlay = document.getElementById('story-reveal');
  document.getElementById('story-reveal-body').textContent = text;
  overlay.classList.remove('hidden');
  const btn = document.getElementById('story-reveal-btn');
  const handler = () => {
    overlay.classList.add('hidden');
    btn.removeEventListener('click', handler);
    onDone();
  };
  btn.addEventListener('click', handler);
}

function startStoryDay(dayIndex) {
  if (Game.over) return;
  Game.storyDayIndex = dayIndex;
  Game.storyCardIndex = 0;
  Game.awaitingShiftEmail = false;
  Game.nightMistakes = 0;

  // Reveal and refresh the SecOps Console as new intel comes online.
  const secopsIcon = document.getElementById('icon-secops');
  if (secopsIcon && secopsUnlocked(SECOPS_DIRECTORY_NIGHT)) secopsIcon.classList.remove('hidden');
  renderSecops();
  if (nightHasNewIntel(dayIndex)) flagSecopsIntel();

  showStoryBriefing(dayIndex, renderStoryCard);
}

function renderStoryCard() {
  const day = Game.storyDays[Game.storyDayIndex] || [];
  const p = day[Game.storyCardIndex];
  Game.round = p ? [{ person: p, platform: null, decided: false }] : [];
  renderRound();
}

function advanceStoryCard() {
  const day = Game.storyDays[Game.storyDayIndex] || [];
  Game.storyCardIndex++;
  if (Game.health <= 0 || Game.storyCardIndex >= day.length) {
    endOfShift();
    return;
  }
  // Night 5: scripted live-intrusion interrupts before certain cards.
  if (Game.storyDayIndex === STORY_DAY_COUNT - 1 &&
      intrusionPointsForDay(day.length).includes(Game.storyCardIndex)) {
    triggerIntrusion(renderStoryCard);
    return;
  }
  renderStoryCard();
}

let intrusionTimerId = null;
function triggerIntrusion(onDone) {
  Game.intrusionActive = true;
  const scn = STORY_INTRUSIONS[Game.intrusionCount % STORY_INTRUSIONS.length];
  Game.intrusionCount++;

  const overlay = document.getElementById('intrusion-overlay');
  const promptEl = document.getElementById('intrusion-prompt');
  const optsEl = document.getElementById('intrusion-options');
  const resultEl = document.getElementById('intrusion-result');
  const timerEl = document.getElementById('intrusion-timer');

  promptEl.textContent = scn.prompt;
  resultEl.classList.add('hidden');
  resultEl.textContent = '';
  optsEl.innerHTML = '';

  let resolved = false;
  let timeLeft = 8;
  timerEl.textContent = String(timeLeft).padStart(2, '0');
  timerEl.classList.remove('intrusion-timer-low');

  const finish = (success) => {
    if (resolved) return;
    resolved = true;
    clearInterval(intrusionTimerId);
    optsEl.querySelectorAll('.intrusion-opt').forEach(b => { b.disabled = true; });
    triggerGlitch();
    if (!success) {
      Game.health -= 15;
      Game.securityIncidents++;
      updateFooter();
    }
    resultEl.textContent = success
      ? 'THREAT CONTAINED. The source is blocked.'
      : 'CONTAINMENT FAILED. They got a foothold and integrity took the hit.';
    resultEl.className = 'intrusion-result ' + (success ? 'ok' : 'bad');
    setTimeout(() => {
      overlay.classList.add('hidden');
      Game.intrusionActive = false;
      if (Game.health <= 0) { Game.health = 0; updateFooter(); endOfShift(); }
      else onDone();
    }, 1500);
  };

  shuffle([scn.malicious, ...scn.benign]).forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'intrusion-opt';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      if (resolved) return;
      if (opt === scn.malicious) { btn.classList.add('correct'); finish(true); }
      else { btn.classList.add('wrong'); finish(false); }
    });
    optsEl.appendChild(btn);
  });

  overlay.classList.remove('hidden');
  intrusionTimerId = setInterval(() => {
    timeLeft--;
    timerEl.textContent = String(Math.max(0, timeLeft)).padStart(2, '0');
    if (timeLeft <= 3) timerEl.classList.add('intrusion-timer-low');
    if (timeLeft <= 0) finish(false);
  }, 1000);
}

function endOfShift() {
  Game.awaitingShiftEmail = true;
  Game.round = [];
  renderRound();
  const email = buildBossShiftEmail(Game.storyDayIndex);
  deliverInboxMessage({
    from: STORY_BOSS.name + ' (' + STORY_BOSS.title + ')',
    address: STORY_BOSS.address,
    subject: email.subject,
    body: email.body,
    read: false,
    isBoss: true,
    isEnding: !!email.isEnding,
    outcome: email.outcome || null
  });
  showShiftEndNotification();
}

function advanceToNextDay() {
  Game.awaitingShiftEmail = false;
  if (Game.storyDayIndex + 1 >= STORY_DAY_COUNT) {
    // Safety net: should normally end on the finale card.
    endGame('good');
    return;
  }
  startStoryDay(Game.storyDayIndex + 1);
}

function triggerGlitch() {
  const desktop = document.getElementById('desktop-screen');
  desktop.classList.remove('glitch-flash');
  void desktop.offsetWidth;
  desktop.classList.add('glitch-flash');
  setTimeout(() => desktop.classList.remove('glitch-flash'), 500);
}

function spawnIntrusionPopup() {
  const layer = document.getElementById('intrusion-popup-layer');
  const popup = document.createElement('div');
  popup.className = 'intrusion-popup';
  popup.style.top = (10 + Math.random() * 55) + '%';
  popup.style.left = (10 + Math.random() * 55) + '%';
  popup.innerHTML =
    '<div class="intrusion-popup-title">⚠ SYSTEM ALERT</div>' +
    '<p>Unauthorized access detected on this session.</p>' +
    '<button class="intrusion-popup-close">DISMISS</button>';
  popup.querySelector('.intrusion-popup-close').addEventListener('click', () => popup.remove());
  layer.appendChild(popup);
}

function glitchWindowsTemporarily(durationMs) {
  document.querySelectorAll('.window').forEach(w => w.classList.add('window-glitched'));
  setTimeout(() => {
    document.querySelectorAll('.window').forEach(w => w.classList.remove('window-glitched'));
  }, durationMs);
}

function triggerStoryFakeGlitch(difficulty) {
  triggerGlitch();
  if (difficulty >= 5) {
    spawnIntrusionPopup();
    spawnIntrusionPopup();
    spawnIntrusionPopup();
    glitchWindowsTemporarily(5000);
  } else if (difficulty >= 3) {
    spawnIntrusionPopup();
    spawnIntrusionPopup();
  }
}

function triggerMegaGlitchAndCrash(onComplete) {
  const desktop = document.getElementById('desktop-screen');
  desktop.classList.add('mega-glitch');
  setTimeout(() => {
    desktop.classList.remove('mega-glitch');
    const crash = document.getElementById('crash-overlay');
    crash.classList.remove('hidden');
    setTimeout(() => {
      crash.classList.add('hidden');
      onComplete();
    }, 1800);
  }, 900);
}

/* ----------------------- MAILHUB INBOX ----------------------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function unreadBossCount() {
  return Game.inbox.filter(m => m.isBoss && !m.read).length;
}

function updateMailBadge() {
  const n = unreadBossCount();
  const iconBadge = document.querySelector('.desktop-icon[data-window="email"] .icon-badge');
  if (iconBadge) { iconBadge.textContent = n; iconBadge.classList.toggle('hidden', n === 0); }
  const folderBadge = document.getElementById('inbox-folder-badge');
  if (folderBadge) { folderBadge.textContent = n; folderBadge.classList.toggle('hidden', n === 0); }
}

function deliverInboxMessage(msg) {
  Game.inbox.unshift(msg);
  renderInbox();
  updateMailBadge();
}

function renderInbox() {
  const list = document.getElementById('email-inbox-list');
  if (!list) return;
  list.innerHTML = '';
  Game.inbox.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'email-inbox-row' + (m.read ? '' : ' unread');
    row.innerHTML =
      '<div class="email-inbox-sender">' + (m.read ? '' : '<span class="unread-dot"></span>') +
        escapeHtml(m.from) + '</div>' +
      '<div class="email-inbox-subject">' + escapeHtml(m.subject) + '</div>';
    row.addEventListener('click', () => openBossMessage(i));
    list.appendChild(row);
  });
  const p = Game.round[0] && Game.round[0].person;
  if (p && p.email) {
    const row = document.createElement('div');
    row.className = 'email-inbox-row email-inbox-applicant';
    row.innerHTML =
      '<div class="email-inbox-sender">' + escapeHtml(p.email.senderName) + '</div>' +
      '<div class="email-inbox-subject">' + escapeHtml(p.email.subject) + '</div>';
    row.addEventListener('click', showApplicantEmailPane);
    list.appendChild(row);
  }
}

function showApplicantEmailPane() {
  const boss = document.getElementById('email-boss-content');
  if (boss) boss.classList.add('hidden');
  const p = Game.round[0] && Game.round[0].person;
  document.getElementById('email-empty').classList.toggle('hidden', !!(p && p.email));
  document.getElementById('email-content').classList.toggle('hidden', !(p && p.email));
}

function openBossMessage(index) {
  const m = Game.inbox[index];
  if (!m) return;
  const wasUnread = !m.read;
  m.read = true;
  updateMailBadge();
  renderInbox();
  document.getElementById('email-empty').classList.add('hidden');
  document.getElementById('email-content').classList.add('hidden');
  const boss = document.getElementById('email-boss-content');
  boss.classList.remove('hidden');
  document.getElementById('boss-msg-subject').textContent = m.subject;
  document.getElementById('boss-msg-from').textContent = m.from;
  document.getElementById('boss-msg-address').textContent = m.address || '';
  document.getElementById('boss-msg-body').textContent = m.body;
  const action = document.getElementById('boss-msg-action');
  const isPending = Game.awaitingShiftEmail && index === 0 && m.isBoss;
  if (isPending) {
    action.classList.remove('hidden');
    action.textContent = m.isEnding ? 'Acknowledge' : 'Clock out and start next shift';
    action.onclick = () => {
      action.classList.add('hidden');
      action.onclick = null;
      Game.awaitingShiftEmail = false;
      document.getElementById('boss-notification-layer').innerHTML = '';
      if (m.isEnding) endGame(m.outcome);
      else advanceToNextDay();
    };
  } else {
    action.classList.add('hidden');
    action.onclick = null;
  }
}

function showShiftEndNotification() {
  const layer = document.getElementById('boss-notification-layer');
  layer.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'boss-notification boss-notification-shiftend';
  note.innerHTML =
    '<span class="boss-notification-title">✉ New message - ' + escapeHtml(STORY_BOSS.name) + '</span>' +
    '<span>End of shift. You have an unread message in MailHub. Read it to clock out.</span>' +
    '<span class="boss-notification-hint">Click here to open your inbox</span>';
  note.addEventListener('click', () => {
    openWindow('email');
    const unreadIdx = Game.inbox.findIndex(m => m.isBoss && !m.read);
    if (unreadIdx !== -1) openBossMessage(unreadIdx);
  });
  layer.appendChild(note);
}

/* ----------------------- SECOPS CONSOLE ----------------------- */

function secopsUnlocked(night) {
  return Game.storyMode && Game.storyDayIndex >= night;
}

function newestUnlockedSecops() {
  if (secopsUnlocked(SECOPS_DIRECTIVE_NIGHT)) return 'directive';
  if (secopsUnlocked(SECOPS_BULLETIN_NIGHT)) return 'bulletin';
  return 'directory';
}

function nightHasNewIntel(dayIndex) {
  return dayIndex === SECOPS_DIRECTORY_NIGHT ||
         dayIndex === SECOPS_BULLETIN_NIGHT ||
         dayIndex === SECOPS_DIRECTIVE_NIGHT;
}

function setSecopsActive(sec) {
  document.querySelectorAll('.secops-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  document.querySelectorAll('.secops-page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('secops-page-' + sec);
  if (page) page.classList.add('active');
}

function setupSecopsNav() {
  document.querySelectorAll('.secops-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => setSecopsActive(btn.dataset.sec));
  });
}

function renderSecops() {
  const dirEl = document.getElementById('secops-directive');
  if (!dirEl) return;
  if (secopsUnlocked(SECOPS_DIRECTIVE_NIGHT)) {
    dirEl.innerHTML =
      '<div class="secops-directive-box">' +
        '<div class="secops-directive-title">' + escapeHtml(STORY_DIRECTIVE.title) + '</div>' +
        '<div class="secops-directive-rule">' + escapeHtml(STORY_DIRECTIVE.rule) + '</div>' +
      '</div>';
  } else {
    dirEl.innerHTML = '<div class="secops-locked">No active directive.<br>Command issues directives as the incident develops.</div>';
  }

  const directoryEl = document.getElementById('secops-directory');
  if (secopsUnlocked(SECOPS_DIRECTORY_NIGHT)) {
    let h = '<div class="secops-dir-note">' + escapeHtml(STORY_DIRECTORY.domainNote) + '</div>';
    h += '<div class="secops-dir-domain">' + escapeHtml(STORY_DIRECTORY.domain) + '</div>';
    h += '<div class="secops-emp-title" style="font-size:12px;color:#fff;font-weight:bold;margin:6px 0 8px">Verified Internal Staff</div>';
    STORY_DIRECTORY.employees.forEach(e => {
      h += '<div class="secops-emp-row">' +
        '<span class="secops-emp-name">' + escapeHtml(e.name) + '</span>' +
        '<span class="secops-emp-meta">' + escapeHtml(e.dept) + '</span>' +
        '<span class="secops-emp-meta">' + escapeHtml(e.email) + '</span></div>';
    });
    h += '<div class="secops-dir-note" style="margin-top:10px">' + escapeHtml(STORY_DIRECTORY.externalNote) + '</div>';
    directoryEl.innerHTML = h;
  } else {
    directoryEl.innerHTML = '<div class="secops-locked">Directory access pending.<br>Cleared for use from Night 2.</div>';
  }

  const bulletinEl = document.getElementById('secops-bulletin');
  if (secopsUnlocked(SECOPS_BULLETIN_NIGHT)) {
    const items = bulletinItemsForNight(Game.storyDayIndex);
    bulletinEl.innerHTML = items.map(it =>
      '<div class="secops-bulletin-item">' +
        '<span class="secops-bulletin-kind">' + escapeHtml(it.kind) + '</span>' +
        '<div class="secops-bulletin-value">' + escapeHtml(it.value) + '</div>' +
        '<div class="secops-bulletin-note">' + escapeHtml(it.note) + '</div>' +
      '</div>').join('');
  } else {
    bulletinEl.innerHTML = '<div class="secops-locked">No threat intel yet.<br>The SOC publishes the bulletin from Night 3.</div>';
  }
}

function updateSecopsBadge() {
  const badge = document.getElementById('secops-icon-badge');
  if (badge) badge.classList.toggle('hidden', !Game.secopsUnread);
}

function markSecopsRead() {
  Game.secopsUnread = false;
  updateSecopsBadge();
  const icon = document.querySelector('.desktop-icon[data-window="secops"]');
  if (icon) icon.classList.remove('intel-alert');
  setSecopsActive(newestUnlockedSecops());
}

function flagSecopsIntel() {
  Game.secopsUnread = true;
  updateSecopsBadge();
  const icon = document.querySelector('.desktop-icon[data-window="secops"]');
  if (icon) { icon.classList.remove('intel-alert'); void icon.offsetWidth; icon.classList.add('intel-alert'); }
}

// Does this applicant match a currently-published Threat Bulletin indicator?
function matchesBulletin(person) {
  if (!secopsUnlocked(SECOPS_BULLETIN_NIGHT)) return false;
  const addr = ((person.email && person.email.senderAddress) || '').toLowerCase();
  const text = ((person.text && person.text.body) || '').toLowerCase();
  const name = (person.name || '').toLowerCase();
  if (addr.includes('aegisdynarnics.com')) return true;
  if (addr.includes('aegis-dynamics.com') || addr.includes('aegisdynamics-hr.com')) return true;
  if (addr.endsWith('.ru') || text.includes('zyan.roch.helper') || text.includes('@mail.ru')) return true;
  if (name.includes('zyan roch')) return true;
  return false;
}

function isCleanRecord() {
  return Game.securityIncidents === 0 && Game.policyViolations === 0 && Game.storyWrongfulDenials <= 2;
}

function finishStoryZyan(approved) {
  if (approved) {
    const outcome = Game.securityIncidents >= 4 ? 'catastrophicBreach' : 'breach';
    triggerMegaGlitchAndCrash(() => {
      showStoryReveal(STORY_FINALE_REVEAL.approved, () => endGame(outcome));
    });
  } else {
    const outcome = isCleanRecord() ? 'commendation' : 'good';
    showStoryReveal(STORY_FINALE_REVEAL.denied, () => endGame(outcome));
  }
}

/* ----------------------- ROUND / APPLICANT SELECTION ----------------------- */

function pickNextFromPool() {
  if (Game.pool.length === 0) return null;
  let candidates = Game.pool.filter(p => p.difficulty === Game.difficulty);
  if (candidates.length === 0) {
    const sorted = Game.pool.slice().sort((a, b) =>
      Math.abs(a.difficulty - Game.difficulty) - Math.abs(b.difficulty - Game.difficulty));
    candidates = [sorted[0]];
  }
  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  Game.pool = Game.pool.filter(p => p !== choice);
  return choice;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextRound() {
  if (Game.over) return;
  const picked = [];
  for (let i = 0; i < APPLICANTS_PER_ROUND; i++) {
    const p = pickNextFromPool();
    if (!p) break;
    picked.push(p);
  }
  if (picked.length === 0) {
    endGame(true);
    return;
  }
  const platforms = APPLICANTS_PER_ROUND === 1 ? [null] : shuffle(PLATFORMS).slice(0, picked.length);
  Game.round = picked.map((p, i) => ({ person: p, platform: platforms[i], decided: false }));
  renderRound();
}

/* ----------------------- RENDERING ----------------------- */

function findRoundEntry(platform) {
  return Game.round.find(r => r.platform === platform);
}

function renderRound() {
  if (APPLICANTS_PER_ROUND === 1) {
    const p = Game.round[0] ? Game.round[0].person : null;
    renderLinkedinWindow(p);
    renderEmailWindow(p);
    renderTextWindow(p);
  } else {
    renderLinkedinWindow(findRoundEntry('linkedin') ? findRoundEntry('linkedin').person : null);
    renderEmailWindow(findRoundEntry('email') ? findRoundEntry('email').person : null);
    renderTextWindow(findRoundEntry('text') ? findRoundEntry('text').person : null);
  }
  renderApplicationRound();
}

function renderLinkedinWindow(p) {
  const emptyEl = document.getElementById('li-empty');
  const contentEl = document.getElementById('li-content');
  if (!p) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  setImgWithFallback(document.getElementById('li-pfp'), p.pfp, p.name);
  document.getElementById('li-pfp').style.transform = `scale(${p.pfpScale})`;
  document.getElementById('li-name').textContent = p.name;
  document.getElementById('li-headline').textContent = p.li.headline || ' ';
  document.getElementById('li-location').textContent = p.li.location || ' ';
  document.getElementById('li-mutuals').textContent = p.li.mutuals !== '' ? `${p.li.mutuals} mutual connections` : ' ';
  document.getElementById('li-gender').textContent = p.gender || '-';
  document.getElementById('li-age').textContent = p.age || '-';
  document.getElementById('li-job').textContent = p.job || '-';
  document.getElementById('li-bio').textContent = p.li.bio || ' ';
  const expList = document.getElementById('li-experience');
  expList.innerHTML = '';
  p.li.experience.forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    expList.appendChild(li);
  });
  document.getElementById('li-education').textContent = p.li.education || ' ';
}

function renderEmailWindow(p) {
  const emptyEl = document.getElementById('email-empty');
  const contentEl = document.getElementById('email-content');
  const bossEl = document.getElementById('email-boss-content');
  if (bossEl) bossEl.classList.add('hidden');
  if (!p || !p.email) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    renderInbox();
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  document.getElementById('email-subject').textContent = p.email.subject;
  document.getElementById('email-sender-name').textContent = p.email.senderName;
  document.getElementById('email-sender-address').textContent = p.email.senderAddress;
  document.getElementById('email-applicant-line').textContent = `Applicant age: ${p.age || '-'} | Gender: ${p.gender || '-'}`;
  document.getElementById('email-body-text').textContent = p.email.body;
  renderInbox();
}

function renderTextWindow(p) {
  const emptyEl = document.getElementById('text-empty');
  const contentEl = document.getElementById('text-content');
  if (!p || !p.text) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  setImgWithFallback(document.getElementById('text-pfp'), p.pfp, p.name);
  document.getElementById('text-contact-name').textContent = p.text.sender;
  document.getElementById('text-applicant-line').textContent = `Age: ${p.age || '-'} | ${p.job || 'Unknown role'}`;
  const thread = document.getElementById('phone-thread');
  thread.innerHTML = '';
  const bubble = document.createElement('div');
  bubble.className = 'bubble-in';
  bubble.textContent = p.text.body;
  thread.appendChild(bubble);
  if (p.text.link) {
    const linkBubble = document.createElement('div');
    linkBubble.className = 'bubble-link';
    linkBubble.textContent = p.text.link;
    linkBubble.addEventListener('click', () => handleScamLinkClick(p, linkBubble));
    thread.appendChild(linkBubble);
  }
}

function renderApplicationRound() {
  const wrap = document.getElementById('app-candidates');
  wrap.innerHTML = '';
  if (Game.round.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'app-history-empty';
    empty.textContent = 'No active candidates.';
    wrap.appendChild(empty);
    return;
  }
  Game.round.forEach(entry => {
    const p = entry.person;
    const card = document.createElement('div');
    card.className = 'app-candidate-card' + (entry.decided ? ' decided' : '');

    const img = document.createElement('img');
    setImgWithFallback(img, p.pfp, p.name);
    card.appendChild(img);

    const info = document.createElement('div');
    info.className = 'app-candidate-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'app-candidate-name';
    nameEl.textContent = p.name;
    const platformEl = document.createElement('div');
    platformEl.className = 'app-candidate-platform';
    platformEl.textContent = entry.platform
      ? `Appeared on: ${PLATFORM_LABELS[entry.platform]} | Applying for: ${p.job || 'Unknown role'}`
      : `Applying for: ${p.job || 'Unknown role'}`;
    info.appendChild(nameEl);
    info.appendChild(platformEl);
    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'app-candidate-actions';
    const denyBtn = document.createElement('button');
    denyBtn.className = 'app-btn app-btn-deny';
    denyBtn.textContent = p.denyLabel;
    denyBtn.disabled = entry.decided;
    denyBtn.addEventListener('click', () => decideEntry(entry, false));
    const approveBtn = document.createElement('button');
    approveBtn.className = 'app-btn app-btn-approve';
    approveBtn.textContent = p.approveLabel;
    approveBtn.disabled = entry.decided;
    approveBtn.addEventListener('click', () => decideEntry(entry, true));
    actions.appendChild(denyBtn);
    actions.appendChild(approveBtn);
    card.appendChild(actions);

    wrap.appendChild(card);
  });
}

function renderArtifactPreview(container, kind, person) {
  container.innerHTML = '';
  container.classList.remove('hidden');
  if (kind === 'linkedin') {
    const name = document.createElement('div');
    name.innerHTML = `<strong>${person.name}</strong> — ${person.li.headline || ''}`;
    const meta = document.createElement('div');
    meta.textContent = `${person.li.company || ''} · ${person.li.location || ''}`;
    const bio = document.createElement('p');
    bio.textContent = person.li.bio || '';
    const exp = document.createElement('ul');
    person.li.experience.forEach(line => {
      const li = document.createElement('li');
      li.textContent = line;
      exp.appendChild(li);
    });
    const edu = document.createElement('div');
    edu.textContent = person.li.education || '';
    container.append(name, meta, bio, exp, edu);
  } else if (kind === 'email') {
    if (!person.email) { container.textContent = 'No email on file.'; return; }
    const subject = document.createElement('div');
    subject.innerHTML = `<strong>${person.email.subject}</strong>`;
    const from = document.createElement('div');
    from.textContent = `From: ${person.email.senderName} <${person.email.senderAddress}>`;
    const body = document.createElement('pre');
    body.textContent = person.email.body;
    container.append(subject, from, body);
  } else if (kind === 'text') {
    if (!person.text) { container.textContent = 'No text on file.'; return; }
    const from = document.createElement('div');
    from.innerHTML = `<strong>${person.text.sender}</strong>`;
    const body = document.createElement('p');
    body.textContent = person.text.body;
    container.append(from, body);
    if (person.text.link) {
      const link = document.createElement('div');
      link.className = 'artifact-link';
      link.textContent = person.text.link;
      container.appendChild(link);
    }
  }
}

function renderHistoryList(el, revealCorrectness) {
  el.innerHTML = '';
  if (Game.history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'app-history-empty';
    empty.textContent = 'No decisions yet this shift.';
    el.appendChild(empty);
    return;
  }
  Game.history.forEach(h => {
    const row = document.createElement('div');
    row.className = 'app-history-row';
    const left = document.createElement('span');
    left.textContent = `${h.name} — ${h.decisionLabel}`;
    row.appendChild(left);
    if (revealCorrectness) {
      const right = document.createElement('span');
      right.className = h.correct ? 'hist-correct' : 'hist-wrong';
      right.textContent = h.correct ? 'CORRECT' : 'WRONG';
      row.appendChild(right);
    }
    el.appendChild(row);

    if (h.directiveFreeze) {
      const note = document.createElement('div');
      note.className = 'app-history-details';
      note.style.borderLeftColor = '#c0392b';
      note.style.background = '#fdecea';
      note.style.color = '#7a2018';
      note.textContent = 'Engineering Freeze was in effect: this engineering role had to be denied tonight regardless of legitimacy.';
      el.appendChild(note);
    }

    if (h.isFake && FAKE_REASONS[h.id]) {
      const details = document.createElement('details');
      details.className = 'app-history-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Why was this flagged?';
      const reason = document.createElement('p');
      reason.textContent = FAKE_REASONS[h.id];
      details.appendChild(summary);
      details.appendChild(reason);

      const btnRow = document.createElement('div');
      btnRow.className = 'history-artifact-btns';
      const preview = document.createElement('div');
      preview.className = 'history-artifact-preview hidden';
      [['linkedin', 'LinkedIn'], ['email', 'Email'], ['text', 'Text']].forEach(([kind, label]) => {
        const btn = document.createElement('button');
        btn.className = 'history-artifact-btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
          const person = Game.people.find(pp => pp.id === h.id);
          if (person) renderArtifactPreview(preview, kind, person);
        });
        btnRow.appendChild(btn);
      });
      details.appendChild(btnRow);
      details.appendChild(preview);
      el.appendChild(details);
    }
  });
}

function renderHistory() {
  renderHistoryList(document.getElementById('app-history'), !Game.storyMode);
}

function renderDebrief() {
  renderHistoryList(document.getElementById('debrief-history'), true);
}

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveHighScore(entry) {
  const scores = loadHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, MAX_HIGH_SCORES);
  try {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(top));
  } catch (err) { /* localStorage unavailable */ }
  return top;
}

function renderHighScores() {
  const el = document.getElementById('app-highscores');
  el.innerHTML = '';
  const scores = loadHighScores();
  if (scores.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'app-history-empty';
    empty.textContent = 'No high scores yet.';
    el.appendChild(empty);
    return;
  }
  scores.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'app-highscore-row';
    const rank = document.createElement('span');
    rank.className = 'app-highscore-rank';
    rank.textContent = `#${i + 1}`;
    const score = document.createElement('span');
    score.className = 'app-highscore-score';
    score.textContent = `${s.score} pts`;
    const meta = document.createElement('span');
    meta.className = 'app-highscore-meta';
    meta.textContent = `${s.correct}/${s.total} correct · Threat ${s.peakDifficulty} · ${s.date}`;
    row.appendChild(rank);
    row.appendChild(score);
    row.appendChild(meta);
    el.appendChild(row);
  });
}

/* ----------------------- FOOTER STATS ----------------------- */

function updateFooter() {
  const fill = document.getElementById('health-fill');
  fill.style.width = Math.max(0, Game.health) + '%';
  fill.classList.remove('warn', 'danger');
  if (Game.health <= 25) fill.classList.add('danger');
  else if (Game.health <= 55) fill.classList.add('warn');

  document.getElementById('health-value').textContent = Math.max(0, Math.round(Game.health)) + '%';
  document.getElementById('case-count').textContent = `${Game.caseNumber} / ${Game.totalCases}`;
  document.getElementById('difficulty-value').textContent = Game.difficulty;
  document.getElementById('score-value').textContent = Game.score;
  const rating = Game.caseNumber > 0 ? Math.round((Game.correctCount / Game.caseNumber) * 100) : 100;
  document.getElementById('approval-rating').textContent = rating + '%';
}

/* ----------------------- DECISIONS ----------------------- */

function decideEntry(entry, approved) {
  if (Game.over || entry.decided) return;
  entry.decided = true;
  const p = entry.person;
  // Correctness accounts for the active CISO directive (e.g. engineering freeze).
  const correct = Game.storyMode
    ? (approved === approveIsCorrect(p))
    : (approved ? !p.isFake : p.isFake);
  Game.caseNumber++;

  if (correct) {
    Game.score += 10 * p.difficulty;
    Game.correctCount++;
    if (!Game.storyMode) {
      if (approved && !p.isFake) {
        Game.health = Math.min(100, Game.health + 1);
      }
      Game.streak++;
      if (Game.streak >= 2) {
        Game.difficulty = Math.min(5, Game.difficulty + 1);
        Game.streak = 0;
      }
      showToast(true, approved
        ? `Correct - ${p.name} was a legitimate hire.`
        : `Correct - ${p.name} was flagged and denied.`);
    }
  } else if (!Game.storyMode) {
    const damage = 8 + p.difficulty * 4;
    Game.health -= damage;
    Game.streak = 0;
    Game.difficulty = Math.max(1, Game.difficulty - 1);
    showToast(false, approved
      ? `Mistake! ${p.name} was a fraudulent applicant. -${damage}% integrity.`
      : `Mistake! ${p.name} was a real hire, wrongly denied. -${damage}% integrity.`);
  } else if (approved) {
    // Story mode, approved someone who should have been denied.
    const onBulletin = p.isFake && matchesBulletin(p);
    if (p.isFake) {
      Game.securityIncidents++;
      if (p.id !== STORY_ZYAN_ID) triggerStoryFakeGlitch(onBulletin ? 5 : p.difficulty);
    } else {
      // Approved a real applicant you were ordered to deny (directive violation).
      Game.policyViolations++;
      triggerGlitch();
    }
    // Integrity damage modulated by the per-night free-mistake buffer.
    // A known, blocklisted threat never gets a free pass.
    Game.nightMistakes++;
    const allowance = MISTAKE_ALLOWANCE_BY_NIGHT[Game.storyDayIndex] || 0;
    const free = !onBulletin && Game.nightMistakes <= allowance;
    if (!free) {
      let damage = 8 + p.difficulty * 4;
      if (onBulletin) damage += 12;
      Game.health -= damage;
    }
  } else {
    // Story mode, denied someone who should have been approved: wrongful-denial track.
    Game.storyWrongfulDenials++;
  }
  Game.peakDifficulty = Math.max(Game.peakDifficulty, Game.difficulty);
  Game.history.unshift({
    name: p.name,
    decisionLabel: approved ? p.approveLabel : p.denyLabel,
    correct,
    id: p.id,
    isFake: p.isFake,
    directiveFreeze: Game.storyMode && directiveActive() && STORY_DIRECTIVE.appliesTo(p) && !p.isFake
  });

  updateFooter();
  renderApplicationRound();
  renderHistory();

  if (Game.storyMode) {
    if (p.id === STORY_ZYAN_ID) {
      setTimeout(() => finishStoryZyan(approved), 900);
    } else {
      // No mid-shift firing or termination: consequences arrive in the
      // end-of-shift email, which the player must read to clock out.
      setTimeout(advanceStoryCard, 900);
    }
    return;
  }

  if (Game.health <= 0) {
    Game.health = 0;
    updateFooter();
    setTimeout(() => endGame(false), 900);
    return;
  }
  if (Game.round.every(r => r.decided)) {
    setTimeout(nextRound, 900);
  }
}

function handleScamLinkClick(p, linkEl) {
  if (Game.over) return;
  if (Game.linkClicked.has(p.id)) return;
  Game.linkClicked.add(p.id);
  linkEl.classList.add('clicked');
  const damage = 10 + p.difficulty * 3;
  Game.health -= damage;
  updateFooter();
  if (Game.storyMode) triggerGlitch();
  showToast(false, `You clicked a suspicious link from ${p.name}! -${damage}% integrity.`);
  if (Game.health <= 0) {
    Game.health = 0;
    updateFooter();
    // In story mode, zero integrity is delivered as a termination email at the
    // end of the shift rather than ending the game mid-card.
    if (!Game.storyMode) setTimeout(() => endGame(false), 900);
  }
}

function showToast(isCorrect, message) {
  const toast = document.getElementById('feedback-toast');
  toast.textContent = message;
  toast.className = isCorrect ? 'correct' : 'wrong';
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 1700);
}

/* ----------------------- END GAME ----------------------- */

function endGame(outcome) {
  Game.over = true;
  if (Game.shakeWatcherId) clearInterval(Game.shakeWatcherId);
  document.getElementById('desktop-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.remove('hidden');

  if (Game.storyMode) {
    const ending = STORY_ENDINGS[outcome] || STORY_ENDINGS.good;
    const isBreach = outcome === 'breach' || outcome === 'catastrophicBreach';
    document.getElementById('end-screen').classList.toggle('breach-glitch', isBreach);
    document.getElementById('end-title').textContent = ending.title;
    document.getElementById('end-subtitle').textContent = ending.subtitle;
  } else {
    document.getElementById('end-title').textContent = outcome ? 'SHIFT COMPLETE' : 'TERMINATED';
    document.getElementById('end-subtitle').textContent = outcome
      ? 'You reviewed every applicant before integrity ran out.'
      : 'Company integrity reached zero. You have been relieved of duty.';
  }
  document.getElementById('end-score').textContent = Game.score;
  document.getElementById('end-correct').textContent = `${Game.correctCount} / ${Game.caseNumber}`;
  document.getElementById('end-difficulty').textContent = Game.peakDifficulty;

  if (!Game.storyMode) {
    saveHighScore({
      score: Game.score,
      correct: Game.correctCount,
      total: Game.caseNumber,
      peakDifficulty: Game.peakDifficulty,
      date: new Date().toLocaleDateString()
    });
    renderHighScores();
  }
}

function restartGame() {
  document.getElementById('end-screen').classList.add('hidden');
  startGame(Game.storyMode);
}

function logout() {
  Game.over = true;
  if (Game.shakeWatcherId) clearInterval(Game.shakeWatcherId);
  document.getElementById('desktop-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('debrief-overlay').classList.add('hidden');
  document.getElementById('story-briefing').classList.add('hidden');
  document.getElementById('story-reveal').classList.add('hidden');
  document.getElementById('crash-overlay').classList.add('hidden');
  document.getElementById('login-status').textContent = 'Status: Awaiting credentials...';
  document.getElementById('login-screen').classList.remove('hidden');
  runBootLog();
}

/* ----------------------- SHAKE REMINDER ----------------------- */

function triggerShake(icon) {
  icon.classList.remove('shake');
  void icon.offsetWidth;
  icon.classList.add('shake');
}

function markAppOpened(name) {
  if (!REQUIRED_APPS.includes(name)) return;
  const icon = document.querySelector(`.desktop-icon[data-window="${name}"]`);
  if (icon) icon.classList.remove('shake');
}

function isAppOpenVisible(name) {
  const win = document.getElementById(`window-${name}`);
  return !!win && !win.classList.contains('hidden') && !win.classList.contains('minimized');
}

const SHAKE_INTERVAL_MIN = 1500;
const SHAKE_INTERVAL_MAX = 2500;

function scheduleNextShake(name, fromNow) {
  if (fromNow) {
    // Stratify the first wave so icons never all start in lockstep, even with few apps.
    const idx = REQUIRED_APPS.indexOf(name);
    const slice = SHAKE_INTERVAL_MAX / REQUIRED_APPS.length;
    Game.shakeTimers[name] = Date.now() + idx * slice + Math.random() * slice;
  } else {
    Game.shakeTimers[name] = Date.now() + SHAKE_INTERVAL_MIN + Math.random() * (SHAKE_INTERVAL_MAX - SHAKE_INTERVAL_MIN);
  }
}

function checkShakes() {
  if (Game.over) return;
  const now = Date.now();
  REQUIRED_APPS.forEach(name => {
    if (isAppOpenVisible(name)) return;
    if (Game.shakeTimers[name] == null || now >= Game.shakeTimers[name]) {
      const icon = document.querySelector(`.desktop-icon[data-window="${name}"]`);
      if (icon) triggerShake(icon);
      scheduleNextShake(name, false);
    }
  });
}

function startShakeWatcher() {
  if (Game.shakeWatcherId) clearInterval(Game.shakeWatcherId);
  Game.shakeTimers = {};
  REQUIRED_APPS.forEach(name => scheduleNextShake(name, true));
  Game.shakeWatcherId = setInterval(checkShakes, 200);
}

/* ----------------------- WINDOW MANAGEMENT ----------------------- */

function bringToFront(win) {
  document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
  win.classList.add('focused');
  Game.topZIndex += 1;
  // Keep the counter from creeping into the notification/overlay layers over a long
  // session: renormalize window z-indexes while preserving their stacking order.
  if (Game.topZIndex > 200) {
    const wins = [...document.querySelectorAll('.window')]
      .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
    let z = 31;
    wins.forEach(w => { if (w !== win) w.style.zIndex = z++; });
    Game.topZIndex = z;
  }
  win.style.zIndex = Game.topZIndex;
  Game.focusedWindow = win.dataset.window;
  syncTaskbar();
}

function openWindow(name) {
  const win = document.getElementById(`window-${name}`);
  win.classList.remove('minimized');
  win.classList.remove('hidden');
  Game.openWindows.add(name);
  markAppOpened(name);
  if (name === 'secops') markSecopsRead();
  bringToFront(win);
}

function closeWindow(name) {
  const win = document.getElementById(`window-${name}`);
  win.classList.add('hidden');
  Game.openWindows.delete(name);
  syncTaskbar();
}

function minimizeWindow(name) {
  const win = document.getElementById(`window-${name}`);
  win.classList.add('minimized');
  syncTaskbar();
}

function syncTaskbar() {
  const bar = document.getElementById('taskbar-windows');
  bar.innerHTML = '';
  Game.openWindows.forEach(name => {
    const win = document.getElementById(`window-${name}`);
    const btn = document.createElement('button');
    btn.className = 'taskbar-item' + (Game.focusedWindow === name && !win.classList.contains('minimized') ? ' active' : '');
    btn.textContent = win.querySelector('.window-title').textContent.trim();
    btn.addEventListener('click', () => {
      if (win.classList.contains('minimized')) {
        win.classList.remove('minimized');
        markAppOpened(name);
        bringToFront(win);
      } else if (Game.focusedWindow === name) {
        minimizeWindow(name);
      } else {
        bringToFront(win);
      }
    });
    bar.appendChild(btn);
  });
}

function setupWindows() {
  document.querySelectorAll('.window').forEach(win => {
    win.classList.add('hidden');
    win.addEventListener('mousedown', () => bringToFront(win));

    win.querySelector('[data-action="close"]').addEventListener('click', (e) => {
      e.stopPropagation();
      closeWindow(win.dataset.window);
    });
    win.querySelector('[data-action="minimize"]').addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeWindow(win.dataset.window);
    });

    const handle = win.querySelector('[data-drag-handle]');
    let dragging = false, offsetX = 0, offsetY = 0;
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      const rect = win.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handle.style.cursor = 'grabbing';
      bringToFront(win);
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const desktop = document.getElementById('desktop-screen').getBoundingClientRect();
      let x = e.clientX - offsetX - desktop.left;
      let y = e.clientY - offsetY - desktop.top;
      x = Math.max(0, Math.min(x, desktop.width - 80));
      y = Math.max(0, Math.min(y, desktop.height - 40));
      win.style.left = x + 'px';
      win.style.top = y + 'px';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      handle.style.cursor = 'grab';
    });
  });

  document.querySelectorAll('.desktop-icon').forEach(icon => {
    icon.addEventListener('click', () => openWindow(icon.dataset.window));
  });
}

function centerWindow(win) {
  const desktop = document.getElementById('desktop-screen').getBoundingClientRect();
  const w = win.offsetWidth, h = win.offsetHeight;
  win.style.left = Math.max(0, (desktop.width - w) / 2) + 'px';
  win.style.top = Math.max(0, (desktop.height - h) / 2) + 'px';
}

function setupAppNav() {
  const navBtns = document.querySelectorAll('.app-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`app-page-${btn.dataset.page}`).classList.add('active');
      if (btn.dataset.page === 'highscores') renderHighScores();
    });
  });
}

/* ----------------------- CLOCK ----------------------- */

function startClock() {
  function tick() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    document.getElementById('taskbar-clock').textContent = `${h}:${m} ${ampm}`;
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    document.getElementById('taskbar-date').textContent = `${mm}/${dd}/${yyyy}`;
  }
  tick();
  setInterval(tick, 1000 * 30);
}

/* ----------------------- BOOTSTRAP ----------------------- */

function requestFullscreenSafe() {
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (request) request.call(el).catch(() => {});
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exit) exit.call(document).catch(() => {});
  } else {
    requestFullscreenSafe();
  }
}

function setupFullscreenPrompt() {
  const prompt = document.getElementById('fullscreen-prompt');
  const dismiss = () => prompt.classList.add('hidden');
  document.getElementById('fullscreen-enter-btn').addEventListener('click', () => {
    requestFullscreenSafe();
    dismiss();
  });
  document.getElementById('fullscreen-skip-btn').addEventListener('click', dismiss);
}

document.addEventListener('DOMContentLoaded', async () => {
  setupFullscreenPrompt();
  setupLogin();
  setupWindows();
  setupAppNav();
  setupSecopsNav();
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('taskbar-fullscreen-btn').addEventListener('click', toggleFullscreen);
  document.getElementById('taskbar-logout-btn').addEventListener('click', logout);
  document.getElementById('view-history-btn').addEventListener('click', () => {
    renderDebrief();
    document.getElementById('debrief-overlay').classList.remove('hidden');
  });
  document.getElementById('debrief-close-btn').addEventListener('click', () => {
    document.getElementById('debrief-overlay').classList.add('hidden');
  });

  try {
    Game.people = await loadPeople();
  } catch (err) {
    console.error('Failed to load applicant data:', err);
    document.getElementById('login-status').textContent =
      'Status: ERROR loading data/people.csv (run via a local server, not file://)';
  }
});
