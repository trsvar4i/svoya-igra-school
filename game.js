'use strict';

const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const printSheet = document.querySelector('#print-sheet');
const sessionKey = 'school-quiz-session-v1';
const setupKey = 'school-quiz-setup-v1';
const colors = ['#00E5FF', '#CCFF00', '#FF6EA9', '#FFB800', '#9E8CFF', '#00E676', '#FF7559', '#78A9FF', '#F8EA75'];
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
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-7-8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm7-3a3 3 0 0 1 0 6',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`;
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
let game = null;
let history = [];
let view = 'lobby';
let renderedView;
let overlay = null;
let audioContext;
let lastTick;

function persist() {
  save(sessionKey, { game, history });
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
  game = {
    stage: 'briefing',
    teams: setup.teams.map(({ name, color }, index) => ({
      id: index, name: name.trim() || `Команда ${index + 1}`, color,
      score: 0, correct: 0, wrong: 0, bestWin: 0,
    })),
    seconds: setup.seconds,
    sound: setup.sound,
    multiplier: setup.multiplier,
    chooser: 0,
    played: [],
    active: null,
    topics: [],
    finalIndex: 0,
    draft: {},
    log: [],
  };
  history = [];
  persist();
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
  const saved = read(sessionKey);
  if (!saved?.game) return;
  game = saved.game;
  history = saved.history || [];
  view = game.stage;
  overlay = null;
  render();
}

function button(label, action, options = {}) {
  const { value, style = '', disabled = false, title, pressed } = options;
  return `<button type="button" class="btn ${style}" data-action="${action}"${value === undefined ? '' : ` data-value="${esc(value)}"`}${disabled ? ' disabled' : ''}${title ? ` aria-label="${esc(title)}" title="${esc(title)}"` : ''}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${label}</button>`;
}

function title(label, heading, actions = '') {
  return `<header class="titlebar"><div><div class="eyebrow">${label}</div><h1>${heading}</h1></div><div class="actions">${actions}</div></header>`;
}

function lobby() {
  const saved = read(sessionKey)?.game;
  const row = (team, index) => `<div class="team-row">
    <span class="team-number">${String(index + 1).padStart(2, '0')}</span>
    <input type="color" data-field="color" data-index="${index}" value="${esc(team.color)}" aria-label="Цвет команды ${index + 1}">
    <input type="text" data-field="name" data-index="${index}" value="${esc(team.name)}" maxlength="36" placeholder="Команда ${index + 1}" aria-label="Название команды ${index + 1}">
    ${button('↑', 'team-up', { value: index, style: 'icon-button btn-ghost', disabled: !index, title: 'Поднять команду' })}
    ${button('↓', 'team-down', { value: index, style: 'icon-button btn-ghost', disabled: index === setup.teams.length - 1, title: 'Опустить команду' })}
    ${button('×', 'team-remove', { value: index, style: 'icon-button btn-ghost', title: 'Удалить команду' })}
  </div>`;
  return `<section class="hero">
    <svg class="hero-emblem" viewBox="0 0 240 164" fill="none" aria-hidden="true">
      <path d="M44 15h152l26 26v82l-26 26H44l-26-26V41l26-26Z" stroke="currentColor" stroke-width="2"/>
      <path d="M35 0h170l35 34v96l-35 34H35L0 130V34L35 0Z" stroke="currentColor" stroke-dasharray="5 5"/>
      <path d="m130 24-60 68h43l-6 48 62-72h-46l7-44Z" stroke="currentColor" fill="currentColor" fill-opacity=".23" stroke-width="3"/>
    </svg>
    <div class="eyebrow">Школьный турнир · 9-е классы</div>
    <h1>Своя <span>игра</span></h1>
    <p>Настройте команды и проведите турнир на большом экране.</p>
  </section>
  <div class="lobby-grid">
    <section class="panel">
      <div class="panel-heading"><div><h2>Команды</h2><p class="muted small">Задайте названия, цвета и порядок команд.</p></div><span class="count">${setup.teams.length} / 9</span></div>
      ${setup.teams.length ? `<div class="team-list">${setup.teams.map(row).join('')}</div>` : ''}
      ${button(icon('plus') + ' Добавить команду', 'team-add', { style: 'btn-ghost', disabled: setup.teams.length >= 9 })}
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Настройки игры</h2><p class="muted small">Для обоих раундов</p></div></div>
      <label class="setting"><span><strong>Таймер</strong><small>От 5 до 180 секунд</small></span><input type="number" data-field="seconds" min="5" max="180" value="${esc(setup.seconds)}" aria-label="Длительность таймера в секундах"></label>
      <label class="setting"><span><strong>Звуковые эффекты</strong><small>Сигналы таймера и судейства</small></span><input type="checkbox" data-field="sound" ${setup.sound ? 'checked' : ''}></label>
      <label class="setting"><span><strong>Верный ответ в финале</strong><small>При ошибке ставка вычитается</small></span><select data-field="multiplier"><option value="2" ${setup.multiplier === 2 ? 'selected' : ''}>+2 × ставка</option><option value="1" ${setup.multiplier === 1 ? 'selected' : ''}>+1 × ставка</option></select></label>
      ${button(icon('book') + ' Шпаргалка судьи · Печать / PDF', 'cheat', { style: 'btn-wide btn-ghost' })}
    </section>
  </div>
  <div class="lobby-actions">
    ${saved && saved.stage !== 'results' ? button('Продолжить прошлую игру', 'resume') : ''}
    ${setup.teams.length < minimumTeams ? '<span class="muted small">Для старта нужны минимум две команды.</span>' : ''}
    ${button('Начать новую игру ' + icon('arrow'), 'start', { style: 'btn-primary', disabled: setup.teams.length < minimumTeams })}
  </div>`;
}

