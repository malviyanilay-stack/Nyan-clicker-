// Nyan Clicker - script.js (updated localStorage support)
// - Added SAVE_VERSION, backup, validation, recovery from corrupted saves
// - Autosave on interval and on beforeunload
// - Safer merge when loading saved state

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

  // Storage keys & version
  const STORAGE_KEY = 'nyan_clicker_save_v1';
  const BACKUP_KEY = 'nyan_clicker_save_backup_v1';
  const SAVE_VERSION = 1;

  // State & defaults
  let defaultState = {
    version: SAVE_VERSION,
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

  let state = JSON.parse(JSON.stringify(defaultState)); // deep copy

  // Utility
  const format = (n) => (n >= 1000000 ? (n/1000000).toFixed(2) + 'M' : Math.floor(n).toString());
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

  // Validate a loaded save and return a clean state (or null if irrecoverable)
  function validateAndNormalize(loaded) {
    if (!isObject(loaded)) return null;
    // version check (allow simple migration later)
    if (typeof loaded.version !== 'number') loaded.version = 0;

    // Start from defaults and copy allowed fields
    const clean = JSON.parse(JSON.stringify(defaultState));

    // numeric fields
    if (typeof loaded.score === 'number' && isFinite(loaded.score) && loaded.score >= 0) clean.score = loaded.score;
    if (typeof loaded.highScore === 'number' && isFinite(loaded.highScore) && loaded.highScore >= 0) clean.highScore = loaded.highScore;
    if (typeof loaded.clickValue === 'number' && isFinite(loaded.clickValue) && loaded.clickValue > 0) clean.clickValue = loaded.clickValue;
    if (typeof loaded.cps === 'number' && isFinite(loaded.cps) && loaded.cps >= 0) clean.cps = loaded.cps;
    if (typeof loaded.sound === 'boolean') clean.sound = loaded.sound;

    if (isObject(loaded.upgrades)) {
      // auto
      const la = loaded.upgrades.auto;
      if (isObject(la)) {
        if (typeof la.level === 'number' && la.level >= 0) clean.upgrades.auto.level = Math.floor(la.level);
        if (typeof la.baseCost === 'number' && la.baseCost > 0) clean.upgrades.auto.baseCost = la.baseCost;
        if (typeof la.baseCps === 'number' && la.baseCps >= 0) clean.upgrades.auto.baseCps = la.baseCps;
      }
      // multiplier
      const lm = loaded.upgrades.multiplier;
      if (isObject(lm)) {
        if (typeof lm.level === 'number' && lm.level >= 0) clean.upgrades.multiplier.level = Math.floor(lm.level);
        if (typeof lm.baseCost === 'number' && lm.baseCost > 0) clean.upgrades.multiplier.baseCost = lm.baseCost;
        if (typeof lm.multiplierPerLevel === 'number' && lm.multiplierPerLevel > 0) clean.upgrades.multiplier.multiplierPerLevel = lm.multiplierPerLevel;
      }
    }

    return clean;
  }

  // Save / Load with backup & validation
  function save() {
    try {
      // attach timestamp
      const payload = Object.assign({}, state, { version: SAVE_VERSION, savedAt: new Date().toISOString() });
      // write backup of previous save
      try {
        const prev = localStorage.getItem(STORAGE_KEY);
        if (prev) localStorage.setItem(BACKUP_KEY, prev);
      } catch (e) {
        // ignore backup failures
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      // keep in-memory state.version accurate
      state.version = SAVE_VERSION;
    } catch (e) {
      console.warn('Save failed', e);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false; // nothing to load
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        console.warn('Primary save parse failed, attempting recovery from backup', e);
        // try recovery from backup
        const b = localStorage.getItem(BACKUP_KEY);
        if (b) {
          try {
            parsed = JSON.parse(b);
            // restore backup to primary
            localStorage.setItem(STORAGE_KEY, b);
            console.info('Recovered save from backup.');
          } catch (e2) {
            console.warn('Backup parse also failed', e2);
            parsed = null;
          }
        }
      }
      if (!parsed) return false;
      const clean = validateAndNormalize(parsed);
      if (!clean) return false;
      // Merge: keep any new default fields, but prefer saved values
      state = Object.assign({}, JSON.parse(JSON.stringify(defaultState)), clean);
      return true;
    } catch (e) {
      console.warn('Load failed', e);
      return false;
    }
  }

  function resetSave() {
    if (!confirm('Reset your progress? This cannot be undone.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BACKUP_KEY);
    } catch (e) {
      // ignore
    }
    state = JSON.parse(JSON.stringify(defaultState));
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
      ensureAudioCtx();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    updateUI();
    save();
  });

  // Autosave every 5 seconds and on unload
  const AUTOSAVE_MS = 5000;
  setInterval(save, AUTOSAVE_MS);
  window.addEventListener('beforeunload', () => {
    try {
      save();
    } catch (e) {
      // ignore
    }
  });

  // Init: load and apply
  const loaded = load();
  if (!loaded) {
    // No save or failed to load; ensure clean default state (but give a small starter bonus so shop is reachable)
    state = JSON.parse(JSON.stringify(defaultState));
    state.score = 5;
    save();
  }
  updateUI();

  // Friendly first-time hint (only if truly new)
  if (state.score === 5 && state.upgrades.auto.level === 0 && state.upgrades.multiplier.level === 0) {
    // leave as-is; starter bonus already applied
  }
})();
