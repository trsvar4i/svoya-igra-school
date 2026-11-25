'use strict';
// Состояние игры, сохранение в localStorage, отмена и запуск партии.

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const printSheet = document.querySelector('#print-sheet');
const openJson = document.querySelector('#open-json');
const sessionKey = 'school-quiz-session-v1';
const setupKey = 'school-quiz-setup-v1';
const colors = ['#00E5FF', '#CCFF00', '#FF6EA9', '#FFB800', '#9E8CFF', '#00E676', '#FF7559', '#78A9FF', '#F8EA75', '#FF9EDB'];
const minimumTeams = 2;
const iconPaths = {
  bolt: 'M13 2L4 14h7l-1 8 10-12h-7l1-8Z',
  flag: 'M5 21V4m0 1c6-5 8 5 15 0v10c-7 5-9-5-15 0',
  book: 'M4 19V5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1 0-4h14M8 7h8m-8 4h8',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  full: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  cat: 'M4 13V4l5 4a10 10 0 0 1 6 0l5-4v9a8 8 0 0 1-16 0Zm5-1h.1m5.8 0h.1m-4 4h2',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v2a3 3 0 0 0 3 3m10-5h3v2a3 3 0 0 1-3 3',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-7-8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm7-3a3 3 0 0 1 0 6',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`;
}

// Склонение по числу: plural(5, ['тема', 'темы', 'тем']) → «тем».
function plural(count, [one, few, many]) {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  return [many, one, few, few, few][count % 10] ?? many;
}

// В финале у каждой команды своя тема. В старых сохранениях было три темы.
function topicTotal(state = game) {
  return state.topicCount ?? 3;
}

// Потолок ставки в финале: лучший счёт на старте финала. Ставка не больше своего счёта и не больше потолка.
function stakeCeiling() {
  return Math.max(1, ...game.teams.map(team => team.score));
}

function maxStake(team) {
  return Math.min(team.score, game.stakeCap ?? Infinity);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    storageFailed = true;
    const warning = document.querySelector('#storage-warning');
    if (warning) warning.hidden = false;
    return false;
  }
}

let storageFailed = false;
const setup = read(setupKey) || {
  teams: [],
  seconds: 30,
  sound: true,
  multiplier: 2,
};
if (!Number.isInteger(setup.grade) || !gradeNumbers.includes(setup.grade)) setup.grade = 9;
if (typeof setup.className !== 'string') setup.className = '';
if (![2, 3, 4, 5].includes(setup.groups)) setup.groups = 3;
const themes = { studio: 'Постер', neon: 'Неон' };
if (!themes[setup.theme]) setup.theme = 'studio';
document.documentElement.dataset.theme = setup.theme;
let game = null;
let history = [];
let sessionBank = null;
let view = 'lobby';
let renderedView;
let overlay = null;
let audioContext;
let lastTick;
let fileNotice = null;

function activeBank() {
  const grade = view === 'lobby' ? setup.grade : game?.grade ?? 9;
  return (view === 'lobby' ? setup.bank : sessionBank) || gradeBanks[grade] || demoBank;
}

function savedSession() {
  return game ? { game, history, bank: sessionBank } : read(sessionKey);
}

function persist() {
  save(sessionKey, savedSession());
}

function snapshot() {
  const previous = structuredClone(game);
  if (previous.active?.timer.end) {
    previous.active.timer.remaining = timeLeft(previous.active.timer);
    previous.active.timer.end = null;
  }
  return previous;
}

function step(change) {
  history.push(snapshot());
  history = history.slice(-10);
  change();
  persist();
  render();
}

function undo() {
  if (!history.length) return;
  game = history.pop();
  view = game.stage;
  overlay = null;
  lastTick = undefined;
  persist();
  render();
}

function startGame() {
  if (setup.teams.length < minimumTeams) return;
  const seconds = Math.round(Number(setup.seconds) || 30);
  setup.seconds = Math.min(180, Math.max(5, seconds));
  save(setupKey, setup);
  sessionBank = setup.bank ?? gradeBanks[setup.grade] ?? null;
  const names = uniqueTeamNames(setup.teams.map(team => team.name));
  game = {
    stage: 'briefing',
    teams: setup.teams.map(({ color }, index) => ({
      id: index, name: names[index], color,
      score: 0, correct: 0, wrong: 0, bestWin: 0,
    })),
    grade: setup.grade,
    className: setup.className.trim().slice(0, 20),
    seconds: setup.seconds,
    sound: setup.sound,
    multiplier: setup.multiplier,
    chooser: 0,
    played: [],
    active: null,
    topics: [],
    topicCount: setup.teams.length,
    finalIndex: 0,
    draft: {},
    log: [],
  };
  history = [];
  fx.resetScores();
  go('briefing');
}

function go(stage) {
  view = stage;
  overlay = null;
  if (game && stage !== 'lobby') {
    game.stage = stage;
    persist();
  }
  render();
}

function resume() {
  const saved = savedSession();
  if (!saved?.game) return;
  loadSession(saved);
}

function loadSession(saved) {
  game = saved.game;
  history = saved.history || [];
  sessionBank = saved.bank ?? null;
  fx.resetScores();
  view = game.stage;
  overlay = null;
  lastTick = undefined;
  persist();
  render();
}