function briefing() {
  const rules = [
    ['flag', 'Поднимайте флажок после вопроса', 'Судьи определяют, какая команда подала сигнал первой. После сигнала у команды есть до 5 секунд, чтобы тихо подсказать ответ своему спикеру.'],
    ['check', 'Цена ответа', 'За верный ответ команда получает номинал клетки и выбирает следующий вопрос. За ошибку номинал вычитается, а другие команды могут ответить, пока идёт время.'],
    ['clock', `На размышление — ${game.seconds} сек.`, 'Если до сигнала никто не поднял флажок, номинал теряет команда, выбравшая клетку. У «Кота в мешке» штраф получает команда, которой передали вопрос.'],
    ['cat', 'Кот в мешке', 'На табло спрятаны три особых вопроса. Открывшая клетку команда выбирает соперника, который будет отвечать.'],
    ['people', 'В команде работают все', 'Один и тот же участник не отвечает два раза подряд. После ответа передайте флажок следующему участнику.'],
  ];
  return title('Перед началом', 'Правила игры')
    + `<div class="briefing">${rules.map(([symbol, heading, text]) => `<section class="panel rule">${icon(symbol)}<div><h2>${heading}</h2><p class="muted">${text}</p></div></section>`).join('')}</div>
    <div class="actions">${button('К настройкам', 'lobby', { style: 'btn-ghost' })}${button('К игровому табло ' + icon('arrow'), 'board', { style: 'btn-primary' })}</div>`;
}

function scoreCards(showChooser = false) {
  const chooser = game.teams.find(team => team.id === game.chooser);
  return `<div class="score-title"><span class="eyebrow">Счёт команд</span>${showChooser ? `<span class="count">Выбирает · ${esc(chooser.name)}</span>` : ''}</div>
    <div class="scores" style="--cols:${game.teams.length > 6 ? Math.ceil(game.teams.length / 2) : game.teams.length}">
    ${game.teams.map(team => `<button type="button" class="score-card ${showChooser && game.chooser === team.id ? 'current' : ''}" data-action="adjust" data-value="${team.id}" style="--team:${esc(team.color)}" title="Изменить счёт">
      <span class="name">${esc(team.name)}</span><span class="score ${team.score < 0 ? 'negative' : ''}">${team.score.toLocaleString('ru-RU')}</span>
    </button>`).join('')}</div>`;
}

function board() {
  const remaining = 25 - game.played.length;
  const toolbar = button('Отменить', 'undo', { disabled: !history.length })
    + button('Редактировать счёт', 'score-menu')
    + button('Финал ' + icon('arrow'), 'final', { style: 'btn-primary' });
  return title('Раунд 1', 'Игровое табло', `<span class="count" aria-label="Осталось вопросов">${remaining} / 25 осталось</span>${toolbar}`)
    + `<div class="board" aria-label="Вопросы первого раунда">${questions.round1.map(topic => `
      <div class="board-label">${topic.title}</div>${topic.questions.map((question, index) => {
        const id = `${topic.id}:${index}`;
        const played = game.played.includes(id);
        return `<button type="button" class="board-cell" data-action="question" data-value="${id}" ${played ? 'disabled' : ''} aria-label="${topic.title}, ${question.points}${played ? ', сыграно' : ''}">${played ? '—' : question.points}</button>`;
      }).join('')}`).join('')}</div>${scoreCards(true)}`;
}

