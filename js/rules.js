'use strict';
// Правила игры: открытие вопроса, судейство, подсчёт очков.

function currentQuestion(active = game.active) {
  const [topicId, index] = active.id.split(':');
  const bank = activeBank();
  const list = active.round === 1 ? bank.round1 : bank.round2;
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
    if (!Number.isSafeInteger(stake) || stake < 1 || stake > maxStake(team)) {
      document.querySelector('#stake-error').textContent = `${team.name}: введите целую ставку от 1 до ${maxStake(team).toLocaleString('ru-RU')}.`;
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
  fx.verdict(correct);
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

// В первом раунде после ответа окно само возвращается к табло через 10 секунд.
const autoCloseSeconds = 10;
let autoCloseAt = null;

function autoClose() {
  const active = game?.active;
  const waiting = view === 'board' && !overlay && active?.round === 1 && active.phase === 'question' && active.locked;
  if (!waiting) {
    autoCloseAt = null;
    return;
  }
  autoCloseAt ??= Date.now() + autoCloseSeconds * 1000;
  const left = Math.max(0, Math.ceil((autoCloseAt - Date.now()) / 1000));
  const closeButton = modal.querySelector('[data-action=close-question]');
  if (closeButton) closeButton.textContent = `К табло · ${left}`;
  if (left === 0) {
    autoCloseAt = null;
    closeQuestion();
  }
}

// Ставки делают только команды со счётом выше нуля. Если такая команда одна или их нет, финал не нужен:
// единственная команда со ставками побеждает досрочно.
function finalDecided() {
  return game.teams.filter(team => team.score > 0).length <= 1;
}

function finishEarly() {
  const bettors = game.teams.filter(team => team.score > 0);
  game.endedEarly = true;
  game.earlyReason = bettors.length === 1 ? 'sole' : 'none';
  game.earlyWinner = bettors.length === 1 ? bettors[0].id : null;
  game.active = null;
  game.stage = 'results';
  view = 'results';
}

// Салют победителю после досрочного завершения. Если лидера нет (ничья), показываем только итоги.
function showVictory() {
  if (!game.endedEarly || view !== 'results') return;
  const first = rankings().filter(team => team.place === 1);
  if (first.length !== 1) return;
  openOverlay('victory', first[0].id);
  fx.aimModal();
  fx.fireworks(first[0].color);
  sound('win');
}

// Переход к финалу: если ставить может не больше одной команды, сразу объявляем победителя.
function enterFinal() {
  overlay = null;
  if (finalDecided()) {
    step(finishEarly);
    showVictory();
  } else {
    go('topics');
  }
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
      if (game.finalIndex === topicTotal() * 3) {
        view = 'results';
        game.stage = view;
      } else if (finalDecided()) {
        finishEarly();
      }
    }
    game.active = null;
    if (active.round === 1 && game.played.length === 25 && finalDecided()) finishEarly();
  });
  showVictory();
  if (active.round === 1 && game.played.length === 25 && view === 'board') {
    sound('correct');
    openOverlay('final-intro');
    fx.aimModal();
  }
}
