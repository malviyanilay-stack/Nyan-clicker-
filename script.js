// Nyan Clicker - Updated: center layout, stars display, touch/pointer support, settings modal,
// robust image fallback, disabled/gray out upgrade buys when insufficient stars,
// single set of control buttons (no duplicates), fix pointer/keyboard counting,
// autosave setting and safer save/load.

// I focused on correctness, safety, and meeting all requested UX changes.

(function () {
  // === DOM ===
  const nyan = document.getElementById('nyanCat');
  const nyanContainer = document.getElementById('nyanContainer');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('highScore');
  const cpsEl = document.getElementById('cps');
  const comboEl = document.getElementById('combo');
  const starsEl = document.getElementById('stars');

  const upgradesListEl = document.getElementById('upgradesList');
  const skinsListEl = document.getElementById('skinsList');
  const achievementsListEl = document.getElementById('achievementsList');

  const saveBtn = document.getElementById('saveBtn');
  const exportBtn = document.getElementById('exportBtn');
  const resetBtn = document.getElementById('resetBtn');
  const soundToggle = document.getElementById('soundToggle');
  const musicToggle = document.getElementById('musicToggle');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingSound = document.getElementById('settingSound');
  const settingMusic = document.getElementById('settingMusic');
  const settingTouch = document.getElementById('settingTouch');
  const settingAutosave = document.getElementById('settingAutosave');
  const importBtn = document.getElementById('importBtn');
  const closeSettings = document.getElementById('closeSettings');

  const toastsEl = document.getElementById('toasts');
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext && canvas.getContext('2d');

  // === Storage keys & defaults ===
  const STORAGE_KEY = 'nyan_clicker_save_v1';
  const BACKUP_KEY = 'nyan_clicker_save_backup_v1';
  const SAVE_VERSION = 1;

  const defaultState = {
    version: SAVE_VERSION,
    score: 0,
    highScore: 0,
    clickValue: 1,
    cps: 0,
    sound: true,
    music: false,
    touchEnabled: true,
    autosaveSec: 5,
    selectedSkin: 'classic',
    upgrades: {
      auto: { level: 0, baseCost: 50, baseCps: 0.2 },
      multiplier: { level: 0, baseCost: 10, multiplierPerLevel: 1 },
      rainbowBurst: { level: 0, baseCost: 200, burstPower: 5 }
    },
    achievements: {},
    _meta: { bestStreak: 0 }
  };

  let state = JSON.parse(JSON.stringify(defaultState));

  // === Skins (fallback-safe) ===
  const skins = {
    classic: { name: 'Classic', url: 'https://media.giphy.com/media/sIIhZliB2McAo/giphy.gif' },
    pikachu:    { name: 'Pikachu',   url: 'https://iili.io/fCZ41LX.gif' },
    rainbow:    { name: 'Rainbow',   url: 'https://iili.io/fCZbHyg.gif' },
    glitch:    { name: 'Glitch',   url: 'https://iili.io/fCtEgIV.gif' },
    deadly:    { name: 'Deadly',   url: 'https://iili.io/fCti4Hb.gif' },
    pastel:   { name: 'Electro',  url: 'https://iili.io/fCt17cb.gif' }
  };

  // fallback SVG data URL (simple, always available)
  const FALLBACK_SVG = 'data:image/svg+xml;utf8,' +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="#111126"/><text x="50%" y="50%" fill="#ff66cc" font-family="sans-serif" font-size="28" dominant-baseline="middle" text-anchor="middle">NYAN</text></svg>');

  // === Achievements ===
  const ACHIEVEMENTS = [
    { id: 'first_click', title: 'First Click', desc: 'Make your first click', reward: { score: 10 }, predicate: s => s._meta && s._meta.totalClicks >= 1 },
    { id: 'reach_100', title: 'Hundred Star', desc: 'Reach 100 stars', reward: { score: 20 }, predicate: s => s.highScore >= 100 },
    { id: 'streak_10', title: 'Streak Master', desc: 'Hit a 10 combo', reward: { score: 50 }, predicate: s => s._meta && s._meta.bestStreak >= 10 }
  ];

  // ensure meta fields
  if (!state._meta) state._meta = { bestStreak: 0, totalClicks: 0 };

  // === Utilities ===
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a,b) => a + Math.random()*(b-a);
  const formatNum = n => (n >= 1000000 ? (n/1000000).toFixed(2) + 'M' : Math.floor(n).toString());
  function showToast(text, ms=2500) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    toastsEl.appendChild(t);
    requestAnimationFrame(()=> t.classList.add('visible'));
    setTimeout(()=> { t.classList.remove('visible'); setTimeout(()=> t.remove(), 260); }, ms);
  }

  // === Save / Load with validation and backup ===
  function isObject(v){ return v && typeof v === 'object' && !Array.isArray(v); }

  function validateAndNormalize(loaded) {
    if (!isObject(loaded)) return null;
    const clean = JSON.parse(JSON.stringify(defaultState));
    // numeric fields
    if (typeof loaded.score === 'number' && isFinite(loaded.score) && loaded.score >= 0) clean.score = loaded.score;
    if (typeof loaded.highScore === 'number' && isFinite(loaded.highScore) && loaded.highScore >= 0) clean.highScore = loaded.highScore;
    if (typeof loaded.clickValue === 'number' && isFinite(loaded.clickValue) && loaded.clickValue > 0) clean.clickValue = loaded.clickValue;
    if (typeof loaded.cps === 'number' && isFinite(loaded.cps) && loaded.cps >= 0) clean.cps = loaded.cps;
    if (typeof loaded.sound === 'boolean') clean.sound = loaded.sound;
    if (typeof loaded.music === 'boolean') clean.music = loaded.music;
    if (typeof loaded.touchEnabled === 'boolean') clean.touchEnabled = loaded.touchEnabled;
    if (typeof loaded.autosaveSec === 'number' && loaded.autosaveSec >= 1) clean.autosaveSec = Math.floor(loaded.autosaveSec);
    if (typeof loaded.selectedSkin === 'string' && skins[loaded.selectedSkin]) clean.selectedSkin = loaded.selectedSkin;
    if (isObject(loaded.upgrades)) {
      for (let k of Object.keys(clean.upgrades)) {
        if (loaded.upgrades[k] && typeof loaded.upgrades[k].level === 'number' && loaded.upgrades[k].level >= 0) {
          clean.upgrades[k].level = Math.floor(loaded.upgrades[k].level);
        }
      }
    }
    if (isObject(loaded.achievements)) clean.achievements = loaded.achievements;
    if (isObject(loaded._meta)) clean._meta = Object.assign({}, clean._meta, loaded._meta);
    return clean;
  }

  function save() {
    try {
      const payload = Object.assign({}, state, { version: SAVE_VERSION, savedAt: new Date().toISOString() });
      try { const prev = localStorage.getItem(STORAGE_KEY); if (prev) localStorage.setItem(BACKUP_KEY, prev); } catch(e){}
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
      try { parsed = JSON.parse(raw); } catch (e) {
        // try backup
        const b = localStorage.getItem(BACKUP_KEY);
        if (b) {
          try { parsed = JSON.parse(b); localStorage.setItem(STORAGE_KEY, b); } catch(e2){ parsed = null; }
        }
      }
      if (!parsed) return false;
      const clean = validateAndNormalize(parsed);
      if (!clean) return false;
      state = Object.assign({}, JSON.parse(JSON.stringify(defaultState)), clean);
      if (!state._meta) state._meta = { bestStreak: 0, totalClicks: 0 };
      return true;
    } catch (e) {
      console.warn('Load failed', e);
      return false;
    }
  }

  function resetSave() {
    if (!confirm('Reset progress? This will delete your save.')) return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(BACKUP_KEY); } catch(e){}
    state = JSON.parse(JSON.stringify(defaultState));
    state._meta = { bestStreak: 0, totalClicks: 0 };
    updateUI();
    save();
    showToast('Progress reset');
  }

  // === Image fallback ===
  nyan.addEventListener('error', () => {
    if (nyan.src !== FALLBACK_SVG) nyan.src = FALLBACK_SVG;
  });

  // set initial skin safely
  function applySkin(skinKey) {
    if (!skins[skinKey]) skinKey = 'classic';
    const url = skins[skinKey].url;
    nyan.src = url;
    // safety: if image fails it will fall back to SVG by onerror handler
  }

  // === Particles canvas handling (scaled to container) ===
  let particles = [];
  function alignCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    // make canvas match CSS pixels for crisp drawing
    const targetW = Math.max(1, Math.floor(rect.width));
    const targetH = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }
  function spawnParticle(x,y,crit=false,color=null) {
    particles.push({
      x,y,
      vx: rand(-3,3),
      vy: rand(-6,-1),
      life: rand(40,80),
      age: 0,
      size: crit ? rand(4,8) : rand(2,5),
      color: color || (crit ? `hsl(${rand(0,360)},90%,60%)` : `hsl(${rand(180,300)},80%,60%)`)
    });
  }
  function spawnParticles(x,y,count=18,crit=false) {
    for (let i=0;i<count;i++) spawnParticle(x,y,crit);
  }
  function confettiBurst(x,y,count=50) {
    const colors = ['#ff66cc','#ffd166','#6ee7b7','#7dd3fc','#c084fc','#ff9f43'];
    for (let i=0;i<count;i++) {
      particles.push({
        x,y,
        vx: rand(-6,6),
        vy: rand(-8,-2),
        life: rand(60,140),
        age: 0,
        size: rand(3,7),
        color: colors[Math.floor(Math.random()*colors.length)]
      });
    }
  }
  function tickParticles() {
    if (!ctx) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let i = particles.length-1;i>=0;i--) {
      const p = particles[i];
      p.age++;
      p.vy += 0.12;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.size *= 0.996;
      const alpha = 1 - p.age / p.life;
      if (alpha <= 0 || p.size <= 0.2) { particles.splice(i,1); continue; }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(tickParticles);
  }
  window.addEventListener('resize', alignCanvas);
  setTimeout(()=>{ alignCanvas(); requestAnimationFrame(tickParticles); }, 50);

  // === Audio ===
  let audioCtx = null;
  function ensureAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  function playClickSound(crit=false) {
    if (!state.sound) return;
    try {
      ensureAudio();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = crit ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(crit ? rand(800,1100) : rand(600,900), audioCtx.currentTime);
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.22);
    } catch(e){}
  }
  let bgOsc = null;
  function startAmbient() {
    if (!state.music) return;
    try {
      ensureAudio();
      if (bgOsc) return;
      bgOsc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      bgOsc.type = 'sine';
      bgOsc.frequency.value = 110;
      g.gain.value = 0.01;
      bgOsc.connect(g).connect(audioCtx.destination);
      bgOsc.start();
    } catch(e){}
  }
  function stopAmbient() {
    try {
      if (bgOsc) { bgOsc.stop(); bgOsc.disconnect(); bgOsc = null; }
    } catch(e){}
  }

  // === Game logic: clicks, combo, crits, upgrades ===
  // Combo
  const COMBO_TIMEOUT = 900;
  let combo = { streak: 0, lastClick: 0 };

  function getStars() {
    // Stars are integer currency derived from score (floor)
    return Math.floor(state.score);
  }

  function addScore(amount) {
    if (!isFinite(amount) || amount <= 0) return;
    state.score = Math.max(0, state.score + amount);
    if (state.score > state.highScore) state.highScore = Math.floor(state.score);
  }

  function registerClick(pageX, pageY) {
    // update total clicks meta
    state._meta.totalClicks = (state._meta.totalClicks || 0) + 1;

    const now = Date.now();
    if (now - combo.lastClick <= COMBO_TIMEOUT) combo.streak++; else combo.streak = 1;
    combo.lastClick = now;
    state._meta.bestStreak = Math.max(state._meta.bestStreak || 0, combo.streak);

    // combo multiplier
    const comboMult = 1 + clamp(combo.streak * 0.08, 0, 4);

    // critical chance
    const baseCrit = 0.06;
    const critBonus = clamp(combo.streak * 0.003, 0, 0.15);
    const isCrit = Math.random() < (baseCrit + critBonus);

    const base = state.clickValue;
    const burstPower = state.upgrades.rainbowBurst.burstPower || 0;
    const critMultiplier = isCrit ? (2 + burstPower * 0.2) : 1;
    const gain = Math.max(1, Math.floor(base * comboMult * critMultiplier));

    addScore(gain);

    // particles position: map page coords to canvas coords
    const wrapRect = nyanContainer.getBoundingClientRect();
    const cx = ((pageX - wrapRect.left) / Math.max(1, wrapRect.width)) * canvas.width;
    const cy = ((pageY - wrapRect.top) / Math.max(1, wrapRect.height)) * canvas.height;

    spawnParticles(cx, cy, isCrit ? 40 : 18, isCrit);
    if (isCrit) { showToast('CRITICAL!'); confettiBurst(cx, cy, 40); }

    // floating text
    spawnFloatingTextAt(pageX - wrapRect.left, pageY - wrapRect.top, `+${gain}`, isCrit);

    checkAchievements();
    updateUI();
    save();
    playClickSound(isCrit);
    // tiny pop animation
    nyan.classList.remove('pop'); void nyan.offsetWidth; nyan.classList.add('pop');
  }

  // pointer/touch handling: count left-click (button===0 / pointerdown)
  function onPointerDown(e) {
    // if settings modal open, ignore clicks to main area
    if (settingsModal && settingsModal.getAttribute('aria-hidden') === 'false') return;
    // Accept mouse left (button 0), touch (pointerType === 'touch' or pointerType 'pen'), stylus
    const isAccept = (typeof e.button === 'number' ? e.button === 0 : true) || e.pointerType === 'touch';
    if (!isAccept) return;
    // prevent default to avoid selecting image on touch
    if (e.cancelable) e.preventDefault();
    // Use page coords for particle mapping
    const pageX = e.pageX || (e.touches && e.touches[0] && e.touches[0].pageX) || (window.innerWidth/2);
    const pageY = e.pageY || (e.touches && e.touches[0] && e.touches[0].pageY) || (window.innerHeight/2);
    registerClick(pageX, pageY);
  }

  // Also support legacy click fallback (mouse)
  function onClickFallback(e) {
    // ensure left click only
    if (e.button && e.button !== 0) return;
    registerClick(e.pageX, e.pageY);
  }

  // keyboard Space -> click in center of nyan
  function onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      const rect = nyanContainer.getBoundingClientRect();
      const cx = rect.left + rect.width/2;
      const cy = rect.top + rect.height/2;
      registerClick(cx, cy);
    }
  }

  // floating texts
  function spawnFloatingTextAt(x,y,text,crit=false) {
    const el = document.createElement('div');
    el.className = 'float-text' + (crit ? ' crit' : '');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    nyanContainer.appendChild(el);
    requestAnimationFrame(()=> el.style.transform = 'translateY(-40px) scale(1.02)');
    setTimeout(()=> el.style.opacity = '0', 500);
    setTimeout(()=> el.remove(), 900);
  }

  // === Upgrades UI & logic ===
  function costForUpgrade(base, level) { return Math.max(1, Math.floor(base * Math.pow(1.15, level))); }

  function canAfford(cost) {
    return getStars() >= cost;
  }

  function buyUpgrade(key) {
    const u = state.upgrades[key];
    const cost = costForUpgrade(u.baseCost, u.level);
    if (!canAfford(cost)) { showToast('Not enough Stars'); return false; }
    // deduct integer stars from score by subtracting cost
    state.score = Math.max(0, state.score - cost);
    u.level += 1;
    // apply effects
    if (key === 'auto') state.cps = +(state.cps + u.baseCps).toFixed(3);
    if (key === 'multiplier') state.clickValue = +(state.clickValue + u.multiplierPerLevel);
    if (key === 'rainbowBurst') u.burstPower = (u.burstPower || 5) + 1;
    showToast(`Purchased ${key} Lv.${u.level}`);
    checkAchievements();
    updateUI();
    save();
    return true;
  }

  function renderUpgrades() {
    upgradesListEl.innerHTML = '';
    Object.keys(state.upgrades).forEach(k => {
      const u = state.upgrades[k];
      const cost = costForUpgrade(u.baseCost, u.level);
      const div = document.createElement('div');
      div.className = 'upgrade';
      div.innerHTML = `
        <div class="upgrade-info">
          <div class="upgrade-title">${toNiceName(k)}</div>
          <div class="upgrade-desc">${upgradeDesc(k, u)}</div>
        </div>
        <div class="upgrade-actions">
          <div class="upgrade-cost">${cost} ⭐</div>
          <button class="btn buy-btn" data-upg="${k}">Buy</button>
          <div class="upgrade-level">Lv. ${u.level}</div>
        </div>
      `;
      const btn = div.querySelector('.buy-btn');
      if (!canAfford(cost)) btn.disabled = true;
      btn.addEventListener('click', () => buyUpgrade(k));
      upgradesListEl.appendChild(div);
    });
  }

  function toNiceName(k) {
    if (k === 'auto') return 'Auto Clicker';
    if (k === 'multiplier') return 'Click Multiplier';
    if (k === 'rainbowBurst') return 'Rainbow Burst';
    return k;
  }
  function upgradeDesc(k,u) {
    if (k === 'auto') return `Gives +${u.baseCps} CPS`;
    if (k === 'multiplier') return `+${u.multiplierPerLevel} per click`;
    if (k === 'rainbowBurst') return `Critical burst power ${u.burstPower || 5}`;
    return '';
  }

  // === Skins UI ===
  function renderSkins() {
    skinsListEl.innerHTML = '';
    Object.keys(skins).forEach(key => {
      const s = skins[key];
      const d = document.createElement('div');
      d.className = 'skin';
      if (state.selectedSkin === key) d.classList.add('selected');
      d.innerHTML = `<img src="${s.url}" alt="${s.name}"><div class="skin-label">${s.name}</div>`;
      d.addEventListener('click', () => {
        state.selectedSkin = key;
        applySkin(key);
        showToast(`Skin: ${s.name}`);
        renderSkins();
        save();
      });
      // fallback handling: if image fails, show SVG placeholder inside this element
      const img = d.querySelector('img');
      img.addEventListener('error', () => { img.src = FALLBACK_SVG; });
      skinsListEl.appendChild(d);
    });
  }

  // === Achievements UI ===
  function renderAchievements() {
    achievementsListEl.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const unlocked = !!(state.achievements && state.achievements[a.id]);
      const d = document.createElement('div');
      d.className = 'achievement' + (unlocked ? ' unlocked' : '');
      d.innerHTML = `<div class="ach-title">${a.title}</div><div class="ach-desc">${a.desc}</div><div class="ach-status">${unlocked ? 'Unlocked' : 'Locked'}</div>`;
      achievementsListEl.appendChild(d);
    });
  }

  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (a.predicate(state) && !state.achievements[a.id]) {
        state.achievements[a.id] = { unlockedAt: new Date().toISOString() };
        if (a.reward && a.reward.score) state.score = Math.max(0, state.score + a.reward.score);
        showToast(`Achievement: ${a.title}`, 3000);
        confettiBurst(canvas.width/2, canvas.height/2, 90);
      }
    }
  }

  // === UI updates ===
  function updateUI() {
    // center view should be stable even on layout changes
    scoreEl.textContent = formatNum(state.score);
    highScoreEl.textContent = formatNum(state.highScore);
    cpsEl.textContent = (+state.cps).toFixed(2);
    starsEl.textContent = formatNum(getStars());
    const comboMult = 1 + clamp(combo.streak * 0.08, 0, 4);
    comboEl.textContent = 'x' + comboMult.toFixed(2) + (combo.streak > 1 ? ` (${combo.streak})` : '');
    soundToggle.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off');
    musicToggle.textContent = 'Music: ' + (state.music ? 'On' : 'Off');

    // settings modal inputs reflect state
    if (settingSound) settingSound.checked = !!state.sound;
    if (settingMusic) settingMusic.checked = !!state.music;
    if (settingTouch) settingTouch.checked = !!state.touchEnabled;
    if (settingAutosave) settingAutosave.value = state.autosaveSec;

    // enable/disable upgrade buttons
    renderUpgrades();
    renderSkins();
    renderAchievements();
  }

  // === Event bindings ===
  // pointer support
  function enablePointerHandlers(enable) {
    // remove first to avoid duplicates
    nyanContainer.removeEventListener('pointerdown', onPointerDown);
    nyanContainer.removeEventListener('touchstart', onPointerDown);
    nyanContainer.removeEventListener('click', onClickFallback);
    window.removeEventListener('keydown', onKeyDown);
    if (enable) {
      nyanContainer.addEventListener('pointerdown', onPointerDown, { passive: false });
      // touchstart fallback for older browsers
      nyanContainer.addEventListener('touchstart', onPointerDown, { passive: false });
      nyanContainer.addEventListener('click', onClickFallback);
      window.addEventListener('keydown', onKeyDown);
    } else {
      // still keep keyboard
      window.addEventListener('keydown', onKeyDown);
    }
  }

  // settings toggles
  settingsBtn.addEventListener('click', () => {
    settingsModal.setAttribute('aria-hidden', 'false');
  });
  closeSettings.addEventListener('click', () => {
    settingsModal.setAttribute('aria-hidden', 'true');
    // commit settings to state
    const oldAutosave = state.autosaveSec;
    state.sound = !!settingSound.checked;
    state.music = !!settingMusic.checked;
    state.touchEnabled = !!settingTouch.checked;
    state.autosaveSec = Math.max(1, Math.floor(Number(settingAutosave.value) || 5));
    // reapply pointer handlers
    enablePointerHandlers(state.touchEnabled);
    if (state.autosaveSec !== oldAutosave) {
      restartAutosave();
    }
    if (state.music) startAmbient(); else stopAmbient();
    updateUI();
    save();
  });

  importBtn.addEventListener('click', async () => {
    // prompt user to paste JSON (simple import UI)
    const txt = prompt('Paste your save JSON here to import:');
    if (!txt) return;
    try {
      const parsed = JSON.parse(txt);
      const clean = validateAndNormalize(parsed);
      if (!clean) throw new Error('Invalid save data');
      state = Object.assign({}, JSON.parse(JSON.stringify(defaultState)), clean);
      save();
      updateUI();
      showToast('Save imported');
    } catch (e) {
      alert('Failed to import save: ' + e.message);
    }
  });

  // control buttons
  saveBtn.addEventListener('click', () => { save(); showToast('Saved'); });
  exportBtn.addEventListener('click', () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'nyan-clicker-save.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  resetBtn.addEventListener('click', resetSave);

  soundToggle.addEventListener('click', () => { state.sound = !state.sound; updateUI(); save(); if (state.sound) ensureAudio(); });
  musicToggle.addEventListener('click', () => { state.music = !state.music; updateUI(); save(); if (state.music) startAmbient(); else stopAmbient(); });

  // when settings modal opens, reflect current state
  settingsBtn.addEventListener('click', () => {
    settingSound.checked = !!state.sound;
    settingMusic.checked = !!state.music;
    settingTouch.checked = !!state.touchEnabled;
    settingAutosave.value = state.autosaveSec || 5;
  });

  // === Autosave management ===
  let autosaveHandle = null;
  function restartAutosave() {
    if (autosaveHandle) clearInterval(autosaveHandle);
    autosaveHandle = setInterval(() => { save(); }, Math.max(1000, (state.autosaveSec || 5) * 1000));
  }

  // === init load ===
  const loaded = load();
  if (!loaded) {
    state = JSON.parse(JSON.stringify(defaultState));
    state.score = 5;
    state._meta = { bestStreak: 0, totalClicks: 0 };
    save();
  }

  // ensure state fields exist
  state._meta = state._meta || { bestStreak: 0, totalClicks: 0 };

  // apply skin and handlers
  applySkin(state.selectedSkin);
  enablePointerHandlers(state.touchEnabled !== false);
  updateUI();
  restartAutosave();

  // keyboard space handling already wired in pointer handlers via onKeyDown

  // start ambient if needed
  if (state.music) startAmbient();

  // beforeunload flush
  window.addEventListener('beforeunload', () => { try { save(); } catch(e){} });

  // autosave also on interval is running via restartAutosave

  // initial UI render of upgrades/skins/achievements
  renderUpgrades();
  renderSkins();
  renderAchievements();
  checkAchievements();

  // ensure canvas aligned on image load
  nyan.addEventListener('load', () => { alignCanvas(); });

  // Prevent duplicate same-action buttons elsewhere: we kept a single authoritative set in top controls and sidebar.

  // === helper: floating text spawn (redeclared here for closure) ===
  function spawnFloatingTextAt(x,y,text,crit=false) {
    const el = document.createElement('div');
    el.className = 'float-text' + (crit ? ' crit' : '');
    el.textContent = text;
    // position relative to container
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    nyanContainer.appendChild(el);
    requestAnimationFrame(()=> el.style.transform = 'translateY(-40px) scale(1.02)');
    setTimeout(()=> el.style.opacity = '0', 500);
    setTimeout(()=> el.remove(), 900);
  }

  // start particle loop if canvas supported
  if (ctx) {
    alignCanvas();
    requestAnimationFrame(tickParticles);
  }
})();