function topicSelection() {
  return title('Раунд 2 · Финал', 'Выбор финальных тем', `<span class="count">${game.topics.length} / 3 выбрано</span>`)
    + `<p class="muted">Попросите трёх представителей выбрать по одной теме. В финале темы прозвучат в порядке выбора.</p>
      <div class="topic-grid">${questions.round2.map(topic => {
        const index = game.topics.indexOf(topic.id);
        return button(`<span class="topic-tag">${index >= 0 ? index + 1 : icon('plus')}</span><span>${topic.title}</span>`,
          'topic', { value: topic.id, style: `topic ${index >= 0 ? 'selected' : ''}`, pressed: index >= 0, disabled: index < 0 && game.topics.length === 3 });
      }).join('')}</div>
      <div class="actions">${button('К табло', 'board', { style: 'btn-ghost' })}${button('Перейти к финальным вопросам ' + icon('arrow'), 'begin-final', { style: 'btn-primary', disabled: game.topics.length !== 3 })}</div>${scoreCards()}`;
}

function finalPosition() {
  const topicIndex = Math.floor(game.finalIndex / 3);
  return { topic: questions.round2.find(item => item.id === game.topics[topicIndex]), topicIndex, questionIndex: game.finalIndex % 3 };
}

function stakePage() {
  const { topic, topicIndex, questionIndex } = finalPosition();
  return title(`Финал · Тема ${topicIndex + 1} из 3`, topic.title, `<span class="count">Вопрос ${questionIndex + 1} / 3</span>${button('Отменить', 'undo', { disabled: !history.length })}`)
    + `<p class="muted">Введите ставки команд до открытия вопроса. Верный ответ даёт ${game.multiplier === 2 ? 'двойную ставку' : 'сумму ставки'}, ошибка списывает её.</p>
    <form id="stake-form" novalidate><div class="stake-grid">${game.teams.map(team => `<section class="panel stake-card" style="--team:${esc(team.color)}">
      <h2>${esc(team.name)}</h2><p class="muted">Счёт · ${team.score.toLocaleString('ru-RU')} баллов</p>
      ${team.score > 0
        ? `<input type="number" name="team-${team.id}" data-field="stake" data-index="${team.id}" min="1" max="${team.score}" step="1" required value="${esc(game.draft[team.id] ?? '')}" placeholder="От 1 до ${team.score}" aria-label="Ставка команды ${esc(team.name)}">
        <div class="actions">${[['25%', '.25'], ['50%', '.5'], ['Ва-банк', '1']].map(([label, ratio]) => button(label, 'stake-preset', { value: `${team.id}:${ratio}` })).join('')}</div>`
        : '<input type="number" disabled aria-label="Ставка недоступна"><p class="small muted">Ставка недоступна · счёт ≤ 0</p>'}
    </section>`).join('')}</div>
    <p class="stake-error" id="stake-error" role="alert"></p>
    <button class="btn btn-primary" type="submit">Зафиксировать ставки и открыть вопрос ${icon('arrow')}</button>
    </form>${scoreCards()}`;
}

function rankings() {
  const sorted = [...game.teams].sort((a, b) => b.score - a.score || a.id - b.id);
  return sorted.map(team => ({
    ...team, place: sorted.findIndex(entry => entry.score === team.score) + 1,
  }));
}

