'use strict';
// Разметка экранов: лобби, правила, табло, финал, итоги.

function button(label, action, options = {}) {
  const { value, style = '', disabled = false, title, pressed } = options;
  return `<button type="button" class="btn ${style}" data-action="${action}"${value === undefined ? '' : ` data-value="${esc(value)}"`}${disabled ? ' disabled' : ''}${title ? ` aria-label="${esc(title)}" title="${esc(title)}"` : ''}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${label}</button>`;
}

function title(label, heading, actions = '') {
  return `<header class="titlebar"><div><div class="eyebrow">${label}</div><h1>${heading}</h1></div><div class="actions">${actions}</div></header>`;
}

function lobby() {
  const saved = savedSession()?.game;
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
    <div class="eyebrow">Школьный турнир · ${setup.bank ? 'свой набор вопросов' : setup.grade + ' класс'}</div>
    <h1>Своя <span>игра</span></h1>
    <p>Настройте команды и проведите турнир на большом экране.</p>
  </section>
  <div class="lobby-grid">
    <section class="panel">
      <div class="panel-heading"><div><h2>Команды</h2><p class="muted small">Задайте названия, цвета и порядок команд.</p></div><span class="count">${setup.teams.length} / ${maxTeams}</span></div>
      <div class="group-builder">
        <label class="setting"><span><strong>Количество команд</strong><small id="team-count-note">От 2 до ${maxTeams}. Максимум — ${maxTeams} команд</small></span><input type="number" data-field="teamCount" min="2" max="${maxTeams}" step="1" inputmode="numeric" value="${setup.teams.length}" aria-label="Количество команд, не больше ${maxTeams}"></label>
        <label class="setting"><span><strong>Класс</strong><small>Например, 9А. Класс делится на группы</small></span><input type="text" data-field="className" maxlength="20" value="${esc(setup.className)}" placeholder="9А" aria-label="Название класса"></label>
        <label class="setting"><span><strong>Групп в классе</strong><small>Каждая группа — отдельная команда</small></span><select data-field="groups" aria-label="Количество групп">${[2, 3, 4, 5].map(count => `<option value="${count}" ${setup.groups === count ? 'selected' : ''}>${count}</option>`).join('')}</select></label>
        ${button(icon('people') + ' Разделить класс на группы', 'make-groups', { style: 'btn-wide btn-ghost' })}
      </div>
      ${setup.teams.length ? `<div class="team-list">${setup.teams.map(row).join('')}</div>` : ''}
      ${button(icon('plus') + ' Добавить команду', 'team-add', { style: 'btn-ghost', disabled: setup.teams.length >= maxTeams })}
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h2>Настройки игры</h2><p class="muted small">Для обоих раундов</p></div></div>
      <label class="setting"><span><strong>Таймер</strong><small>От 5 до 180 секунд</small></span><input type="number" data-field="seconds" min="5" max="180" value="${esc(setup.seconds)}" aria-label="Длительность таймера в секундах"></label>
      <label class="setting"><span><strong>Звуковые эффекты</strong><small>Сигналы таймера и судейства</small></span><input type="checkbox" data-field="sound" ${setup.sound ? 'checked' : ''}></label>
      <label class="setting"><span><strong>Верный ответ в финале</strong><small>При ошибке ставка вычитается</small></span><select data-field="multiplier"><option value="2" ${setup.multiplier === 2 ? 'selected' : ''}>+2 × ставка</option><option value="1" ${setup.multiplier === 1 ? 'selected' : ''}>+1 × ставка</option></select></label>
      <label class="setting"><span><strong>Класс</strong><small>${setup.bank ? 'Загружен свой набор, класс не влияет' : 'От класса зависят вопросы'}</small></span><select data-field="grade" ${setup.bank ? 'disabled' : ''} aria-label="Класс, для которого подбираются вопросы">${gradeNumbers.map(grade => `<option value="${grade}" ${setup.grade === grade ? 'selected' : ''} ${hasGradeBank(grade) ? '' : 'disabled'}>${grade} класс${hasGradeBank(grade) ? '' : ' · скоро'}</option>`).join('')}</select></label>
      <div class="setting question-bank">
        <span><strong>Набор вопросов</strong><small>${esc(activeBank().name)}</small></span>
        <div class="actions">
          ${button('Загрузить вопросы', 'import-bank', { style: 'btn-ghost' })}
          ${setup.bank ? button('Вернуть демо', 'use-demo', { style: 'btn-ghost' }) : ''}
        </div>
      </div>
      ${button(icon('book') + ' Шпаргалка судьи · Печать / PDF', 'cheat', { style: 'btn-wide btn-ghost' })}
    </section>
  </div>
  ${fileNotice ? `<p class="file-notice ${fileNotice.error ? 'warning' : 'muted'}" role="${fileNotice.error ? 'alert' : 'status'}">${esc(fileNotice.text)}</p>` : ''}
  <div class="lobby-actions">
    ${button('Загрузить игру', 'import-backup', { style: 'btn-ghost' })}
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
      <span class="name">${esc(team.name)}</span><span class="score ${team.score < 0 ? 'negative' : ''}" data-team="${team.id}" data-value="${team.score}">${team.score.toLocaleString('ru-RU')}</span>
    </button>`).join('')}</div>`;
}

