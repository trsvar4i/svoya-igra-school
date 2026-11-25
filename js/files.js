'use strict';
// Файлы: сохранение игры, загрузка наборов и протокол итогов.

function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
  updateClock();
  const time = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  downloadJson({ format: 'svoya-igra-backup', version: 1, game: snapshot(), history, bank: activeBank() }, `своя-игра-сохранение-${time}.json`);
}

function selectJson(kind) {
  openJson.dataset.kind = kind;
  openJson.click();
}

function setBank(bank, message) {
  setup.bank = bank;
  save(setupKey, setup);
  fileNotice = { text: message };
  render();
}

openJson.addEventListener('change', async () => {
  const [file] = openJson.files;
  const kind = openJson.dataset.kind;
  openJson.value = '';
  if (!file) return;
  try {
    requireFile(file.size <= 2_000_000, 'Файл слишком большой. Выберите набор вопросов или сохранение игры.');
    const data = JSON.parse(await file.text());
    if (view !== 'lobby') return;
    if (kind === 'bank') {
      const bank = readQuestionBank(data);
      setBank(bank, `Загружен набор «${bank.name}».`);
      return;
    }
    const saved = readGameBackup(data);
    if (savedSession()?.game) openOverlay('restore', saved);
    else loadSession(saved);
  } catch (error) {
    const text = error instanceof SyntaxError ? 'Файл не читается как JSON. Выберите исходный файл без изменений.' : error.message;
    fileNotice = { text, error: true };
    if (view === 'lobby') render();
  }
});

function exportResults() {
  const protocol = {
    tournament: `Своя игра · ${game.grade ?? 9} класс`,
    className: game.className || null,
    grade: game.grade ?? 9,
    date: new Date().toISOString(),
    settings: { seconds: game.seconds, finalMultiplier: game.multiplier },
    topics: game.topics.map(id => activeBank().round2.find(topic => topic.id === id).title),
    standings: rankings(),
    actions: game.log,
  };
  downloadJson(protocol, 'итоги-своя-игра.json');
}