function resultsContent() {
  const sorted = rankings();
  const attempts = team => team.correct + team.wrong;
  const accuracy = team => team.correct / attempts(team);
  const answered = sorted.filter(attempts).sort((a, b) => accuracy(b) - accuracy(a));
  const best = answered[0];
  const accurate = best ? answered.filter(team => accuracy(team) === accuracy(best)).map(team => team.name).join(', ') : '';
  const biggest = Math.max(...sorted.map(team => team.bestWin));
  const wins = sorted.filter(team => biggest > 0 && team.bestWin === biggest).map(team => team.name).join(', ');
  const podium = Object.values(Object.groupBy(sorted.filter(team => team.place <= 3), team => team.place));
  return `<div class="podium">${podium.map(([team, ...tied]) => `<section class="panel podium-card" data-place="${team.place}" style="--team:${esc(team.color)}">
    <div class="eyebrow">${team.place} место</div><h2>${esc([team, ...tied].map(entry => entry.name).join(', '))}</h2><span class="score">${team.score.toLocaleString('ru-RU')}</span>
  </section>`).join('')}</div>
  <div class="stat-grid">
    <section class="panel"><span class="small muted">Лучшая точность</span><strong>${best ? `${Math.round(accuracy(best) * 100)}% · ${esc(accurate)}` : '—'}</strong></section>
    <section class="panel"><span class="small muted">Крупнейший выигрыш в финале</span><strong>${biggest ? `+${biggest.toLocaleString('ru-RU')} · ${esc(wins)}` : '—'}</strong></section>
    <section class="panel"><span class="small muted">Всего верных ответов</span><strong>${sorted.reduce((total, team) => total + team.correct, 0)}</strong></section>
  </div>
  <div class="table-wrap"><table><thead><tr><th>Место</th><th>Команда</th><th>Счёт</th><th>Верно</th><th>Неверно</th></tr></thead><tbody>
    ${sorted.map(team => `<tr><td>${team.place}</td><td>${esc(team.name)}</td><td>${team.score.toLocaleString('ru-RU')}</td><td>${team.correct}</td><td>${team.wrong}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function results() {
  return title('Турнир завершён', 'Итоги турнира', button('Отменить', 'undo', { disabled: !history.length })
    + button('Скачать JSON', 'export') + button('Печать / PDF', 'print-results', { style: 'btn-primary' }))
    + resultsContent() + `<div class="lobby-actions">${button('В лобби', 'lobby', { style: 'btn-ghost' })}</div>`;
}

const pages = { lobby, briefing, board, topics: topicSelection, stakes: stakePage, results };

function render() {
  app.innerHTML = `<div class="shell" data-view="${view}"><div class="topbar">
    <div class="brand"><span class="brand-mark">${icon('bolt')}</span>Своя игра</div>
    <div class="top-actions"><span class="offline small">Автономный режим</span>
      ${view === 'lobby' ? '' : button(icon('book') + ' Шпаргалка', 'cheat', { style: 'btn-ghost small' })}
      ${button(icon('full'), 'fullscreen', { style: 'icon-button btn-ghost', title: 'Полноэкранный режим' })}
    </div>
  </div><main>${pages[view]()}</main>
  <p class="warning small" id="storage-warning" ${storageFailed ? '' : 'hidden'}>Браузер ограничил автосохранение. Прогресс доступен до закрытия страницы.</p></div>`;
  renderModal();
  if (renderedView !== view) {
    renderedView = view;
    window.scrollTo(0, 0);
  }
}

function freshTimer(running = false) {
  const remaining = game.seconds * 1000;
  return { remaining, end: running ? Date.now() + remaining : null };
}

function timeLeft(timer) {
  return timer.end === null ? timer.remaining : Math.max(0, timer.end - Date.now());
}

function pauseTimer(timer) {
  timer.remaining = timeLeft(timer);
  timer.end = null;
}

function toggleTimer() {
  updateClock();
  const { timer, revealed, locked } = game.active;
  if (revealed || locked) return;
  if (timer.end !== null) pauseTimer(timer);
  else if (timer.remaining > 0) timer.end = Date.now() + timer.remaining;
  lastTick = undefined;
  persist();
  updateClock();
}

function resetTimer() {
  updateClock();
  if (game.active.revealed || game.active.locked) return;
  game.active.timer = freshTimer();
  lastTick = undefined;
  persist();
  renderModal();
}

function updateClock() {
  const timer = game?.active?.timer;
  if (!timer) return;
  const remaining = timeLeft(timer);
  const seconds = Math.ceil(remaining / 1000);
  if (timer.end !== null && seconds !== lastTick) {
    lastTick = seconds;
    if (seconds <= 5) sound(seconds ? 'tick' : 'time');
    if (!seconds) {
      expireQuestion();
      return;
    }
  }
  const clock = modal.querySelector('.timer');
  if (!clock) return;
  clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  clock.classList.toggle('danger', seconds <= 5);
  const timerStatus = modal.querySelector('.timer-status');
  if (!seconds && !timerStatus.textContent) timerStatus.textContent = 'Время вышло';
  if (seconds && timerStatus.textContent) timerStatus.textContent = '';
  const track = modal.querySelector('.timer-track');
  track.classList.toggle('danger', seconds <= 5);
  track.firstElementChild.style.width = `${remaining / (game.seconds * 10)}%`;
  const toggle = modal.querySelector('[data-action=timer-toggle]');
  toggle.textContent = timer.end === null ? 'Старт' : 'Пауза';
  toggle.disabled = !remaining || game.active.revealed || game.active.locked;
}

function unlockAudio() {
  if (!(game ? game.sound : setup.sound)) return;
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch {
    // The game remains playable when audio is unavailable.
  }
}

function sound(kind) {
  if (!(game ? game.sound : setup.sound) || audioContext?.state !== 'running') return;
  const cues = {
    click: [490], tick: [360], time: [240, 175], correct: [523, 659, 784],
    wrong: [205, 145], cat: [140, 180, 230, 320],
  };
  cues[kind].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + index * .095;
    oscillator.frequency.value = frequency;
    oscillator.type = kind === 'cat' ? 'triangle' : 'sine';
    gain.gain.setValueAtTime(.001, start);
    gain.gain.exponentialRampToValueAtTime(kind === 'tick' ? .025 : .075, start + .016);
    gain.gain.exponentialRampToValueAtTime(.001, start + .11);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + .12);
  });
}

function currentQuestion(active = game.active) {
  const [topicId, index] = active.id.split(':');
  const list = active.round === 1 ? questions.round1 : questions.round2;
  const topic = list.find(item => item.id === topicId);
  return { topic, question: topic.questions[Number(index)] };
}

