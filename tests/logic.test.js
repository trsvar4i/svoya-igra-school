'use strict';
// Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const bankFiles = fs.readdirSync(path.join(root, 'banks')).filter(name => /^grade-\d+\.js$/.test(name)).map(name => 'banks/' + name);
const source = ['questions.js', ...bankFiles, 'session-files.js']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const api = vm.runInNewContext(`${source}\n({ demoBank, gradeBanks, gradeNumbers, hasGradeBank, readQuestionBank, readGameBackup, uniqueTeamNames, validImagePath })`, {});
const { demoBank, gradeBanks, gradeNumbers, hasGradeBank, readQuestionBank, readGameBackup, uniqueTeamNames, validImagePath } = api;
const clone = value => JSON.parse(JSON.stringify(value));

function newGame(bank = demoBank) {
  return {
    stage: 'board',
    teams: ['A', 'B'].map((name, id) => ({ id, name, color: '#00e5ff', score: 0, correct: 0, wrong: 0, bestWin: 0 })),
    seconds: 30, sound: true, multiplier: 2, chooser: 0, played: [], active: null,
    topics: [], finalIndex: 0, draft: {}, log: [],
  };
}
const backup = (game, bank = demoBank) => ({ format: 'svoya-igra-backup', version: 1, game, history: [], bank: clone(bank) });

test('демо-набор проходит собственную проверку', () => {
  const bank = readQuestionBank(clone(demoBank));
  assert.equal(bank.round1.length, 5);
  assert.equal(bank.round2.length, 10);
  assert.deepEqual(bank.round1[0].questions.map(q => q.points), [200, 400, 600, 800, 1000]);
});

test('локальный турнирный набор (если есть) валиден', t => {
  const file = path.join(root, 'турнирные-вопросы.json');
  if (!fs.existsSync(file)) return t.skip('файла нет');
  assert.doesNotThrow(() => readQuestionBank(JSON.parse(fs.readFileSync(file, 'utf8'))));
});

test('набор отклоняется при неверной структуре', () => {
  const broken = mutate => { const bank = clone(demoBank); mutate(bank); return bank; };
  assert.throws(() => readQuestionBank(null));
  assert.throws(() => readQuestionBank(broken(b => { b.version = 2; })));
  assert.throws(() => readQuestionBank(broken(b => { b.round1.pop(); })), /тем/);
  assert.throws(() => readQuestionBank(broken(b => { b.round1[0].questions.pop(); })), /вопросов/);
  assert.throws(() => readQuestionBank(broken(b => { b.round1[1].id = b.round1[0].id; })), /id/);
  assert.throws(() => readQuestionBank(broken(b => { b.round1[0].questions[0].answer = ' '; })));
  assert.throws(() => readQuestionBank(broken(b => { b.round1.flatMap(t => t.questions).forEach(q => { q.isCatInBag = false; }); })), /три/);
});

test('картинки: допускаются только файлы из assets', () => {
  assert.ok(validImagePath('assets/map.png'));
  assert.ok(validImagePath('assets/img/карта.JPG'));
  for (const bad of ['../secret.png', 'assets/../x.png', 'http://evil/x.png', 'javascript:alert(1)', 'assets/x.gif', '/assets/x.png', 'assets/', 42]) {
    assert.equal(validImagePath(bad), false, String(bad));
  }
  const bank = clone(demoBank);
  bank.round1[0].questions[0].image = 'assets/map.png';
  bank.round1[0].questions[0].imageAlt = 'Карта';
  const read = readQuestionBank(bank);
  assert.equal(read.round1[0].questions[0].image, 'assets/map.png');
  bank.round1[0].questions[1].image = 'https://evil.example/x.png';
  assert.throws(() => readQuestionBank(bank), /assets/);
});

test('названия команд делаются уникальными', () => {
  assert.deepEqual(uniqueTeamNames(['', ' ', 'Орлы', 'орлы', 'Орлы']), ['Команда 1', 'Команда 2', 'Орлы', 'орлы (2)', 'Орлы (3)']);
});

test('сохранение: корректное принимается', () => {
  const saved = readGameBackup(backup(newGame()));
  assert.equal(saved.game.teams.length, 2);
});

test('сохранение: повреждённые данные отклоняются', () => {
  const bad = mutate => { const file = backup(newGame()); mutate(file); return file; };
  assert.throws(() => readGameBackup({ format: 'x' }));
  assert.throws(() => readGameBackup(bad(f => { f.game.teams[0].score = 1.5; })));
  assert.throws(() => readGameBackup(bad(f => { f.game.teams.pop(); })));
  assert.throws(() => readGameBackup(bad(f => { f.game.chooser = 7; })));
  assert.throws(() => readGameBackup(bad(f => { f.game.played = ['nope:0']; })));
  assert.throws(() => readGameBackup(bad(f => { f.game.stage = 'results'; })));
  assert.throws(() => readGameBackup(bad(f => { f.game.seconds = 1; })));
  assert.throws(() => readGameBackup(bad(f => { f.history = Array(11).fill(f.game); })));
  assert.throws(() => readGameBackup(bad(f => { f.game.active = { round: 1, id: 'math:0', phase: 'question', locked: false, revealed: false, marks: {}, timer: { end: 5, remaining: 1 } }; })));
});

