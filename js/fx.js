'use strict';
// Анимации: бегущий счёт, появление и закрытие окон, вспышки судейства, конфетти.
// Всё отключается, если в системе включено «уменьшить движение».

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const confettiColors = ['#ffd23f', '#ff4b2b', '#2740ff', '#00e676', '#ff6ea9', '#00e5ff'];

const fx = {
  shown: new Map(), // id команды -> счёт, который сейчас на экране
  origin: null, // прямоугольник последней нажатой кнопки: из неё «вылетает» окно
  closeTimer: 0,
  particles: [],
  canvas: null,
  frame: 0,

  resetScores() {
    this.shown.clear();
  },

  // Плавно меняет числа счёта. На экране итогов числа набираются с нуля.
  scores(entering) {
    for (const element of app.querySelectorAll('.score[data-team]')) {
      const id = element.dataset.team;
      const to = Number(element.dataset.value);
      const from = this.shown.has(id) ? this.shown.get(id) : to;
      this.shown.set(id, to);
      if (from === to || reduceMotion.matches) continue;
      this.count(element, from, to);
      const card = element.closest('.score-card');
      card?.classList.add(to > from ? 'bump-up' : 'bump-down');
      card?.addEventListener('animationend', () => card.classList.remove('bump-up', 'bump-down'), { once: true });
    }
    if (!entering || reduceMotion.matches) return;
    for (const element of app.querySelectorAll('[data-count]')) this.count(element, 0, Number(element.dataset.count));
  },

  count(element, from, to) {
    const start = performance.now();
    const duration = Math.min(1100, 400 + Math.abs(to - from) * 0.7);
    const tick = now => {
      if (!element.isConnected) return;
      const progress = Math.min(1, (now - start) / duration);
      const value = Math.round(from + (to - from) * (1 - (1 - progress) ** 3));
      element.textContent = value.toLocaleString('ru-RU');
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  // Окно вылетает из карточки, на которую нажали.
  aimModal() {
    const box = this.origin;
    this.origin = null;
    const dx = box ? box.left + box.width / 2 - innerWidth / 2 : 0;
    const dy = box ? box.top + box.height / 2 - innerHeight / 2 : 60;
    modal.style.setProperty('--dx', `${Math.round(dx)}px`);
    modal.style.setProperty('--dy', `${Math.round(dy)}px`);
    // Класс fresh включает анимации открытия и снимается, чтобы они не повторялись при обновлении окна.
    modal.classList.add('fresh');
    clearTimeout(this.freshTimer);
    this.freshTimer = setTimeout(() => modal.classList.remove('fresh'), 1000);
  },

  keepModal() {
    clearTimeout(this.closeTimer);
    modal.classList.remove('closing');
  },

  closeModal() {
    if (!modal.open) {
      modal.innerHTML = '';
      return;
    }
    if (modal.classList.contains('closing')) return;
    if (reduceMotion.matches) {
      modal.close();
      modal.innerHTML = '';
      return;
    }
    modal.classList.add('closing');
    this.closeTimer = setTimeout(() => {
      modal.classList.remove('closing');
      modal.close();
      modal.innerHTML = '';
    }, 200);
  },

  // Реакция на решение судьи: зелёная вспышка и салют или красная тряска.
  verdict(correct) {
    if (reduceMotion.matches) return;
    modal.classList.remove('flash-good', 'flash-bad');
    void modal.offsetWidth;
    modal.classList.add(correct ? 'flash-good' : 'flash-bad');
    modal.addEventListener('animationend', event => {
      if (event.target === modal) modal.classList.remove('flash-good', 'flash-bad');
    }, { once: true });
    modal.querySelector('.judge-feedback strong')?.classList.add('pop');
    if (correct) {
      const box = modal.getBoundingClientRect();
      this.burst(box.left + box.width / 2, box.top + box.height * 0.35, 90, 11);
    }
  },

  burst(x, y, count, speed) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const force = speed * (0.35 + Math.random() * 0.65);
      this.addParticle(x, y, Math.cos(angle) * force, Math.sin(angle) * force - speed * 0.5);
    }
    this.run();
  },

  // Конфетти сверху на экране итогов.
  celebrate() {
    if (reduceMotion.matches) return;
    const colors = game ? game.teams.map(team => team.color) : [];
    this.palette ||= [...colors, ...confettiColors];
    for (let wave = 0; wave < 4; wave++) {
      setTimeout(() => {
        for (let index = 0; index < 55; index++) this.addParticle(Math.random() * innerWidth, -20, (Math.random() - 0.5) * 4, 2 + Math.random() * 4);
        this.run();
      }, wave * 450);
    }
  },

  // Салют: серия залпов по экрану в цвете победителя.
  fireworks(color) {
    if (reduceMotion.matches) return;
    const palette = [color, '#ffd23f', '#ffffff', color];
    this.palette = palette;
    this.celebrate();
    for (let shot = 0; shot < 8; shot++) {
      setTimeout(() => {
        this.palette = palette;
        this.burst(innerWidth * (0.12 + Math.random() * 0.76), innerHeight * (0.12 + Math.random() * 0.45), 70, 12);
      }, 250 + shot * 420);
    }
  },

  addParticle(x, y, vx, vy) {
    if (this.particles.length > 700) return; // защита, если вкладка была в фоне и кадры не рисовались
    const palette = this.palette || confettiColors;
    this.particles.push({
      x, y, vx, vy, size: 6 + Math.random() * 7, spin: Math.random() * 6, turn: (Math.random() - 0.5) * 0.4,
      color: palette[Math.floor(Math.random() * palette.length)], life: 1,
    });
  },

  run() {
    if (!this.canvas) {
      this.canvas = Object.assign(document.createElement('canvas'), { id: 'fx-canvas' });
      this.canvas.setAttribute('popover', 'manual');
      this.canvas.setAttribute('aria-hidden', 'true');
      document.body.append(this.canvas);
    }
    if (this.frame) return;
    // Холст в верхнем слое страницы, иначе окно вопроса его перекроет.
    try {
      if (!this.canvas.matches(':popover-open')) this.canvas.showPopover();
    } catch {
      // Без popover конфетти рисуется под окнами, игра от этого не страдает.
    }
    const ratio = devicePixelRatio || 1;
    this.canvas.width = innerWidth * ratio;
    this.canvas.height = innerHeight * ratio;
    const context = this.canvas.getContext('2d');
    context.scale(ratio, ratio);
    const draw = () => {
      context.clearRect(0, 0, innerWidth, innerHeight);
      this.particles = this.particles.filter(particle => particle.life > 0 && particle.y < innerHeight + 30);
      for (const particle of this.particles) {
        particle.vy += 0.22;
        particle.vx *= 0.992;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.spin += particle.turn;
        particle.life -= 0.004;
        context.save();
        context.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
        context.translate(particle.x, particle.y);
        context.rotate(particle.spin);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        context.restore();
      }
      if (this.particles.length) {
        this.frame = requestAnimationFrame(draw);
      } else {
        this.frame = 0;
        this.palette = null;
        context.clearRect(0, 0, innerWidth, innerHeight);
        try { this.canvas.hidePopover(); } catch { /* уже скрыт */ }
      }
    };
    this.frame = requestAnimationFrame(draw);
  },
};