function openQuestion(id) {
  lastTick = undefined;
  const { isCatInBag } = currentQuestion({ round: 1, id }).question;
  step(() => {
    game.active = {
      round: 1, id, phase: isCatInBag ? 'pass' : 'question', recipient: null, marks: {}, revealed: false,
      locked: false, answering: null, timer: freshTimer(!isCatInBag),
    };
    sound(isCatInBag ? 'cat' : 'click');
  });
}

function passCat(id) {
  if (id === game.chooser) return;
  step(() => {
    game.active.recipient = id;
    game.active.phase = 'question';
    game.active.timer = freshTimer(true);
    lastTick = undefined;
  });
}

function lockStakes() {
  const eligible = game.teams.filter(team => team.score > 0);
  const stakes = {};
  for (const team of eligible) {
    const stake = Number(game.draft[team.id]);
    if (!Number.isSafeInteger(stake) || stake < 1 || stake > team.score) {
      document.querySelector('#stake-error').textContent = `${team.name}: введите целую ставку от 1 до ${team.score}.`;
      document.querySelector(`[name="team-${team.id}"]`).focus();
      return;
    }
    stakes[team.id] = stake;
  }
  lastTick = undefined;
  const { topic, questionIndex } = finalPosition();
  step(() => {
    game.active = {
      round: 2, id: `${topic.id}:${questionIndex}`, phase: 'question', stakes, marks: {},
      revealed: false, locked: false, timer: freshTimer(true),
    };
  });
}

function isEligible(team) {
  const { round, recipient, stakes } = game.active;
  return round === 1 ? recipient === null || recipient === team.id : Object.hasOwn(stakes, team.id);
}

function allJudged(active = game.active) {
  return Object.keys(active.stakes).every(id => Object.hasOwn(active.marks, id));
}

function finishRoundOne(active) {
  active.locked = true;
  active.revealed = true;
  pauseTimer(active.timer);
}

function expireQuestion() {
  const active = game.active;
  if (active.round === 2 || active.answering != null) {
    pauseTimer(active.timer);
    persist();
    renderModal();
    return;
  }

  step(() => {
    if (!Object.keys(active.marks).length) {
      const team = game.teams.find(item => item.id === (active.recipient ?? game.chooser));
      const delta = -currentQuestion().question.points;
      team.score += delta;
      active.marks[team.id] = { correct: false, delta, timeout: true };
      game.log.push({ round: 1, question: active.id, team: team.id, delta, reason: 'timeout' });
    }
    finishRoundOne(active);
  });
}

function pickJudge(id) {
  updateClock();
  const active = game.active;
  if (active.locked || active.revealed || !timeLeft(active.timer)) return;
  active.answering = id;
  persist();
  renderModal();
  modal.querySelector('[data-action=judge-correct]')?.focus();
}

function judge(id, correct) {
  const active = game.active;
  const team = game.teams.find(item => item.id === id);
  if (!team || active.revealed || active.locked || !isEligible(team) || Object.hasOwn(active.marks, id)) return;
  if (active.round === 1 && active.answering !== id) return;
  const amount = active.round === 1 ? currentQuestion().question.points : active.stakes[id];
  const delta = correct ? amount * (active.round === 1 ? 1 : game.multiplier) : -amount;
  step(() => {
    team.score += delta;
    team[correct ? 'correct' : 'wrong']++;
    active.marks[id] = { correct, delta };
    game.log.push({ round: active.round, question: active.id, team: team.id, delta, correct });
    if (active.round === 2 && correct) team.bestWin = Math.max(team.bestWin, delta);
    if (active.round === 1) {
      active.answering = null;
      if (correct) game.chooser = id;
      const noAttemptsLeft = game.teams.every(item => !isEligible(item) || Object.hasOwn(active.marks, item.id));
      if (correct || noAttemptsLeft || !timeLeft(active.timer)) finishRoundOne(active);
    } else if (allJudged(active)) {
      active.locked = true;
      pauseTimer(active.timer);
    }
    sound(correct ? 'correct' : 'wrong');
  });
}

function reveal() {
  const active = game.active;
  if (active.round !== 2 || active.revealed || !allJudged()) return;
  step(() => {
    active.revealed = true;
    active.locked = true;
    pauseTimer(active.timer);
  });
}

function closeQuestion() {
  const active = game.active;
  if (active.round === 2 && !active.revealed) return;
  if (active.round === 1 && active.phase === 'question' && !active.locked) return;
  lastTick = undefined;
  step(() => {
    if (active.round === 1 && active.phase === 'question') game.played.push(active.id);
    if (active.round === 2) {
      game.finalIndex++;
      game.draft = {};
      if (game.finalIndex === 9) {
        view = 'results';
        game.stage = view;
      }
    }
    game.active = null;
  });
}

