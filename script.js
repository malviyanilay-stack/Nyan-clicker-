// Nyan Clicker - script.js (fun & entertaining version)
// Features added: combos, crits, particles, achievements, skins, music, richer sounds, confetti

(function () {
  // DOM
  const nyan = document.getElementById('nyanCat');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const cpsEl = document.getElementById('cps');
  const comboEl = document.getElementById('combo');
  const upgradesListEl = document.getElementById('upgradesList');
  const skinsListEl = document.getElementById('skinsList');
  const achievementsListEl = document.getElementById('achievementsList');
  const resetBtn = document.getElementById('resetBtn');
  const saveBtn = document.getElementById('saveBtn');
  const exportBtn = document.getElementById('exportBtn');
  const soundToggle = document.getElementById('soundToggle');
  const musicToggle = document.getElementById('musicToggle');
  const toastsEl = document.getElementById('toasts');
  const canvas = document.getElementById('particles');

  // Storage & versioning
  const STORAGE_KEY = 'nyan_clicker_save_v1';
  const BACKUP_KEY = 'nyan_clicker_save_backup_v1';
  const SAVE_VERSION = 1;

  // Default state
  const defaultState = {
    version: SAVE_VERSION,
    score: 0,
    highScore: 0,
    clickValue: 1,
    cps: 0,
    sound: true,
    music: false,
    selectedSkin: 'classic',
    upgrades: {
      auto: { level: 0, baseCost: 50, baseCps: 0.2 },
      multiplier: { level: 0, baseCost: 10, multiplierPerLevel: 1 },
      rainbowBurst: { level: 0, baseCost: 200, burstPower: 5 }
    },
    achievements: {} // unlocked achievements
  };

  let state = JSON.parse(JSON.stringify(defaultState));

  // Skins registry
  const skins = {
    classic: { name: 'Classic', url: 'https://media.giphy.com/media/sIIhZliB2McAo/giphy.gif' },
    retro:  { name: 'Retro', url: 'https://media.giphy.com/media/Usmcx3m9S8m8I/giphy.gif' },
    prism:  { name: 'Prism', url: 'https://media.giphy.com/media/3o6ZsZ7jK3bzn7uV2k/giphy.gif' },
    pastel: { name: 'Pastel', url: 'https://media.giphy.com/media/8YutMatqkTfSE/giphy.gif' }
  };

  // Achievements definitions
  const ACHIEVEMENTS = [
    { id: 'first_click', title: 'First Click!', desc: 'Make your first click', reward: { score: 10 }, predicate: s => s.score >= 1 },
    { id: 'score_100', title: 'Rising Star', desc: 'Reach 100 score', reward: { score: 25 }, predicate: s => s.highScore >= 100 },
    { id: 'score_1000', title: 'Space Cadet', desc: 'Reach 1,000 score', reward: { score: 200 }, predicate: s => s.highScore >= 1000 },
    { id: 'streak_10', title: 'Combo Novice', desc: 'Hit a 10-click streak', reward: { score: 50 }, predicate: s => s._meta && s._meta.bestStreak >= 10 },
    { id: 'buy_auto_5', title: 'Automation', desc: 'Buy Auto Clicker level 5', reward: { score: 100 }, predicate: s => s.upgrades && s.upgrades.auto && s.upgrades.auto.level >= 5 }
  ];

  // Local runtime meta (not persisted except some fields)
  if (!state._meta) state._meta = { bestStreak: 0 };

  // Canvas for particles
  const ctx = canvas.getContext('2d');
  let particles = [];
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  // Position canvas to overlay image
  function alignCanvas() {
    const wrap = nyan.parentElement;
    const rect = wrap.getBoundingClientRect();
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.style.left = '0';
    canvas.style.top = '0';
    resizeCanvas();
  }
  window.addEventListener('resize', alignCanvas);
  setTimeout(alignCanvas, 50);

  // Utility
  const format = (n) => (n >= 1000000 ? (n/1000000).toFixed(2) + 'M' : Math.floor(n).toString());
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rand = (a,b) => a + Math.random()*(b-a);

  // Audio
  let audioCtx = null;
  let bgOsc = null;
  let bgGain = null;
  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function playClickSound(crit=false) {
    if (!state.sound) return;
    try {
      ensureAudioCtx();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = crit ? 'triangle' : 'sine';
      const freq = crit ? rand(900,1100) : rand(600,900);
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.22);
    } catch (e) { /* ignore */ }
  }
  function startAmbient() {
    if (!state.music) return;
    ensureAudioCtx();
    if (bgOsc) return; // already started
    bgOsc = audioCtx.createOscillator();
    bgGain = audioCtx.createGain();
    bgOsc.type = 'sine';
    bgOsc.frequency.value = 110;
    bgGain.gain.value = 0.01;
    bgOsc.connect(bgGain).connect(audioCtx.destination);
    bgOsc.start();
  }
  function stopAmbient() {
    if (bgOsc) {
      try { bgOsc.stop(); } catch(e){}
      bgOsc.disconnect();
      bgGain.disconnect();
      bgOsc = null;
      bgGain = null;
    }
  }

  // Save / Load with backup & validation (keeps new fields safe)
  function validateAndNormalize(loaded) {
    if (!loaded || typeof loaded !== 'object') return null;
    const clean = JSON.parse(JSON.stringify(defaultState));
    if (typeof loaded.score === 'number' && isFinite(loaded.score) && loaded.score >= 0) clean.score = loaded.score;
    if (typeof loaded.highScore === 'number' && isFinite(loaded.highScore) && loaded.highScore >= 0) clean.highScore = loaded.highScore;
    if (typeof loaded.clickValue === 'number' && isFinite(loaded.clickValue) && loaded.clickValue > 0) clean.clickValue = loaded.clickValue;
    if (typeof loaded.cps === 'number' && isFinite(loaded.cps) && loaded.cps >= 0) clean.cps = loaded.cps;
    if (typeof loaded.sound === 'boolean') clean.sound = loaded.sound;
    if (typeof loaded.music === 'boolean') clean.music = loaded.music;
    if (typeof loaded.selectedSkin === 'string' && skins[loaded.selectedSkin]) clean.selectedSkin = loaded.selectedSkin;
    if (loaded.upgrades && typeof loaded.upgrades === 'object') {
      for (let k of Object.keys(clean.upgrades)) {
        if (loaded.upgrades[k] && typeof loaded.upgrades[k].level === 'number' && loaded.upgrades[k].level >= 0) {
          clean.upgrades[k].level = Math.floor(loaded.upgrades[k].level);
        }
      }
    }
    if (loaded.achievements && typeof loaded.achievements === 'object') {
      clean.achievements = loaded.achievements;
    }
    if (loaded._meta && typeof loaded._meta === 'object') {
      clean._meta = loaded._meta;
    }
    return clean;
  }

  function save() {
    try {
      const payload = Object.assign({}, state, { version: SAVE_VERSION, savedAt: new Date().toISOString() });
      try {
        const prev = localStorage.getItem(STORAGE_KEY);
        if (prev) localStorage.setItem(BACKUP_KEY, prev);
      } catch(e){}
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      state.version = SAVE_VERSION;
    } catch (e) {
      console.warn('Save failed', e);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      let parsed = null;
      try { parsed = JSON.parse(raw); } 
      catch (e) {
        const b = localStorage.getItem(BACKUP_KEY);
        if (b) {
          try { parsed = JSON.parse(b); localStorage.setItem(STORAGE_KEY, b); } 
          catch (e2) { parsed = null; }
        }
      }
      if (!parsed) return false;
      const clean = validateAndNormalize(parsed);
      if (!clean) return false;
      // merge but keep extras from defaults
      state = Object.assign({}, JSON.parse(JSON.stringify(defaultState)), clean);
      if (!state._meta) state._meta = { bestStreak: 0 };
      return true;
    } catch (e) {
      console.warn('Load failed', e);
      return false;
    }
  }

  function resetSave() {
    if (!confirm('Reset your progress? This cannot be undone.')) return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(BACKUP_KEY); } catch(e){}
    state = JSON.parse(JSON.stringify(defaultState));
    state._meta = { bestStreak: 0 };
    updateUI();
    save();
    showToast('Progress reset');
  }

  // Upgrades
  function costForUpgrade(base, level) { return Math.max(1, Math.floor(base * Math.pow(1.15, level))); }
  function buyAuto() {
    const u = state.upgrades.auto, cost = costForUpgrade(u.baseCost, u.level);
    if (state.score < cost) return showToast('Not enough score');
    state.score -= cost; u.level += 1; state.cps = +(state.cps + u.baseCps).toFixed(3);
    showToast('Bought Auto Clicker Lv.' + u.level);
    checkAchievements();
    updateUI(); save();
  }
  function buyMultiplier() {
    const u = state.upgrades.multiplier, cost = costForUpgrade(u.baseCost, u.level);
    if (state.score < cost) return showToast('Not enough score');
    state.score -= cost; u.level += 1; state.clickValue += u.multiplierPerLevel;
    showToast('Bought Multiplier Lv.' + u.level);
    checkAchievements();
    updateUI(); save();
  }
  function buyBurst() {
    const u = state.upgrades.rainbowBurst, cost = costForUpgrade(u.baseCost, u.level);
    if (state.score < cost) return showToast('Not enough score');
    state.score -= cost; u.level += 1; u.burstPower += 1;
    showToast('Bought Rainbow Burst Lv.' + u.level);
    updateUI(); save();
  }

  // Render upgrades & skins & achievements UI
  function renderUpgrades() {
    upgradesListEl.innerHTML = '';
    // Auto
    const a = state.upgrades.auto;
    const autoCost = costForUpgrade(a.baseCost, a.level);
    const autoDiv = document.createElement('div'); autoDiv.className = 'upgrade';
    autoDiv.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-title">Auto Clicker</div>
        <div class="upgrade-desc">Gives +${a.baseCps} CPS</div>
      </div>
      <div class="upgrade-actions">
        <div class="upgrade-cost">${autoCost} ⭐</div>
        <button class="btn buy-auto">Buy</button>
        <div class="upgrade-level">Lv. ${a.level}</div>
      </div>
    `;
    autoDiv.querySelector('.buy-auto').addEventListener('click', buyAuto);
    upgradesListEl.appendChild(autoDiv);

    // Multiplier
    const m = state.upgrades.multiplier;
    const mulCost = costForUpgrade(m.baseCost, m.level);
    const mulDiv = document.createElement('div'); mulDiv.className = 'upgrade';
    mulDiv.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-title">Click Multiplier</div>
        <div class="upgrade-desc">+${m.multiplierPerLevel} per click</div>
      </div>
      <div class="upgrade-actions">
        <div class="upgrade-cost">${mulCost} ⭐</div>
        <button class="btn buy-mul">Buy</button>
        <div class="upgrade-level">Lv. ${m.level}</div>
      </div>
    `;
    mulDiv.querySelector('.buy-mul').addEventListener('click', buyMultiplier);
    upgradesListEl.appendChild(mulDiv);

    // Rainbow Burst
    const r = state.upgrades.rainbowBurst;
    const rCost = costForUpgrade(r.baseCost, r.level);
    const rDiv = document.createElement('div'); rDiv.className = 'upgrade';
    rDiv.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-title">Rainbow Burst</div>
        <div class="upgrade-desc">Critical burst power +${r.burstPower} on buy</div>
      </div>
      <div class="upgrade-actions">
        <div class="upgrade-cost">${rCost} ⭐</div>
        <button class="btn buy-r">Buy</button>
        <div class="upgrade-level">Lv. ${r.level}</div>
      </div>
    `;
    rDiv.querySelector('.buy-r').addEventListener('click', buyBurst);
    upgradesListEl.appendChild(rDiv);
  }

  function renderSkins() {
    skinsListEl.innerHTML = '';
    Object.keys(skins).forEach(key => {
      const s = skins[key];
      const d = document.createElement('div'); d.className = 'skin';
      d.innerHTML = `<img src="${s.url}" alt="${s.name}" title="${s.name}"><div class="skin-label">${s.name}</div>`;
      if (state.selectedSkin === key) d.classList.add('selected');
      d.addEventListener('click', () => {
        state.selectedSkin = key;
        nyan.src = skins[key].url;
        renderSkins();
        save();
        showToast('Skin: ' + s.name);
      });
      skinsListEl.appendChild(d);
    });
  }

  function renderAchievements() {
    achievementsListEl.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const unlocked = !!(state.achievements && state.achievements[a.id]);
      const d = document.createElement('div'); d.className = 'achievement' + (unlocked ? ' unlocked' : '');
      d.innerHTML = `<div class="ach-title">${a.title}</div><div class="ach-desc">${a.desc}</div><div class="ach-status">${unlocked ? 'Unlocked' : 'Locked'}</div>`;
      achievementsListEl.appendChild(d);
    });
  }

  // Toaster
  function showToast(text, duration=3000) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
    toastsEl.appendChild(t);
    setTimeout(() => { t.classList.add('visible'); }, 10);
    setTimeout(() => { t.classList.remove('visible'); setTimeout(()=>t.remove(),300); }, duration);
  }

  // Floating texts & particles
  function spawnFloatingText(x,y,text,opts={crit:false}) {
    const el = document.createElement('div'); el.className = 'float-text' + (opts.crit ? ' crit' : '');
    el.textContent = text;
    const wrap = nyan.parentElement;
    el.style.left = (x + 10) + 'px';
    el.style.top = (y - 10) + 'px';
    wrap.appendChild(el);
    requestAnimationFrame(()=> el.style.transform = 'translateY(-40px) scale(1.05)');
    setTimeout(()=> el.style.opacity = '0', 500);
    setTimeout(()=> el.remove(), 900);
  }

  function spawnParticles(x,y,count=20,crit=false,colors=null) {
    for (let i=0;i<count;i++) {
      particles.push({
        x, y,
        vx: rand(-4,4),
        vy: rand(-6,-1),
        life: rand(40,90),
        age: 0,
        size: rand(2,6),
        color: colors ? colors[Math.floor(Math.random()*colors.length)] : (crit ? `hsl(${rand(0,360)},90%,60%)` : `hsl(${rand(180,300)},80%,60%)`)
      });
    }
  }

  function confettiBurst(x,y,count=60) {
    const colors = ['#ff66cc','#ffd166','#6ee7b7','#7dd3fc','#c084fc','#ff9f43'];
    spawnParticles(x,y,count,false,colors);
  }

  // Animate particles
  function tickParticles() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i = particles.length-1; i >=0; i--) {
      const p = particles[i];
      p.age++;
      p.vy += 0.12; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.size *= 0.996;
      const alpha = 1 - p.age / p.life;
      if (alpha <= 0 || p.size <= 0.2) { particles.splice(i,1); continue; }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tickParticles);
  }
  requestAnimationFrame(tickParticles);

  // Combo & crit mechanics
  const COMBO_TIMEOUT = 900; // ms to keep combo going
  let combo = { streak: 0, lastClick: 0 };

  function registerClickAt(pageX, pageY) {
    const now = Date.now();
    if (now - combo.lastClick <= COMBO_TIMEOUT) {
      combo.streak++;
    } else {
      combo.streak = 1;
    }
    combo.lastClick = now;
    state._meta.bestStreak = Math.max(state._meta.bestStreak || 0, combo.streak);

    // combo multiplier
    const comboMult = 1 + clamp(combo.streak * 0.08, 0, 4); // up to +4x from combo

    // critical chance
    const baseCrit = 0.06; // 6%
    const critBonus = clamp(combo.streak * 0.003, 0, 0.15); // up to +15%
    const isCrit = Math.random() < (baseCrit + critBonus);

    // compute total
    const base = state.clickValue;
    const totalGain = Math.floor(base * comboMult * (isCrit ? 2 + state.upgrades.rainbowBurst.burstPower*0.2 : 1));

    state.score += totalGain;
    if (state.score > state.highScore) state.highScore = Math.floor(state.score);

    // visuals
    const wrapRect = nyan.parentElement.getBoundingClientRect();
    const localX = (pageX - wrapRect.left) * (canvas.width / wrapRect.width);
    const localY = (pageY - wrapRect.top) * (canvas.height / wrapRect.height);

    spawnFloatingText(pageX - wrapRect.left, pageY - wrapRect.top, `+${totalGain}`, { crit: isCrit });
    spawnParticles(localX, localY, isCrit ? 40 : 18, isCrit);
    if (isCrit) {
      showToast('CRITICAL!', 1200);
      playClickSound(true);
    } else {
      playClickSound(false);
    }

    // small confetti/celebration on milestones
    if (state.highScore >= 500 && !state._meta._milestone500) { state._meta._milestone500 = true; confettiBurst(localX, localY); showToast('500 High Score! Party!'); }
    if (state.highScore >= 5000 && !state._meta._milestone5k) { state._meta._milestone5k = true; confettiBurst(localX, localY); showToast('5,000 High Score! Legendary!'); }

    checkAchievements();
    updateUI();
    save();
  }

  // Click handlers
  nyan.addEventListener('click', (e) => {
    registerClickAt(e.pageX, e.pageY);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      // approximate center click
      const wrap = nyan.parentElement.getBoundingClientRect();
      const cx = wrap.left + wrap.width/2;
      const cy = wrap.top + wrap.height/2;
      registerClickAt(cx, cy);
    }
  });

  // Passive auto-clicker tick
  setInterval(() => {
    if (state.cps > 0) {
      const delta = state.cps / 10;
      state.score += delta;
      if (state.score > state.highScore) state.highScore = Math.floor(state.score);
      updateUI();
    }
  }, 100);

  // Achievements checking & awarding
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (a.predicate(state) && !state.achievements[a.id]) {
        state.achievements[a.id] = { unlockedAt: new Date().toISOString() };
        if (a.reward && a.reward.score) {
          state.score += a.reward.score;
        }
        showToast(`Achievement: ${a.title}`);
        confettiBurst(canvas.width/2, canvas.height/2, 80);
      }
    }
  }

  // UI update
  function updateUI() {
    scoreEl.textContent = format(state.score);
    highScoreEl.textContent = format(state.highScore);
    cpsEl.textContent = (+state.cps).toFixed(2);
    const comboMult = 1 + clamp(combo.streak * 0.08, 0, 4);
    comboEl.textContent = 'x' + comboMult.toFixed(2) + (combo.streak > 1 ? ` (${combo.streak})` : '');
    soundToggle.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off');
    musicToggle.textContent = 'Music: ' + (state.music ? 'On' : 'Off');
    renderUpgrades(); renderSkins(); renderAchievements();
    // update nyan skin
    if (nyan.src !== skins[state.selectedSkin].url) nyan.src = skins[state.selectedSkin].url;
  }

  // Buttons
  resetBtn.addEventListener('click', resetSave);
  saveBtn.addEventListener('click', () => { save(); showToast('Saved!'); });
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'nyan-clicker-save.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  soundToggle.addEventListener('click', () => {
    state.sound = !state.sound; updateUI(); save();
    if (state.sound) ensureAudioCtx();
  });
  musicToggle.addEventListener('click', () => {
    state.music = !state.music; updateUI(); save();
    if (state.music) startAmbient(); else stopAmbient();
  });

  // Autosave & beforeunload
  setInterval(save, 5000);
  window.addEventListener('beforeunload', () => { try { save(); } catch(e){} });

  // Init load
  const loaded = load();
  if (!loaded) {
    state = JSON.parse(JSON.stringify(defaultState)); state.score = 5; state._meta = { bestStreak: 0 };
    save();
  }
  // set initial skin
  if (skins[state.selectedSkin]) nyan.src = skins[state.selectedSkin].url;

  // Start ambient if enabled
  if (state.music) startAmbient();

  // friendly first-time
  checkAchievements();
  updateUI();

  // UI helpers: align canvas on image load
  nyan.addEventListener('load', () => { alignCanvas(); });
})();
