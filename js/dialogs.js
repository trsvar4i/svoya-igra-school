'use strict';
// Модальные окна: вопрос, кот в мешке, шпаргалка, правка счёта, печать.

function dialogHeading(label, heading, close = true) {
  return `<div class="dialog-heading"><div><div class="eyebrow">${label}</div><h2 id="modal-title" tabindex="-1">${heading}</h2></div>
    ${close ? button('×', 'close-overlay', { style: 'btn-ghost icon-button', title: 'Закрыть окно' }) : ''}</div>`;
}

function catDialog() {
  const chooser = game.teams.find(team => team.id === game.chooser);
  return `<div class="dialog-body">${dialogHeading('Спецклетка', `<span class="cat-title">${icon('cat')} Кот в мешке!</span>`, false)}
    <p class="question-text">${esc(chooser.name)}, передайте вопрос другой команде.</p>
    <div class="actions">${game.teams.filter(team => team.id !== chooser.id).map(team => button(esc(team.name), 'cat-pass', { value: team.id, style: 'btn-primary judge-pick' })).join('')}</div>
    <div class="lobby-actions">${button('Сохранить игру', 'save-backup', { style: 'btn-ghost' })}${button('Вернуться к табло', 'close-question', { style: 'btn-ghost' })}</div></div>`;
}

function judgeControls(team) {
  const active = game.active;
  const mark = active.marks[team.id];
  const label = esc(team.name);
  if (mark) return `<span class="judge-group">${label} <span class="status ${mark.correct ? 'btn-good' : 'btn-bad'}">${mark.timeout ? 'Штраф ' : ''}${mark.correct ? '+' : '−'}${Math.abs(mark.delta)}</span></span>`;
  if (active.revealed || active.locked || !isEligible(team)) return '';
  if (active.round === 1 && active.answering !== team.id) {
    return timeLeft(active.timer) ? button(label, 'pick-judge', { value: team.id, style: 'judge-pick' }) : '';
  }
  return `<div class="judge-group ${active.round === 1 ? 'judge-active' : 'judge-final'}" style="--team:${esc(team.color)}">
    <strong>${active.round === 1 ? 'Отвечает · ' : ''}${label}</strong><div class="judge-buttons">
    ${button('+ Верно', 'judge-correct', { value: team.id, style: 'btn-good', title: `${team.name}, верный ответ` })}
    ${button('− Неверно', 'judge-wrong', { value: team.id, style: 'btn-bad', title: `${team.name}, неверный ответ` })}</div></div>`;
}

function questionDialog() {
  const active = game.active;
  const { topic, question } = currentQuestion();
  const isFinal = active.round === 2;
  const answerVisible = active.revealed || (!isFinal && active.locked);
  const subtitle = isFinal ? `Финал · Тема ${Math.floor(game.finalIndex / 3) + 1} из ${topicTotal()} · Вопрос ${question.order} из 3` : 'Раунд 1';
  const recipient = game.teams.find(team => team.id === active.recipient);
  const answering = game.teams.find(team => team.id === active.answering);
  const judgeButtons = game.teams.filter(team => team !== answering).map(judgeControls).join('');
  const latest = game.log.at(-1);
  const markedTeam = latest?.question === active.id && latest.round === active.round && Object.hasOwn(active.marks, latest.team)
    ? game.teams.find(team => team.id === latest.team) : null;
  const followUp = markedTeam && !isFinal && !answerVisible && !answering;
  return `<div class="timer-track"><div></div></div><div class="dialog-body">
    <div class="question-heading"><div>${dialogHeading(subtitle, `${esc(topic.title)} ${isFinal ? '' : `<span class="question-value">/ ${question.points}</span>`}`, false)}</div>
    <span class="count">Флажок передаётся по кругу</span></div>
    ${recipient ? `<p class="eyebrow">Кот в мешке · Отвечает ${esc(recipient.name)}</p>` : ''}
    <div class="timer-panel"><div class="inline"><span class="timer" role="timer"></span><span class="timer-status" role="status"></span></div><div class="actions">
      ${button('Старт', 'timer-toggle') + button('Сброс', 'timer-reset', { disabled: active.revealed || active.locked })}</div></div>
    <p class="question-text">${esc(question.question)}</p>
    ${question.image ? `<img class="question-image" src="${esc(question.image)}" alt="${esc(question.imageAlt || 'Иллюстрация к вопросу')}">` : ''}
    ${answerVisible ? `<div class="answer"><div class="eyebrow">Правильный ответ</div><strong>${esc(question.answer)}</strong><p class="muted">${esc(question.note)}</p></div>` : ''}
    ${markedTeam ? `<div class="judge-feedback" role="status">
      <strong class="${latest.delta > 0 ? 'btn-good' : 'btn-bad'}">${latest.delta > 0 ? '+' : '−'}${Math.abs(latest.delta).toLocaleString('ru-RU')}</strong>
      <span>${esc(markedTeam.name)}</span>${latest.reason === 'timeout' ? '<span class="muted">Штраф за таймаут</span>' : ''}
      ${followUp ? '<span class="judge-hint">Другая команда может ответить</span>' : ''}
    </div>` : ''}
    ${answering ? judgeControls(answering) : ''}
    ${judgeButtons ? `<div class="eyebrow">${isFinal || answerVisible ? 'Судейство' : (answering ? 'Сменить команду' : 'Кто поднял флажок?')}</div><div class="judge-actions">${judgeButtons}</div>` : ''}
    ${isFinal && !Object.keys(active.stakes).length ? '<p class="muted">У команд нет доступных ставок на этот вопрос.</p>' : ''}
    <div class="actions">
      ${isFinal && !answerVisible ? button('Показать правильный ответ', 'reveal', { style: 'btn-primary', disabled: !allJudged() }) : ''}
      ${answerVisible ? button(isFinal ? (game.finalIndex === topicTotal() * 3 - 1 ? 'К итогам' : 'Следующий вопрос') : 'К табло', 'close-question', { style: 'btn-primary' }) : ''}
    </div>
  </div>`;
}