function dialogHeading(label, heading, close = true) {
  return `<div class="dialog-heading"><div><div class="eyebrow">${label}</div><h2 id="modal-title" tabindex="-1">${heading}</h2></div>
    ${close ? button('×', 'close-overlay', { style: 'btn-ghost icon-button', title: 'Закрыть окно' }) : ''}</div>`;
}

function catDialog() {
  const chooser = game.teams.find(team => team.id === game.chooser);
  return `<div class="dialog-body">${dialogHeading('Спецклетка', `<span class="cat-title">${icon('cat')} Кот в мешке!</span>`, false)}
    <p class="question-text">${esc(chooser.name)}, передайте вопрос другой команде.</p>
    <div class="actions">${game.teams.filter(team => team.id !== chooser.id).map(team => button(esc(team.name), 'cat-pass', { value: team.id, style: 'btn-primary' })).join('')}</div>
    <div class="lobby-actions">${button('Вернуться к табло', 'close-question', { style: 'btn-ghost' })}</div></div>`;
}

function judgeControls(team) {
  const active = game.active;
  const mark = active.marks[team.id];
  const label = esc(team.name);
  if (mark) return `<span class="judge-group">${label} <span class="status ${mark.correct ? 'btn-good' : 'btn-bad'}">${mark.timeout ? 'Штраф ' : ''}${mark.correct ? '+' : '−'}${Math.abs(mark.delta)}</span></span>`;
  if (active.revealed || active.locked || !isEligible(team)) return '';
  if (active.round === 1 && active.answering !== team.id) {
    return timeLeft(active.timer) ? button(label, 'pick-judge', { value: team.id }) : '';
  }
  return `<span class="judge-group"><span>${label}</span>
    ${button('+ Верно', 'judge-correct', { value: team.id, style: 'btn-good', title: `${team.name}, верный ответ` })}
    ${button('− Неверно', 'judge-wrong', { value: team.id, style: 'btn-bad', title: `${team.name}, неверный ответ` })}</span>`;
}

function questionDialog() {
  const active = game.active;
  const { topic, question } = currentQuestion();
  const isFinal = active.round === 2;
  const answerVisible = active.revealed || (!isFinal && active.locked);
  const subtitle = isFinal ? `Финал · Тема ${Math.floor(game.finalIndex / 3) + 1} · Вопрос ${question.order} из 3` : 'Раунд 1';
  const recipient = game.teams.find(team => team.id === active.recipient);
  const judgeButtons = game.teams.map(judgeControls).join('');
  return `<div class="timer-track"><div></div></div><div class="dialog-body">
    <div class="question-heading"><div>${dialogHeading(subtitle, `${topic.title} ${isFinal ? '' : `<span class="question-value">/ ${question.points}</span>`}`, false)}</div>
    <span class="count">Флажок передаётся по кругу</span></div>
    ${recipient ? `<p class="eyebrow">Кот в мешке · Отвечает ${esc(recipient.name)}</p>` : ''}
    <div class="timer-panel"><div class="inline"><span class="timer" role="timer"></span><span class="timer-status" role="status"></span></div><div class="actions">
      ${button('Старт', 'timer-toggle') + button('Сброс', 'timer-reset', { disabled: active.revealed || active.locked })}</div></div>
    <p class="question-text">${esc(question.question)}</p>
    ${question.image ? `<img class="question-image" src="${esc(question.image)}" alt="${esc(question.imageAlt || 'Иллюстрация к вопросу')}">` : ''}
    ${answerVisible ? `<div class="answer"><div class="eyebrow">Правильный ответ</div><strong>${esc(question.answer)}</strong><p class="muted">${esc(question.note)}</p></div>` : ''}
    ${judgeButtons ? `<div class="eyebrow">${!isFinal && !answerVisible ? 'Кто поднял флажок?' : 'Судейство'}</div><div class="judge-actions">${judgeButtons}</div>` : ''}
    ${isFinal && !Object.keys(active.stakes).length ? '<p class="muted">У команд нет доступных ставок на этот вопрос.</p>' : ''}
    <div class="actions">
      ${button('Отменить', 'undo', { style: 'btn-ghost', disabled: !history.length })}
      ${isFinal && !answerVisible ? button('Показать правильный ответ', 'reveal', { style: 'btn-primary', disabled: !allJudged() }) : ''}
      ${answerVisible ? button(isFinal ? (game.finalIndex === 8 ? 'К итогам' : 'Следующий вопрос') : 'К табло', 'close-question', { style: 'btn-primary' }) : ''}
    </div>
  </div>`;
}

