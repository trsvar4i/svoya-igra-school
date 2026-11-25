'use strict';
// Обработчики кликов, форм и клавиш; запуск приложения.

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

// Задаёт число команд от 2 до максимума: лишние убираются с конца, недостающие добавляются.
function setTeamCount(raw) {
  const wanted = Math.round(Number(raw));
  const count = Math.min(maxTeams, Math.max(2, Number.isFinite(wanted) ? wanted : setup.teams.length));
  while (setup.teams.length > count) setup.teams.pop();
  while (setup.teams.length < count) {
    const color = colors.find(candidate => !setup.teams.some(team => team.color.toLowerCase() === candidate.toLowerCase()));
    setup.teams.push({ name: '', color: color || colors[setup.teams.length % colors.length] });
  }
  save(setupKey, setup);
  render();
}

// Выбор класса: набор вопросов подгружается из banks/grade-N.js.
async function changeGrade(grade) {
  const bank = await loadGradeBank(grade);
  if (bank) {
    setup.grade = grade;
    fileNotice = { text: `Выбран ${grade} класс: ${bank.name}.` };
  } else {
    fileNotice = { text: `Для ${grade} класса набора пока нет. Загрузите свой JSON.`, error: true };
  }
  save(setupKey, setup);
  render();
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
  field.value = Math.max(1, Math.floor(maxStake(team) * ratio));
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function beginFinal() {
  step(() => {
    game.stakeCap = stakeCeiling();
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
    const saved = savedSession()?.game;
    if (saved && saved.stage !== 'results') openOverlay('replace');
    else startGame();
  },
  'confirm-start': startGame,
  'confirm-restore': () => loadSession(overlay.id),
  'save-backup': exportBackup,
  'import-bank': () => selectJson('bank'),
  'import-backup': () => selectJson('backup'),
  'use-demo': () => setBank(null, 'Выбран демонстрационный набор.'),
  resume,
  lobby: () => go('lobby'),
  board: () => go('board'),
  final: () => game.played.length === 25 ? enterFinal() : openOverlay('final'),
  'confirm-final': enterFinal,
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
  'make-groups': () => {
    const label = setup.className.trim();
    setup.teams = Array.from({ length: setup.groups }, (_, index) => ({
      name: label ? `${label} · группа ${index + 1}` : `Группа ${index + 1}`, color: colors[index],
    }));
    save(setupKey, setup);
    render();
  },
  theme: () => {
    const names = Object.keys(themes);
    setup.theme = names[(names.indexOf(setup.theme) + 1) % names.length];
    document.documentElement.dataset.theme = setup.theme;
    save(setupKey, setup);
    render();
  },
  fullscreen: () => {
    const operation = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    operation?.catch(() => {});
  },
};

document.addEventListener('click', event => {
  const target = event.target.closest('button[data-action]');
  if (!target || target.disabled) return;
  unlockAudio();
  fx.origin = target.getBoundingClientRect();
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
  if (field === 'teamCount') {
    // Больше максимума ввести нельзя: число сразу исправляется, подсказка подсвечивается.
    if (Number(value) > maxTeams || value.length > 2) {
      event.target.value = maxTeams;
      const note = document.querySelector('#team-count-note');
      note?.classList.add('limit-hit');
      setTimeout(() => note?.classList.remove('limit-hit'), 1600);
    }
    return;
  }
  if (field === 'grade') {
    changeGrade(Number(value));
    return;
  }
  if (field === 'className') setup.className = value;
  else if (field === 'name' || field === 'color') setup.teams[index][field] = value;
  else if (field === 'sound') setup.sound = checked;
  else setup[field] = Number(value);
  save(setupKey, setup);
});

document.addEventListener('change', event => {
  if (event.target.dataset.field === 'teamCount') setTeamCount(event.target.value);
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
setInterval(() => {
  updateClock();
  autoClose();
}, 120);
