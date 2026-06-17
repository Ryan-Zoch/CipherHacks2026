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
      mutuals: row.li_mutuals
    },
    bg: { status: row.bg_status, detail: row.bg_detail },
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

const Game = {
  people: [],
  pool: [],
  current: null,
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
  focusedWindow: null
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
      setTimeout(showBriefing, 500);
    }, 700);
  });
}

function showBriefing() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('briefing-screen').classList.remove('hidden');
}

/* ----------------------- GAME INIT ----------------------- */

async function loadPeople() {
  const res = await fetch('data/people.csv');
  const text = await res.text();
  const rows = parseCsv(text);
  return rows.map(normalizePerson);
}

function startGame() {
  document.getElementById('briefing-screen').classList.add('hidden');
  document.getElementById('desktop-screen').classList.remove('hidden');

  Game.pool = Game.people.slice();
  Game.health = 100;
  Game.score = 0;
  Game.difficulty = 1;
  Game.streak = 0;
  Game.caseNumber = 0;
  Game.totalCases = Game.people.length;
  Game.peakDifficulty = 1;
  Game.correctCount = 0;
  Game.over = false;

  updateHud();
  nextApplicant();
  startClock();
}

/* ----------------------- APPLICANT SELECTION ----------------------- */

function pickNextFromPool() {
  if (Game.pool.length === 0) return null;
  // Prefer someone matching current difficulty; otherwise nearest difficulty available.
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

function nextApplicant() {
  const person = pickNextFromPool();
  if (!person) {
    endGame(true);
    return;
  }
  Game.current = person;
  Game.caseNumber++;
  renderApplicant(person);
  updateHud();
}

/* ----------------------- RENDERING ----------------------- */

function renderApplicant(p) {
  // Decision dock
  document.getElementById('dock-pfp').src = p.pfp;
  document.getElementById('dock-name').textContent = p.name;
  document.getElementById('dock-sub').textContent = `Applying for: ${p.job || 'Unknown role'}`;
  document.getElementById('btn-approve').textContent = p.approveLabel;
  document.getElementById('btn-deny').textContent = p.denyLabel;

  // LinkedIn
  document.getElementById('li-pfp').src = p.pfp;
  document.getElementById('li-pfp').style.transform = `scale(${p.pfpScale})`;
  document.getElementById('li-name').textContent = p.name;
  document.getElementById('li-headline').textContent = p.li.headline || ' ';
  document.getElementById('li-location').textContent = p.li.location || ' ';
  document.getElementById('li-mutuals').textContent = p.li.mutuals !== '' ? `${p.li.mutuals} mutual connections` : ' ';
  document.getElementById('li-gender').textContent = p.gender || '-';
  document.getElementById('li-age').textContent = p.age || '-';
  document.getElementById('li-job').textContent = p.job || '-';
  const expList = document.getElementById('li-experience');
  expList.innerHTML = '';
  p.li.experience.forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    expList.appendChild(li);
  });
  document.getElementById('li-education').textContent = p.li.education || ' ';

  // Email
  const emailEmpty = document.getElementById('email-empty');
  const emailContent = document.getElementById('email-content');
  if (p.email) {
    emailEmpty.classList.add('hidden');
    emailContent.classList.remove('hidden');
    document.getElementById('email-subject').textContent = p.email.subject;
    document.getElementById('email-sender-name').textContent = p.email.senderName;
    document.getElementById('email-sender-address').textContent = p.email.senderAddress;
    document.getElementById('email-body-text').textContent = p.email.body;
  } else {
    emailEmpty.classList.remove('hidden');
    emailContent.classList.add('hidden');
  }

  // Text / phone
  document.getElementById('text-pfp').src = p.pfp;
  const thread = document.getElementById('phone-thread');
  thread.innerHTML = '';
  if (p.text) {
    document.getElementById('text-contact-name').textContent = p.text.sender;
    const bubble = document.createElement('div');
    bubble.className = 'bubble-in';
    bubble.textContent = p.text.body;
    thread.appendChild(bubble);
    if (p.text.link) {
      const linkBubble = document.createElement('div');
      linkBubble.className = 'bubble-link';
      linkBubble.textContent = p.text.link;
      thread.appendChild(linkBubble);
    }
  } else {
    document.getElementById('text-contact-name').textContent = p.name;
    const empty = document.createElement('div');
    empty.className = 'text-empty';
    empty.textContent = 'No new messages from this applicant.';
    thread.appendChild(empty);
  }

  // Terminal
  const term = document.getElementById('terminal-output');
  term.textContent =
`AEGIS PERSONNEL RECORDS & BACKGROUND VERIFICATION SYSTEM
------------------------------------------------------
> QUERY: "${p.name}"
> SEARCHING DATABASE...

STATUS: ${p.bg.status || 'UNKNOWN'}
${p.bg.detail || 'No additional information on file.'}`;
}

/* ----------------------- HUD ----------------------- */

function updateHud() {
  const fill = document.getElementById('health-fill');
  fill.style.width = Math.max(0, Game.health) + '%';
  fill.classList.remove('warn', 'danger');
  if (Game.health <= 25) fill.classList.add('danger');
  else if (Game.health <= 55) fill.classList.add('warn');

  document.getElementById('health-value').textContent = Math.max(0, Math.round(Game.health)) + '%';
  document.getElementById('case-count').textContent = `${Game.caseNumber} / ${Game.totalCases}`;
  document.getElementById('difficulty-value').textContent = Game.difficulty;
  document.getElementById('score-value').textContent = Game.score;
}

/* ----------------------- DECISIONS ----------------------- */

function makeDecision(approved) {
  if (Game.over || !Game.current) return;
  const p = Game.current;
  const correct = approved ? !p.isFake : p.isFake;

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
  updateHud();

  if (Game.health <= 0) {
    Game.health = 0;
    updateHud();
    setTimeout(() => endGame(false), 900);
    return;
  }
  setTimeout(nextApplicant, 900);
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
  document.getElementById('desktop-screen').classList.add('hidden');
  document.getElementById('end-screen').classList.remove('hidden');
  document.getElementById('end-title').textContent = completedAll ? 'SHIFT COMPLETE' : 'TERMINATED';
  document.getElementById('end-subtitle').textContent = completedAll
    ? 'You reviewed every applicant before integrity ran out.'
    : 'Company integrity reached zero. You have been relieved of duty.';
  document.getElementById('end-score').textContent = Game.score;
  document.getElementById('end-correct').textContent = `${Game.correctCount} / ${Game.caseNumber}`;
  document.getElementById('end-difficulty').textContent = Game.peakDifficulty;
}

function restartGame() {
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('briefing-screen').classList.remove('hidden');
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

/* ----------------------- CLOCK ----------------------- */

function startClock() {
  function tick() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    document.getElementById('taskbar-clock').textContent = `${h}:${m} ${ampm}`;
  }
  tick();
  setInterval(tick, 1000 * 30);
}

/* ----------------------- BOOTSTRAP ----------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  setupLogin();
  setupWindows();

  document.getElementById('briefing-start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', restartGame);
  document.getElementById('btn-approve').addEventListener('click', () => makeDecision(true));
  document.getElementById('btn-deny').addEventListener('click', () => makeDecision(false));
  document.getElementById('taskbar-start').addEventListener('click', () => {
    ['linkedin', 'email', 'text', 'terminal'].forEach(openWindow);
  });

  try {
    Game.people = await loadPeople();
  } catch (err) {
    console.error('Failed to load applicant data:', err);
    document.getElementById('login-status').textContent =
      'Status: ERROR loading data/people.csv (run via a local server, not file://)';
  }
});
