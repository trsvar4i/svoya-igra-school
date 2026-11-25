'use strict';

const maxTeams = 10;

function requireFile(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validImagePath(value) {
  return typeof value === 'string' && value.length <= 120 && !value.includes('..')
    && /^assets\/[\wЀ-ӿ][\wЀ-ӿ./-]*\.(png|jpe?g|webp|svg)$/i.test(value);
}

// Пустые и повторяющиеся названия команд получают уникальные имена, чтобы счёт не путался.
function uniqueTeamNames(names) {
  const used = new Set();
  return names.map((raw, index) => {
    const base = String(raw ?? '').trim() || `Команда ${index + 1}`;
    let name = base;
    for (let copy = 2; used.has(name.toLowerCase()); copy++) name = `${base} (${copy})`;
    used.add(name.toLowerCase());
    return name;
  });
}

function readQuestionBank(file) {
  requireFile(file?.format === 'svoya-igra-questions' && file.version === 1, 'Выберите файл набора вопросов в формате версии 1.');
  const validText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  requireFile(validText(file.name, 80), 'Укажите название набора длиной до 80 символов.');

  function readRound(entries, topicCount, questionCount, firstRound) {
    const label = firstRound ? 'Первый раунд' : 'Финал';
    requireFile(Array.isArray(entries) && entries.length === topicCount, label + ' должен содержать тем: ' + topicCount + '.');
    const ids = new Set();
    return entries.map((topic, index) => {
      const position = label + ', тема ' + (index + 1);
      requireFile(typeof topic?.id === 'string' && /^[a-z][a-z0-9-]{0,29}$/.test(topic.id) && !ids.has(topic.id), position + '. Нужен уникальный id из латинских букв, цифр или дефисов.');
      ids.add(topic.id);
      requireFile(validText(topic.title, 80), position + '. Укажите название длиной до 80 символов.');
      requireFile(Array.isArray(topic.questions) && topic.questions.length === questionCount, position + '. Нужно вопросов: ' + questionCount + '.');
      return {
        id: topic.id,
        title: topic.title.trim(),
        questions: topic.questions.map((item, index) => {
          requireFile(validText(item?.question, 350) && validText(item.answer, 220) && validText(item.note, 400), position + ', вопрос ' + (index + 1) + '. Укажите текст, ответ и пояснение.');
          const { question, answer, note } = item;
          const hasImage = item.image !== undefined;
          requireFile(!hasImage || validImagePath(item.image), position + ', вопрос ' + (index + 1) + '. Картинка должна лежать в папке assets (png, jpg, webp или svg).');
          requireFile(item.imageAlt === undefined || validText(item.imageAlt, 200), position + ', вопрос ' + (index + 1) + '. Описание картинки должно быть текстом до 200 символов.');
          const picture = hasImage ? { image: item.image, imageAlt: item.imageAlt } : {};
          return firstRound
            ? { question, answer, note, ...picture, points: pointValues[index], isCatInBag: item.isCatInBag === true }
            : { question, answer, note, ...picture, order: index + 1 };
        }),
      };
    });
  }

  const round1 = readRound(file.round1, 5, 5, true);
  const round2 = readRound(file.round2, 10, 3, false);
  const catCount = round1.reduce((total, topic) => total + topic.questions.filter(item => item.isCatInBag).length, 0);
  requireFile(catCount === 3, 'В первом раунде нужно отметить ровно три вопроса «Кот в мешке».');
  return { format: file.format, version: file.version, name: file.name.trim(), round1, round2 };
}

function readGameBackup(file) {
  requireFile(file?.format === 'svoya-igra-backup' && file.version === 1, 'Выберите файл сохранения «Своей игры» версии 1.');
  const { game, history } = file;
  requireFile(isRecord(file.bank), 'В файле сохранения отсутствует набор вопросов.');
  const bank = readQuestionBank(file.bank);
  const cardIds = new Set(bank.round1.flatMap(topic => topic.questions.map((_, index) => topic.id + ':' + index)));
  const topicIds = new Set(bank.round2.map(topic => topic.id));
  const stages = ['briefing', 'board', 'topics', 'stakes', 'results'];
  const isCount = value => Number.isSafeInteger(value) && value >= 0;

  function validState(state) {
    if (!isRecord(state) || !stages.includes(state.stage)) return false;
    const { teams, seconds, multiplier, sound, chooser, played, topics, finalIndex, draft, log, active } = state;
    const topicCount = state.topicCount ?? 3;
    if (state.stakeCap !== undefined && !(Number.isSafeInteger(state.stakeCap) && state.stakeCap >= 1)) return false;
    if (state.grade !== undefined && !(Number.isInteger(state.grade) && state.grade >= 1 && state.grade <= 11)) return false;
    if (state.className !== undefined && !(typeof state.className === 'string' && state.className.length <= 20)) return false;
    const early = state.endedEarly === true;
    if (state.earlyReason !== undefined && !['sole', 'none'].includes(state.earlyReason)) return false;
    if (state.earlyWinner != null && !(Number.isInteger(state.earlyWinner) && state.earlyWinner >= 0 && state.earlyWinner < (teams?.length ?? 0))) return false;
    if (state.endedEarly !== undefined && !early) return false;
    if (state.topicCount !== undefined && state.topicCount !== teams?.length) return false;
    if (!Array.isArray(teams) || teams.length < 2 || teams.length > maxTeams) return false;
    if (!teams.every((team, index) => team?.id === index && typeof team.name === 'string' && team.name.trim() && team.name.length <= 36
      && typeof team.color === 'string' && /^#[0-9a-f]{6}$/i.test(team.color) && Number.isSafeInteger(team.score)
      && isCount(team.correct) && isCount(team.wrong) && isCount(team.bestWin))) return false;
    const hasTeam = id => isCount(id) && id < teams.length;
    const teamRecord = (value, validValue) => isRecord(value) && Object.entries(value).every(([id, entry]) => /^\d$/.test(id) && hasTeam(Number(id)) && validValue(entry));
    const unique = (values, allowed, max) => Array.isArray(values) && values.length <= max && values.every(value => allowed.has(value)) && new Set(values).size === values.length;
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 180 || ![1, 2].includes(multiplier) || typeof sound !== 'boolean' || !hasTeam(chooser)) return false;
    if (!unique(played, cardIds, 25) || !unique(topics, topicIds, topicCount) || !isCount(finalIndex) || finalIndex > topicCount * 3) return false;
    if (state.stage === 'stakes' && (topics.length !== topicCount || finalIndex === topicCount * 3)) return false;
    if (state.stage === 'results' && !early && (topics.length !== topicCount || finalIndex !== topicCount * 3)) return false;
    if (!teamRecord(draft, value => typeof value === 'string' && value.length <= 64)) return false;
    if (!Array.isArray(log) || !log.every(entry => hasTeam(entry?.team) && Number.isSafeInteger(entry.delta))) return false;
    if (active === null) return true;
    if (!isRecord(active) || typeof active.locked !== 'boolean' || typeof active.revealed !== 'boolean') return false;
    if (!isRecord(active.timer) || active.timer.end !== null || !isCount(active.timer.remaining) || active.timer.remaining > seconds * 1000) return false;
    if (!teamRecord(active.marks, mark => isRecord(mark) && typeof mark.correct === 'boolean' && Number.isSafeInteger(mark.delta))) return false;
    if (active.round === 1) {
      return state.stage === 'board' && cardIds.has(active.id) && !played.includes(active.id)
        && ['pass', 'question'].includes(active.phase)
        && (active.recipient === null || hasTeam(active.recipient))
        && (active.answering == null || hasTeam(active.answering));
    }
    const finalCard = topics[Math.floor(finalIndex / 3)] + ':' + (finalIndex % 3);
    return active.round === 2 && state.stage === 'stakes' && active.phase === 'question' && active.id === finalCard
      && teamRecord(active.stakes, value => isCount(value) && value > 0 && value <= (state.stakeCap ?? Infinity))
      && Object.keys(active.marks).every(id => Object.hasOwn(active.stakes, id));
  }

  requireFile(validState(game) && Array.isArray(history) && history.length <= 10 && history.every(validState), 'Не удалось прочитать состояние игры. Выберите целый файл, скачанный через «Сохранить игру».');
  return { game, history, bank };
}