function cheatContent() {
  const tables = [questions.round1, questions.round2].map((round, index) => {
    const first = index === 0;
    return `<h2>Раунд ${index + 1} · ${first ? 'Основное табло' : 'Финал'}</h2>
      <div class="table-wrap cheat-table"><table><thead><tr><th>Тема</th><th>${first ? 'Номинал' : '№'}</th>${first ? '<th>Спецклетка</th>' : ''}<th>Вопрос</th><th>Ответ и пояснение</th></tr></thead><tbody>
      ${round.flatMap(topic => topic.questions.map(question => `<tr><td>${esc(topic.title)}</td><td>${first ? question.points : question.order}</td>
        ${first ? `<td>${question.isCatInBag ? 'Кот в мешке' : '—'}</td>` : ''}<td>${esc(question.question)}</td>
        <td><strong>${esc(question.answer)}</strong><small>${esc(question.note)}</small></td></tr>`)).join('')}
      </tbody></table></div>`;
  });
  return tables.join('');
}

function overlayContent() {
  switch (overlay.type) {
    case 'cheat':
      return dialogHeading('Ведущему и судьям', 'Шпаргалка судьи') + `<div class="actions" style="margin-bottom:14px">${button('Печать / PDF', 'print-cheat', { style: 'btn-primary' })}</div>${cheatContent()}`;
    case 'replace':
      return dialogHeading('Новая игра', 'Заменить сохранённую игру?')
        + `<p class="muted">Счёт и сыгранные вопросы прошлой сессии будут заменены.</p>
        <div class="lobby-actions">${button('Вернуться', 'close-overlay')}${button('Начать новую игру', 'confirm-start', { style: 'btn-primary' })}</div>`;
    case 'final':
      return dialogHeading('Раунд 2', 'Перейти к выбору тем?')
        + `<p class="muted">На табло осталось вопросов: ${25 - game.played.length}. До фиксации трёх тем можно вернуться к первому раунду.</p>
        <div class="lobby-actions">${button('К табло', 'close-overlay')}${button('Выбрать темы', 'confirm-final', { style: 'btn-primary' })}</div>`;
    case 'score-menu':
      return dialogHeading('Судейство', 'Редактировать счёт')
        + `<div class="actions">${game.teams.map(team => button(`${esc(team.name)} · ${team.score}`, 'adjust', { value: team.id })).join('')}</div>`;
    case 'adjust': {
      const team = game.teams.find(item => item.id === overlay.id);
      return dialogHeading('Судейство', esc(team.name))
        + `<form id="score-form"><label class="setting"><span><strong>Текущий счёт · ${team.score}</strong><small>Сумма изменения или новый счёт</small></span>
          <input name="score" type="number" step="1" min="-1000000000" max="1000000000" value="300" aria-label="Сумма изменения или новый счёт" required></label>
          <div class="lobby-actions"><button class="btn" name="operation" value="add" type="submit">Прибавить</button>
          <button class="btn" name="operation" value="subtract" type="submit">Вычесть</button>
          <button class="btn btn-primary" name="operation" value="set" type="submit">Установить счёт</button></div></form>
          ${view === 'board' && game.chooser !== team.id ? `<div class="lobby-actions">${button('Назначить выбирающей командой', 'set-chooser', { value: team.id })}</div>` : ''}`;
    }
  }
}

function renderModal() {
  const active = game?.active;
  const kind = overlay?.type || (view !== 'lobby' && active && (active.phase === 'pass' ? 'cat' : 'question'));
  if (!kind) {
    if (modal.open) modal.close();
    modal.innerHTML = '';
    return;
  }
  modal.dataset.kind = kind;
  modal.innerHTML = overlay ? `<div class="dialog-body">${overlayContent()}</div>` : (kind === 'cat' ? catDialog() : questionDialog());
  if (!modal.open) modal.showModal();
  modal.querySelector('#modal-title').focus({ preventScroll: true });
  if (kind === 'question') updateClock();
}

function openOverlay(type, id) {
  overlay = { type, id };
  renderModal();
}

function closeOverlay() {
  overlay = null;
  renderModal();
}

function printReport(cheat) {
  printSheet.innerHTML = cheat ? '<h1>Своя игра · Шпаргалка судьи</h1>' + cheatContent()
    : '<h1>Своя игра · Итоговый протокол</h1>' + resultsContent();
  document.body.classList.add('printing');
  window.print();
}