function cheatContent() {
  const bank = activeBank();
  const tables = [bank.round1, bank.round2].map((round, index) => {
    const first = index === 0;
    return `<h2>Раунд ${index + 1} · ${first ? 'Основное табло' : 'Финал'}</h2>
      <div class="table-wrap cheat-table"><table><thead><tr><th>Тема</th><th>${first ? 'Номинал' : '№'}</th>${first ? '<th>Спецклетка</th>' : ''}<th>Вопрос</th><th>Ответ и пояснение</th></tr></thead><tbody>
      ${round.flatMap(topic => topic.questions.map(question => `<tr><td>${esc(topic.title)}</td><td>${first ? question.points : question.order}</td>
        ${first ? `<td>${question.isCatInBag ? 'Кот в мешке' : '—'}</td>` : ''}<td>${esc(question.question)}</td>
        <td><strong>${esc(question.answer)}</strong><small>${esc(question.note)}</small></td></tr>`)).join('')}
      </tbody></table></div>`;
  });
  return `<p class="bank-name">${esc(bank.name)}</p>${tables.join('')}`;
}

function overlayContent() {
  switch (overlay.type) {
    case 'cheat':
      return dialogHeading('Ведущему и судьям', 'Шпаргалка судьи') + `<div class="actions" style="margin-bottom:14px">${button('Печать / PDF', 'print-cheat', { style: 'btn-primary' })}</div>${cheatContent()}`;
    case 'final-intro': {
      const topics = topicTotal();
      const doubled = game.multiplier === 2;
      return `<div class="final-intro">${dialogHeading('Раунд 1 завершён', 'Все простые вопросы решены — <span class="hl">теперь финал!</span>', false)}
        <p class="muted">Перед каждым вопросом команды делают ставку из своих очков — от 1 до всего счёта, но не больше ${Math.max(1, ...game.teams.map(team => team.score)).toLocaleString('ru-RU')} (лучший счёт сейчас).</p>
        <div class="final-facts">
          <div class="fact"><b>${topics}</b><span>${plural(topics, ['тема', 'темы', 'тем'])} в финале — по одной на каждую команду. В каждой теме 3 вопроса.</span></div>
          <div class="fact good"><b>${doubled ? '×2' : '+'}</b><span>Верно — вы получаете ${doubled ? 'вдвое больше очков, чем поставили' : 'столько очков, сколько поставили'}.</span></div>
          <div class="fact bad"><b>−</b><span>Ошибка — поставленные очки списываются.</span></div>
        </div>
        <div class="lobby-actions">${button('К табло', 'close-overlay', { style: 'btn-ghost' })}${button('Выбрать темы ' + icon('arrow'), 'confirm-final', { style: 'btn-primary' })}</div></div>`;
    }
    case 'victory': {
      const team = game.teams.find(item => item.id === overlay.id);
      const reason = game.earlyReason === 'sole'
        ? 'Ставки может делать только эта команда, остальным нечем ставить. Финал не нужен.'
        : 'У остальных команд не осталось очков для ставок. Побеждает лучший счёт.';
      const letters = [...esc(team.name)].map((letter, index) => `<span style="--i:${index}">${letter === ' ' ? '&nbsp;' : letter}</span>`).join('');
      return `<div class="victory" style="--team:${esc(team.color)}">
        <div class="rays" aria-hidden="true"></div>
        <div class="trophy" aria-hidden="true">${icon('trophy')}</div>
        <div class="eyebrow">Досрочная победа</div>
        <h2 class="victory-name" id="modal-title" tabindex="-1">${letters}</h2>
        <p class="victory-reason">${reason}</p>
        <div class="victory-score"><span class="score" data-count="${team.score}">${team.score.toLocaleString('ru-RU')}</span><small>очков</small></div>
        <div class="lobby-actions">${button('К итогам ' + icon('arrow'), 'close-overlay', { style: 'btn-primary' })}</div>
      </div>`;
    }
    case 'replace':
      return dialogHeading('Новая игра', 'Заменить сохранённую игру?')
        + `<p class="muted">Счёт и сыгранные вопросы прошлой сессии будут заменены.</p>
        <div class="lobby-actions">${button('Вернуться', 'close-overlay')}${button('Начать новую игру', 'confirm-start', { style: 'btn-primary' })}</div>`;
    case 'restore':
      return dialogHeading('Загрузка игры', 'Заменить текущее сохранение?')
        + `<p class="muted">Игра из выбранного файла займёт место текущего автосохранения.</p>
        <div class="lobby-actions">${button('Отмена', 'close-overlay')}${button('Загрузить игру', 'confirm-restore', { style: 'btn-primary' })}</div>`;
    case 'final':
      return dialogHeading('Раунд 2', 'Перейти к выбору тем?')
        + `<p class="muted">На табло осталось вопросов: ${25 - game.played.length}. До выбора финальных тем можно вернуться к первому раунду.</p>
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
    fx.closeModal();
    return;
  }
  fx.keepModal();
  modal.dataset.kind = kind;
  modal.innerHTML = overlay ? `<div class="dialog-body">${overlayContent()}</div>` : (kind === 'cat' ? catDialog() : questionDialog());
  if (!modal.open) {
    fx.aimModal();
    modal.showModal();
  }
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
