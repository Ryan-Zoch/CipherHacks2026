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
  shakeWatcherId: null
};

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
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = 'Status: Authenticating...';
    setTimeout(() => {
      status.textContent = 'Status: Access granted.';
      setTimeout(startGame, 500);
    }, 700);
  });
}

/* ----------------------- GAME INIT ----------------------- */

async function loadPeople() {
  const res = await fetch('data/people.csv');
  const text = await res.text();
  const rows = parseCsv(text);
  return rows.map(normalizePerson);
}

function startGame() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('desktop-screen').classList.remove('hidden');

  Game.pool = Game.people.slice();
  Game.round = [];
  Game.history = [];
  Game.linkClicked = new Set();
  Game.health = 100;
  Game.score = 0;
  Game.difficulty = 1;
  Game.streak = 0;
  Game.caseNumber = 0;
  Game.totalCases = Game.people.length;
  Game.peakDifficulty = 1;
  Game.correctCount = 0;
  Game.over = false;

  renderHistory();
  updateFooter();
  updateTipsCopy();
  nextRound();
  startClock();
  openWindow('tips');
  centerWindow(document.getElementById('window-tips'));
  startShakeWatcher();
}

function updateTipsCopy() {
  const body = document.querySelector('#window-tips .tips-body');
  if (!body) return;
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
  document.getElementById('li-pfp').src = p.pfp;
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
  if (!p || !p.email) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');
  document.getElementById('email-subject').textContent = p.email.subject;
  document.getElementById('email-sender-name').textContent = p.email.senderName;
  document.getElementById('email-sender-address').textContent = p.email.senderAddress;
  document.getElementById('email-applicant-line').textContent = `Applicant age: ${p.age || '-'} | Gender: ${p.gender || '-'}`;
  document.getElementById('email-body-text').textContent = p.email.body;
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
  document.getElementById('text-pfp').src = p.pfp;
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
    img.src = p.pfp;
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

function renderHistory() {
  const el = document.getElementById('app-history');
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
    const right = document.createElement('span');
    right.className = h.correct ? 'hist-correct' : 'hist-wrong';
    right.textContent = h.correct ? 'CORRECT' : 'WRONG';
    row.appendChild(left);
    row.appendChild(right);
    el.appendChild(row);
  });
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
  const correct = approved ? !p.isFake : p.isFake;
  Game.caseNumber++;

  if (correct) {
    Game.score += 10 * p.difficulty;
    Game.streak++;
    Game.correctCount++;
    if (Game.streak >= 2) {
      Game.difficulty = Math.min(5, Game.difficulty + 1);
      Game.streak = 0;
    }
    showToast(true, approved
      ? `Correct - ${p.name} was a legitimate hire.`
      : `Correct - ${p.name} was flagged and denied.`);
  } else {
    const damage = 8 + p.difficulty * 4;
    Game.health -= damage;
    Game.streak = 0;
    Game.difficulty = Math.max(1, Game.difficulty - 1);
    showToast(false, approved
      ? `Mistake! ${p.name} was a fraudulent applicant. -${damage}% integrity.`
      : `Mistake! ${p.name} was a real hire, wrongly denied. -${damage}% integrity.`);
  }
  Game.peakDifficulty = Math.max(Game.peakDifficulty, Game.difficulty);
  Game.history.unshift({
    name: p.name,
    decisionLabel: approved ? p.approveLabel : p.denyLabel,
    correct
  });

  updateFooter();
  renderApplicationRound();
  renderHistory();

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
  showToast(false, `You clicked a suspicious link from ${p.name}! -${damage}% integrity.`);
  if (Game.health <= 0) {
    Game.health = 0;
    updateFooter();
    setTimeout(() => endGame(false), 900);
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

function endGame(completedAll) {
  Game.over = true;
  if (Game.shakeWatcherId) clearInterval(Game.shakeWatcherId);
  document.getElementById('desktop-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.remove('hidden');
  document.getElementById('end-title').textContent = completedAll ? 'SHIFT COMPLETE' : 'TERMINATED';
  document.getElementById('end-subtitle').textContent = completedAll
    ? 'You reviewed every applicant before integrity ran out.'
    : 'Company integrity reached zero. You have been relieved of duty.';
  document.getElementById('end-score').textContent = Game.score;
  document.getElementById('end-correct').textContent = `${Game.correctCount} / ${Game.caseNumber}`;
  document.getElementById('end-difficulty').textContent = Game.peakDifficulty;

  saveHighScore({
    score: Game.score,
    correct: Game.correctCount,
    total: Game.caseNumber,
    peakDifficulty: Game.peakDifficulty,
    date: new Date().toLocaleDateString()
  });
  renderHighScores();
}

function restartGame() {
  document.getElementById('end-screen').classList.add('hidden');
  startGame();
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

function checkShakes() {
  if (Game.over) return;
  REQUIRED_APPS.forEach(name => {
    if (isAppOpenVisible(name)) return;
    const icon = document.querySelector(`.desktop-icon[data-window="${name}"]`);
    if (icon) triggerShake(icon);
  });
}

function startShakeWatcher() {
  if (Game.shakeWatcherId) clearInterval(Game.shakeWatcherId);
  checkShakes();
  Game.shakeWatcherId = setInterval(checkShakes, 2000);
}

/* ----------------------- WINDOW MANAGEMENT ----------------------- */

function bringToFront(win) {
  document.querySelectorAll('.window').forEach(w => w.classList.remove('focused'));
  win.classList.add('focused');
  win.style.zIndex = 30;
  Game.focusedWindow = win.dataset.window;
  syncTaskbar();
}

function openWindow(name) {
  const win = document.getElementById(`window-${name}`);
  win.classList.remove('minimized');
  win.classList.remove('hidden');
  Game.openWindows.add(name);
  markAppOpened(name);
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

function setupFullscreenPrompt() {
  const prompt = document.getElementById('fullscreen-prompt');
  const dismiss = () => prompt.classList.add('hidden');
  document.getElementById('fullscreen-enter-btn').addEventListener('click', () => {
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (request) {
      request.call(el).catch(() => {});
    }
    dismiss();
  });
  document.getElementById('fullscreen-skip-btn').addEventListener('click', dismiss);
}

document.addEventListener('DOMContentLoaded', async () => {
  setupFullscreenPrompt();
  setupLogin();
  setupWindows();
  setupAppNav();
  document.getElementById('restart-btn').addEventListener('click', restartGame);

  try {
    Game.people = await loadPeople();
  } catch (err) {
    console.error('Failed to load applicant data:', err);
    document.getElementById('login-status').textContent =
      'Status: ERROR loading data/people.csv (run via a local server, not file://)';
  }
});
