'use strict';
// Таймер вопроса и звуковые сигналы.

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
    click: [490], tick: [360], time: [240, 175], correct: [523, 659, 784], win: [392, 523, 659, 784, 1047],
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