function exportResults() {
  const protocol = {
    tournament: 'Своя игра · 9-е классы',
    date: new Date().toISOString(),
    settings: { seconds: game.seconds, finalMultiplier: game.multiplier },
    topics: game.topics.map(id => questions.round2.find(topic => topic.id === id).title),
    standings: rankings(),
    actions: game.log,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(protocol, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'итоги-своя-игра.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function editTeams(action, index) {
  const teams = setup.teams;
  if (action === 'team-add') {
    const color = colors.find(candidate => !teams.some(team => team.color.toLowerCase() === candidate.toLowerCase()));
    teams.push({ name: '', color: color || colors[teams.length] });
  } else if (action === 'team-remove') {
    teams.splice(index, 1);
  } else {
    const target = index + (action === 'team-up' ? -1 : 1);
    [teams[index], teams[target]] = [teams[target], teams[index]];
  }
  save(setupKey, setup);
  render();
  if (action === 'team-add') app.querySelector(`[data-field=name][data-index="${teams.length - 1}"]`).focus();
}

function toggleTopic(id) {
  step(() => {
    const index = game.topics.indexOf(id);
    if (index === -1) game.topics.push(id);
    else game.topics.splice(index, 1);
  });
}

function stakePreset(value) {
  const [id, ratio] = value.split(':').map(Number);
  const team = game.teams.find(item => item.id === id);
  const field = document.querySelector(`[name="team-${id}"]`);
  field.value = Math.max(1, Math.floor(team.score * ratio));
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function beginFinal() {
  step(() => {
    game.stage = 'stakes';
    view = game.stage;
  });
}

const actions = {
  'team-add': editTeams,
  'team-remove': editTeams,
  'team-up': editTeams,
  'team-down': editTeams,
  start: () => {
    const saved = read(sessionKey)?.game;
    if (saved && saved.stage !== 'results') openOverlay('replace');
    else startGame();
  },
  'confirm-start': startGame,
  resume,
  lobby: () => go('lobby'),
  board: () => go('board'),
  final: () => game.played.length === 25 ? go('topics') : openOverlay('final'),
  'confirm-final': () => go('topics'),
  topic: (_, __, id) => toggleTopic(id),
  'begin-final': beginFinal,
  'stake-preset': (_, __, value) => stakePreset(value),
  question: (_, __, id) => openQuestion(id),
  'cat-pass': (_, id) => passCat(id),
  'pick-judge': (_, id) => pickJudge(id),
  'judge-correct': (_, id) => judge(id, true),
  'judge-wrong': (_, id) => judge(id, false),
  'timer-toggle': toggleTimer,
  'timer-reset': resetTimer,
  reveal,
  'close-question': closeQuestion,
  undo,
  adjust: (_, id) => openOverlay('adjust', id),
  'score-menu': () => openOverlay('score-menu'),
  'set-chooser': (_, id) => {
    overlay = null;
    step(() => { game.chooser = id; });
  },
  cheat: () => openOverlay('cheat'),
  'close-overlay': closeOverlay,
  'print-cheat': () => printReport(true),
  'print-results': () => printReport(false),
  export: exportResults,
  fullscreen: () => {
    const operation = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    operation?.catch(() => {});
  },
};

document.addEventListener('click', event => {
  const target = event.target.closest('button[data-action]');
  if (!target || target.disabled) return;
  unlockAudio();
  const { action, value } = target.dataset;
  actions[action](action, Number(value), value);
});

document.addEventListener('input', event => {
  const { field, index } = event.target.dataset;
  const { value, checked } = event.target;
  if (!field) return;
  if (field === 'stake') {
    game.draft[index] = value;
    document.querySelector('#stake-error').textContent = '';
    persist();
    return;
  }
  if (field === 'name' || field === 'color') setup.teams[index][field] = value;
  else if (field === 'sound') setup.sound = checked;
  else setup[field] = Number(value);
  save(setupKey, setup);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'stake-form') {
    event.preventDefault();
    unlockAudio();
    lockStakes();
  }
  if (event.target.id === 'score-form') {
    event.preventDefault();
    const amount = event.target.elements.score.valueAsNumber;
    const operation = event.submitter?.value || 'set';
    const team = game.teams.find(item => item.id === overlay.id);
    const before = team.score;
    const after = operation === 'set' ? amount : before + (operation === 'add' ? amount : -amount);
    overlay = null;
    step(() => {
      team.score = after;
      game.log.push({ team: team.id, delta: after - before, reason: 'manual' });
    });
  }
});

modal.addEventListener('cancel', event => {
  event.preventDefault();
  if (overlay) closeOverlay();
  else if (game.active.round === 1 || game.active.revealed) closeQuestion();
});

document.addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || event.target.matches('input, select, textarea')) return;
  const key = event.key.toLowerCase();
  if (event.ctrlKey) {
    if (key === 'z' && view !== 'lobby' && !overlay) {
      event.preventDefault();
      undo();
    }
    return;
  }
  if (overlay || game?.active?.phase !== 'question' || view === 'lobby' || event.repeat) return;
  if (key === ' ') {
    event.preventDefault();
    unlockAudio();
    toggleTimer();
  }
  if (key === 'r') resetTimer();
  if (key === 'enter' && !event.target.closest('button')) {
    event.preventDefault();
    reveal();
  }
});

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing');
  printSheet.innerHTML = '';
});

render();
setInterval(updateClock, 120);