test('сохранение: открытый вопрос с паузой принимается', () => {
  const game = newGame();
  game.active = { round: 1, id: 'math:0', phase: 'question', recipient: null, answering: null, locked: false, revealed: false, marks: {}, timer: { end: null, remaining: 12000 } };
  assert.doesNotThrow(() => readGameBackup(backup(game)));
});

test('финал: число тем равно числу команд', () => {
  const game = newGame();
  game.topicCount = 2;
  assert.doesNotThrow(() => readGameBackup(backup(game)));
  game.stage = 'results';
  game.topics = ['crypto', 'paradox'];
  game.finalIndex = 6;
  assert.doesNotThrow(() => readGameBackup(backup(game)));
  game.finalIndex = 9;
  assert.throws(() => readGameBackup(backup(game)));
  const mismatch = newGame();
  mismatch.topicCount = 3;
  assert.throws(() => readGameBackup(backup(mismatch)));
});

test('старые сохранения без topicCount считаются финалом из трёх тем', () => {
  const game = newGame();
  game.stage = 'results';
  game.topics = ['crypto', 'paradox', 'extremes'];
  game.finalIndex = 9;
  assert.doesNotThrow(() => readGameBackup(backup(game)));
});

test('досрочное завершение: результаты без финала допускаются только с отметкой', () => {
  const game = newGame();
  game.stage = 'results';
  assert.throws(() => readGameBackup(backup(game)));
  game.endedEarly = true;
  assert.doesNotThrow(() => readGameBackup(backup(game)));
  game.endedEarly = 'да';
  assert.throws(() => readGameBackup(backup(game)));
});

test('наборы по классам проходят проверку формата', () => {
  assert.deepEqual([...gradeNumbers], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  for (const grade of gradeNumbers) {
    assert.ok(hasGradeBank(grade), 'нет набора для ' + grade);
    const bank = gradeBanks[grade];
    assert.doesNotThrow(() => readQuestionBank(clone(bank)), 'класс ' + grade);
    assert.match(bank.name, new RegExp(String(grade)));
  }
});

test('сохранение: класс и название класса проверяются', () => {
  const game = newGame();
  game.grade = 10;
  game.className = '10Б';
  assert.doesNotThrow(() => readGameBackup(backup(game, gradeBanks[10])));
  game.grade = 12;
  assert.throws(() => readGameBackup(backup(game)));
  game.grade = 10;
  game.className = 'x'.repeat(21);
  assert.throws(() => readGameBackup(backup(game)));
});

test('каждый набор: уникальные вопросы внутри класса и ответы без пустых полей', () => {
  for (const grade of gradeNumbers) {
    const bank = gradeBanks[grade];
    const all = [...bank.round1, ...bank.round2].flatMap(topic => topic.questions);
    assert.equal(all.length, 55, 'класс ' + grade);
    const texts = all.map(item => item.question);
    assert.equal(new Set(texts).size, texts.length, 'повторяющийся вопрос в классе ' + grade);
    for (const item of all) assert.ok(!/[­​]/.test(item.question + item.answer + item.note), 'служебный символ в классе ' + grade);
  }
});

test('потолок ставки: сохранённая ставка не может быть больше stakeCap', () => {
  const make = (stake, cap) => {
    const game = newGame();
    game.topicCount = 2;
    game.stage = 'stakes';
    game.topics = ['crypto', 'paradox'];
    game.stakeCap = cap;
    game.active = { round: 2, id: 'crypto:0', phase: 'question', stakes: { 0: stake }, marks: {}, revealed: false, locked: false, timer: { end: null, remaining: 1000 } };
    return backup(game);
  };
  assert.doesNotThrow(() => readGameBackup(make(500, 500)));
  assert.throws(() => readGameBackup(make(501, 500)));
  assert.throws(() => readGameBackup(make(5, 0)));
});

test('до 10 команд, досрочная победа единственной команды со ставками', () => {
  const ten = newGame();
  ten.teams = Array.from({ length: 10 }, (_, id) => ({ id, name: 'К' + id, color: '#00e5ff', score: 0, correct: 0, wrong: 0, bestWin: 0 }));
  ten.topicCount = 10;
  ten.chooser = 9;
  assert.doesNotThrow(() => readGameBackup(backup(ten)));
  const eleven = clone(ten);
  eleven.teams.push({ id: 10, name: 'К10', color: '#00e5ff', score: 0, correct: 0, wrong: 0, bestWin: 0 });
  eleven.topicCount = 11;
  assert.throws(() => readGameBackup(backup(eleven)));

  const early = newGame();
  early.stage = 'results';
  early.endedEarly = true;
  early.earlyReason = 'sole';
  early.earlyWinner = 1;
  assert.doesNotThrow(() => readGameBackup(backup(early)));
  early.earlyReason = 'other';
  assert.throws(() => readGameBackup(backup(early)));
  early.earlyReason = 'sole';
  early.earlyWinner = 5;
  assert.throws(() => readGameBackup(backup(early)));
});
