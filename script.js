// Nyan Clicker - script.js
// Features:
// - Score, high score, persistent save (localStorage)
// - Upgrades (auto-clicker + multipliers) with cost scaling
// - Keyboard (Space) to click
// - Sound via Web Audio API (toggleable)
// - Simple animation on click
// - Export save (download JSON), manual save, reset

(function () {
  // DOM
  const nyan = document.getElementById('nyanCat');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const cpsEl = document.getElementById('cps');
  const upgradesListEl = document.getElementById('upgradesList');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const exportBtn = document.getElementById('exportBtn');
  const soundToggle = document.getElementById('soundToggle');

  // State & defaults
  const STORAGE_KEY = 'nyan_clicker_save_v1';
  let state = {
    score: 0,
    highScore: 0,
    clickValue: 1,
    cps: 0, // passive clicks per second
    sound: true,
    upgrades: {
      auto: { level: 0, baseCost: 50, baseCps: 0.2 },
      multiplier: { level: 0, baseCost: 10, multiplierPerLevel: 1 }
    }
  };

  // Utility
  const format = (n) => (n >= 1000000 ? (n/1000000).toFixed(2) + 'M' : n.toFixed(0));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Save / Load
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Save failed', e);
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge carefully to keep defaults
        state = Object.assign({}, state, parsed);
        state.upgrades = Object.assign({}, state.upgrades, parsed.upgrades || {});
      }
    } catch (e) {
      console.warn('Load failed', e);
    }
  }
  function resetSave() {
    if (!confirm('Reset your progress? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = {
      score: 0,
      highScore: 0,
      clickValue: 1,
      cps: 0,
      sound: true,
      upgrades: {
        auto: { level: 0, baseCost: 50, baseCps: 0.2 },
        multiplier: { level: 0, baseCost: 10, multiplierPerLevel: 1 }
      }
    };
    updateUI();
    save();
  }

  // Sound (simple beep using WebAudio)
  let audioCtx = null;
  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function playClickSound() {
    if (!state.sound) return;
    try {
      ensureAudioCtx();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, audioCtx.currentTime);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.22);
    } catch (e) {
      // ignore audio errors
    }
  }

  // Click handler
  function addScore(amount) {
    state.score += amount;
    if (state.score > state.highScore) state.highScore = Math.floor(state.score);
    animateNyan();
    playClickSound();
    updateUI();
  }

  function animateNyan() {
    nyan.classList.remove('pop');
    // trigger reflow
    void nyan.offsetWidth;
    nyan.classList.add('pop');
  }

  nyan.addEventListener('click', () => {
    addScore(state.clickValue);
    save();
  });

  // Spacebar click
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      addScore(state.clickValue);
      save();
    }
  });

  // Upgrades
  function costForUpgrade(base, level) {
    return Math.max(1, Math.floor(base * Math.pow(1.15, level)));
  }

  function buyAuto() {
    const u = state.upgrades.auto;
    const cost = costForUpgrade(u.baseCost, u.level);
    if (state.score < cost) return;
    state.score -= cost;
    u.level += 1;
    // increase cps by baseCps each level
    state.cps = +(state.cps + u.baseCps).toFixed(3);
    updateUI();
    save();
  }

  function buyMultiplier() {
    const u = state.upgrades.multiplier;
    const cost = costForUpgrade(u.baseCost, u.level);
    if (state.score < cost) return;
    state.score -= cost;
    u.level += 1;
    // increase click value by multiplierPerLevel
    state.clickValue += u.multiplierPerLevel;
    updateUI();
    save();
  }

  function renderUpgrades() {
    upgradesListEl.innerHTML = '';

    // Auto Clicker
    const auto = state.upgrades.auto;
    const autoCost = costForUpgrade(auto.baseCost, auto.level);
    const autoDiv = document.createElement('div');
    autoDiv.className = 'upgrade';
    autoDiv.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-title">Auto Clicker</div>
        <div class="upgrade-desc">Gives +${auto.baseCps} CPS</div>
      </div>
      <div class="upgrade-actions">
        <div class="upgrade-cost">${autoCost} ⭐</div>
        <button class="btn buy-auto">Buy</button>
        <div class="upgrade-level">Lv. ${auto.level}</div>
      </div>
    `;
    autoDiv.querySelector('.buy-auto').addEventListener('click', buyAuto);
    upgradesListEl.appendChild(autoDiv);

    // Multiplier
    const mul = state.upgrades.multiplier;
    const mulCost = costForUpgrade(mul.baseCost, mul.level);
    const mulDiv = document.createElement('div');
    mulDiv.className = 'upgrade';
    mulDiv.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-title">Click Multiplier</div>
        <div class="upgrade-desc">+${mul.multiplierPerLevel} per click</div>
      </div>
      <div class="upgrade-actions">
        <div class="upgrade-cost">${mulCost} ⭐</div>
        <button class="btn buy-mul">Buy</button>
        <div class="upgrade-level">Lv. ${mul.level}</div>
      </div>
    `;
    mulDiv.querySelector('.buy-mul').addEventListener('click', buyMultiplier);
    upgradesListEl.appendChild(mulDiv);
  }

  // Passive auto-clicker tick
  setInterval(() => {
    if (state.cps > 0) {
      const delta = state.cps / 10; // run 10x per second for smoother accumulation
      state.score += delta;
      if (state.score > state.highScore) state.highScore = Math.floor(state.score);
      updateUI();
    }
  }, 100);

  // UI update
  function updateUI() {
    scoreEl.textContent = format(state.score);
    highScoreEl.textContent = format(state.highScore);
    cpsEl.textContent = (+state.cps).toFixed(2);
    soundToggle.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off');
    renderUpgrades();
  }

  // Buttons
  resetBtn.addEventListener('click', resetSave);
  saveBtn.addEventListener('click', () => {
    save();
    alert('Saved!');
  });
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nyan-clicker-save.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  soundToggle.addEventListener('click', () => {
    state.sound = !state.sound;
    if (state.sound) {
      // resume audio context on some browsers requiring an input-first action
      ensureAudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    updateUI();
    save();
  });

  // Autosave every 5 seconds
  setInterval(save, 5000);

  // Init
  load();
  updateUI();

  // Friendly first-time hint
  if (state.score === 0 && state.upgrades.auto.level === 0 && state.upgrades.multiplier.level === 0) {
    // give a tiny starter bonus so the shop is reachable
    state.score = 5;
    updateUI();
    save();
  }
})();