function board() {
  const remaining = 25 - game.played.length;
  const toolbar = button('Отменить', 'undo', { disabled: !history.length })
    + button('Редактировать счёт', 'score-menu')
    + button('Финал ' + icon('arrow'), 'final', { style: 'btn-primary' });
  return title('Раунд 1', 'Игровое табло', `<span class="count" aria-label="Осталось вопросов">${remaining} / 25 осталось</span>${toolbar}`)
    + `<div class="board" aria-label="Вопросы первого раунда">${activeBank().round1.map((topic, row) => `
      <div class="board-label" style="--i:${row}">${esc(topic.title)}</div>${topic.questions.map((question, index) => {
        const id = `${topic.id}:${index}`;
        const played = game.played.includes(id);
        return `<button type="button" class="board-cell" data-action="question" data-value="${id}" style="--i:${row + index}" ${played ? 'disabled' : ''} aria-label="${esc(topic.title)}, ${question.points}${played ? ', сыграно' : ''}">${played ? '—' : question.points}</button>`;
      }).join('')}`).join('')}</div>${scoreCards(true)}`;
}

function topicSelection() {
  return title('Раунд 2 · Финал', 'Выбор финальных тем', `<span class="count">${game.topics.length} / ${topicTotal()} выбрано</span>`)
    + `<p class="muted">Пусть каждая команда выберет по одной теме: всего ${topicTotal()} ${plural(topicTotal(), ['тема', 'темы', 'тем'])}. В финале темы прозвучат в порядке выбора.</p>
      <div class="topic-grid">${activeBank().round2.map(topic => {
        const index = game.topics.indexOf(topic.id);
        return button(`<span class="topic-tag">${index >= 0 ? index + 1 : icon('plus')}</span><span>${esc(topic.title)}</span>`,
          'topic', { value: topic.id, style: `topic ${index >= 0 ? 'selected' : ''}`, pressed: index >= 0, disabled: index < 0 && game.topics.length === topicTotal() });
      }).join('')}</div>
      <div class="actions">${button('К табло', 'board', { style: 'btn-ghost' })}${button('Перейти к финальным вопросам ' + icon('arrow'), 'begin-final', { style: 'btn-primary', disabled: game.topics.length !== topicTotal() })}</div>${scoreCards()}`;
}

function finalPosition() {
  const topicIndex = Math.floor(game.finalIndex / 3);
  return { topic: activeBank().round2.find(item => item.id === game.topics[topicIndex]), topicIndex, questionIndex: game.finalIndex % 3 };
}

function stakePage() {
  const { topic, topicIndex, questionIndex } = finalPosition();
  return title(`Финал · Тема ${topicIndex + 1} из ${topicTotal()}`, esc(topic.title), `<span class="count">Вопрос ${questionIndex + 1} / 3</span>${button('Отменить', 'undo', { disabled: !history.length })}`)
    + `<p class="muted">Введите ставки команд до открытия вопроса. Верный ответ даёт ${game.multiplier === 2 ? 'двойную ставку' : 'сумму ставки'}, ошибка списывает её.</p>
    <form id="stake-form" novalidate><div class="stake-grid">${game.teams.map(team => `<section class="panel stake-card" style="--team:${esc(team.color)}">
      <h2>${esc(team.name)}</h2><p class="muted">Счёт · ${team.score.toLocaleString('ru-RU')} баллов${maxStake(team) < team.score ? ` · лимит ставки ${maxStake(team).toLocaleString('ru-RU')}` : ''}</p>
      ${team.score > 0
        ? `<input type="number" name="team-${team.id}" data-field="stake" data-index="${team.id}" min="1" max="${maxStake(team)}" step="1" required value="${esc(game.draft[team.id] ?? '')}" placeholder="От 1 до ${maxStake(team)}" aria-label="Ставка команды ${esc(team.name)}">
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
    <div class="eyebrow">${team.place} место</div><h2>${esc([team, ...tied].map(entry => entry.name).join(', '))}</h2><span class="score" data-count="${team.score}">${team.score.toLocaleString('ru-RU')}</span>
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

function earlyNotice() {
  if (!game.endedEarly) return '';
  const winners = rankings().filter(team => team.place === 1).map(team => esc(team.name)).join(', ');
  const sole = game.earlyReason === 'sole';
  return `<section class="panel early-note" role="status"><div class="eyebrow">Финал не состоялся</div>
    <p>${sole ? 'Ставки может делать только одна команда, поэтому она побеждает досрочно.' : 'Ставки недоступны: ни у одной команды не осталось очков. Игра завершена досрочно.'}</p>
    <p class="early-winner">Победитель · <strong>${winners}</strong></p></section>`;
}

function results() {
  return title('Турнир завершён' + (game.className ? ' · ' + esc(game.className) : ''), 'Итоги турнира', button('Отменить', 'undo', { disabled: !history.length })
    + button('Скачать JSON', 'export') + button('Печать / PDF', 'print-results', { style: 'btn-primary' }))
    + earlyNotice() + resultsContent() + `<div class="lobby-actions">${button('В лобби', 'lobby', { style: 'btn-ghost' })}</div>`;
}

const pages = { lobby, briefing, board, topics: topicSelection, stakes: stakePage, results };

function render() {
  const entering = renderedView !== view;
  app.innerHTML = `<div class="shell${entering ? ' entering' : ''}" data-view="${view}"><div class="topbar">
    <div class="brand"><span class="brand-mark">${icon('bolt')}</span>Своя игра</div>
    <div class="top-actions"><span class="offline small">Автономный режим</span>
      ${button('Дизайн: ' + themes[setup.theme], 'theme', { style: 'btn-ghost small', title: 'Сменить оформление' })}
      ${view === 'lobby' ? '' : button('Сохранить игру', 'save-backup', { style: 'btn-ghost small' })}
      ${button(icon('full'), 'fullscreen', { style: 'icon-button btn-ghost', title: 'Полноэкранный режим' })}
    </div>
  </div><main>${pages[view]()}</main>
  <p class="warning small" id="storage-warning" ${storageFailed ? '' : 'hidden'}>Браузер ограничил автосохранение. Прогресс доступен до закрытия страницы.</p></div>`;
  renderModal();
  if (entering) {
    renderedView = view;
    window.scrollTo(0, 0);
  }
  fx.scores(entering);
  if (entering && view === 'results' && !game.endedEarly) fx.celebrate();
}
