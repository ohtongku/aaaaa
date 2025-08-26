(function() {
  "use strict";

  // ----- Data Models -----
  const HEROES_PRESET = [
    { id: "warrior", name: "Warrior", maxHp: 120, hp: 120, atk: 18, def: 6, speed: 8, role: "tank" },
    { id: "mage", name: "Mage", maxHp: 80, hp: 80, atk: 26, def: 2, speed: 12, role: "dps" },
    { id: "cleric", name: "Cleric", maxHp: 90, hp: 90, atk: 12, def: 3, speed: 10, role: "support" },
  ];

  const DRAGON_PRESET = { id: "dragon", name: "Elder Dragon", maxHp: 300, hp: 300, atk: 22, def: 5, speed: 9, role: "boss" };

  const ABILITIES = {
    warrior: [
      { key: "slash", name: "Slash", type: "attack", power: 1.0, target: "enemy" },
      { key: "shield", name: "Guard", type: "buff", buff: { def: +4 }, duration: 2, target: "self" },
      { key: "taunt", name: "Taunt", type: "status", status: { taunt: true }, duration: 1, target: "enemy" },
    ],
    mage: [
      { key: "bolt", name: "Arcane Bolt", type: "attack", power: 1.2, target: "enemy" },
      { key: "fire", name: "Fireball", type: "attack", power: 1.6, target: "enemy", cooldown: 2 },
      { key: "focus", name: "Focus", type: "buff", buff: { atk: +8 }, duration: 2, target: "self" },
    ],
    cleric: [
      { key: "smite", name: "Smite", type: "attack", power: 0.9, target: "enemy" },
      { key: "heal", name: "Heal", type: "heal", power: 1.0, target: "ally" },
      { key: "bless", name: "Bless", type: "buff", buff: { def: +3 }, duration: 3, target: "ally" },
    ],
    dragon: [
      { key: "claw", name: "Claw Swipe", type: "attack", power: 1.0, target: "enemy" },
      { key: "flame", name: "Flame Breath", type: "attack", power: 1.4, target: "party", cooldown: 2 },
      { key: "scales", name: "Harden Scales", type: "buff", buff: { def: +3 }, duration: 2, target: "self", cooldown: 3 },
    ],
  };

  // ----- State -----
  let state = {
    heroes: [],
    dragon: null,
    turnOrder: [],
    currentTurnIndex: 0,
    cooldowns: {},
    statuses: {}, // map unitId -> { taunt?: boolean, ... }
    buffs: {}, // map unitId -> { atk?: number, def?: number, ... }
    autoPlay: false,
    phase: "idle", // idle | running | victory | defeat
  };

  // ----- Utils -----
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const isAlive = (u) => u.hp > 0;
  const getUnitById = (id) => state.heroes.find(h => h.id === id) || (state.dragon && state.dragon.id === id ? state.dragon : null);
  const getEffectiveStat = (unit, stat) => {
    const buffs = state.buffs[unit.id] || {};
    return (unit[stat] || 0) + (buffs[stat] || 0);
  };
  const rng = (min, max) => Math.random() * (max - min) + min;

  function log(messageHtml) {
    const el = document.createElement("div");
    el.className = "log-entry";
    el.innerHTML = messageHtml;
    document.getElementById("log").prepend(el);
  }

  function resetUI() {
    document.getElementById("party").innerHTML = "";
    document.getElementById("abilityPanel").innerHTML = "";
    document.getElementById("targetButtons").innerHTML = "";
    document.getElementById("targetPanel").hidden = true;
    document.getElementById("log").innerHTML = "";
  }

  function render() {
    // Party
    const partyEl = document.getElementById("party");
    partyEl.innerHTML = "";
    state.heroes.forEach(h => {
      const card = document.createElement("div");
      card.className = "unit-card" + (isAlive(h) ? "" : " defeated");
      card.dataset.unitId = h.id;
      card.innerHTML = `
        <div class="unit-portrait"></div>
        <div class="unit-info">
          <div class="unit-name">${h.name}</div>
          <div class="healthbar"><div class="healthbar-fill" id="hp-${h.id}"></div></div>
          <div class="stats"><span id="hp-text-${h.id}"></span> HP</div>
        </div>
      `;
      partyEl.appendChild(card);
    });

    // Dragon
    updateBars();

    // Abilities for current hero
    renderAbilities();
  }

  function updateBars() {
    // heroes
    state.heroes.forEach(h => {
      const hpPct = (h.hp / h.maxHp) * 100;
      const bar = document.getElementById(`hp-${h.id}`);
      const txt = document.getElementById(`hp-text-${h.id}`);
      if (bar) {
        bar.style.width = clamp(hpPct, 0, 100) + "%";
        bar.classList.toggle("low", hpPct <= 30);
        bar.classList.add("pop");
        setTimeout(() => bar.classList.remove("pop"), 280);
      }
      if (txt) txt.textContent = `${Math.max(0, Math.floor(h.hp))}/${h.maxHp}`;
    });

    // dragon
    const d = state.dragon;
    const dPct = (d.hp / d.maxHp) * 100;
    const dBar = document.getElementById("dragonHpBar");
    const dTxt = document.getElementById("dragonHpText");
    if (dBar) {
      dBar.style.width = clamp(dPct, 0, 100) + "%";
      dBar.classList.toggle("low", dPct <= 30);
      dBar.classList.add("pop");
      setTimeout(() => dBar.classList.remove("pop"), 280);
    }
    if (dTxt) dTxt.textContent = `${Math.max(0, Math.floor(d.hp))}/${d.maxHp}`;
  }

  function calcDamage(attacker, defender, power) {
    const atk = getEffectiveStat(attacker, "atk");
    const def = getEffectiveStat(defender, "def");
    const base = atk * power - def * 0.5;
    const variance = rng(0.85, 1.15);
    const raw = Math.max(1, Math.floor(base * variance));
    return raw;
  }

  function applyHeal(target, amount) {
    const healed = Math.min(target.maxHp - target.hp, Math.floor(amount));
    target.hp = clamp(target.hp + healed, 0, target.maxHp);
    updateBars();
    log(`<span class="heal">${target.name} heals ${healed}</span>`);
  }

  function applyDamage(attacker, defender, amount, label) {
    defender.hp = clamp(defender.hp - amount, 0, defender.maxHp);
    updateBars();
    log(`<span class="dmg">${attacker.name} ${label || "hits"} ${defender.name} for ${amount}</span>`);
  }

  function endTurnAdvance() {
    // reduce durations
    Object.keys(state.buffs).forEach(id => {
      const buffs = state.buffs[id];
      if (!buffs || !Object.keys(buffs).length) return;
    });
    // cooldowns
    Object.keys(state.cooldowns).forEach(key => {
      state.cooldowns[key] = Math.max(0, state.cooldowns[key] - 1);
    });

    // advance turn index to next alive unit
    let attempts = 0;
    do {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
      attempts += 1;
    } while (attempts < state.turnOrder.length && !isAlive(getUnitById(state.turnOrder[state.currentTurnIndex])));

    checkEndConditions();
    renderAbilities();
    updateTurnIndicator();

    if (state.autoPlay && state.phase === "running") {
      setTimeout(aiAct, 450);
    }
  }

  function makeTurnOrder() {
    const units = [...state.heroes, state.dragon];
    units.sort((a, b) => getEffectiveStat(b, "speed") - getEffectiveStat(a, "speed"));
    state.turnOrder = units.map(u => u.id);
    state.currentTurnIndex = 0;
  }

  function currentUnit() {
    return getUnitById(state.turnOrder[state.currentTurnIndex]);
  }

  function checkEndConditions() {
    if (!isAlive(state.dragon)) {
      state.phase = "victory";
      log(`<strong>Victory!</strong> The dragon is defeated.`);
      updateTurnIndicator();
      document.getElementById("abilityPanel").innerHTML = "";
      return true;
    }
    const anyHeroAlive = state.heroes.some(isAlive);
    if (!anyHeroAlive) {
      state.phase = "defeat";
      log(`<strong>Defeat...</strong> The party has fallen.`);
      updateTurnIndicator();
      document.getElementById("abilityPanel").innerHTML = "";
      return true;
    }
    return false;
  }

  function updateTurnIndicator() {
    const unit = currentUnit();
    const ti = document.getElementById("turnIndicator");
    if (state.phase !== "running") {
      ti.textContent = state.phase === "idle" ? "Click New Game to start" : state.phase === "victory" ? "Victory" : "Defeat";
      return;
    }
    ti.textContent = `${unit.name}'s turn`;
  }

  function renderAbilities() {
    const panel = document.getElementById("abilityPanel");
    panel.innerHTML = "";
    document.getElementById("targetPanel").hidden = true;

    if (state.phase !== "running") return;

    const unit = currentUnit();
    const isHero = state.heroes.some(h => h.id === unit.id);

    // AI controls dragon; player controls heroes
    if (!isHero) {
      panel.innerHTML = `<em>Dragon is thinking...</em>`;
      setTimeout(aiAct, 450);
      return;
    }

    const unitAbilities = ABILITIES[unit.id] || [];
    unitAbilities.forEach(ability => {
      const btn = document.createElement("button");
      btn.className = "ability-btn" + (ability.type === "heal" || ability.target === "ally" || ability.type === "buff" ? " support" : "");
      btn.textContent = ability.name + (isOnCooldown(unit, ability) ? ` (${getCooldown(unit, ability)}t)` : "");
      if (isOnCooldown(unit, ability)) btn.classList.add("disabled");
      btn.disabled = isOnCooldown(unit, ability);
      btn.addEventListener("click", () => onChooseAbility(unit, ability));
      panel.appendChild(btn);
    });
  }

  function cdKey(unit, ability) { return `${unit.id}:${ability.key}`; }
  function isOnCooldown(unit, ability) { return (ability.cooldown || 0) > 0 && (state.cooldowns[cdKey(unit, ability)] || 0) > 0; }
  function getCooldown(unit, ability) { return state.cooldowns[cdKey(unit, ability)] || 0; }
  function setCooldown(unit, ability) { if ((ability.cooldown || 0) > 0) state.cooldowns[cdKey(unit, ability)] = ability.cooldown + 1; }

  function onChooseAbility(unit, ability) {
    const targetType = ability.target;
    if (targetType === "self") {
      resolveAction(unit, unit, ability);
      return;
    }

    const targetPanel = document.getElementById("targetPanel");
    const buttons = document.getElementById("targetButtons");
    buttons.innerHTML = "";

    let candidates = [];
    if (targetType === "enemy") {
      candidates = [state.dragon].filter(isAlive);
    } else if (targetType === "ally") {
      candidates = state.heroes.filter(isAlive);
    } else if (targetType === "party") {
      // For AoE, immediate resolve against all heroes
      resolveAction(unit, null, ability);
      return;
    }

    candidates.forEach(c => {
      const b = document.createElement("button");
      b.className = "target-btn";
      b.textContent = c.name;
      b.addEventListener("click", () => {
        targetPanel.hidden = true;
        resolveAction(unit, c, ability);
      });
      buttons.appendChild(b);
    });
    targetPanel.hidden = candidates.length === 0;
  }

  function resolveAction(actor, target, ability) {
    if (state.phase !== "running") return;

    // Apply effect
    if (ability.type === "attack") {
      if (ability.target === "party") {
        state.heroes.filter(isAlive).forEach(h => {
          const dmg = calcDamage(state.dragon, h, ability.power);
          applyDamage(state.dragon, h, dmg, ability.name);
        });
      } else {
        const dmg = calcDamage(actor, target, ability.power);
        applyDamage(actor, target, dmg, ability.name);
      }
    } else if (ability.type === "heal") {
      const healAmount = getEffectiveStat(actor, "atk") * ability.power;
      applyHeal(target, healAmount);
    } else if (ability.type === "buff") {
      const buffs = state.buffs[target.id] || {}; 
      Object.keys(ability.buff || {}).forEach(k => {
        buffs[k] = (buffs[k] || 0) + ability.buff[k];
      });
      state.buffs[target.id] = buffs;
      // naive fixed-duration tracking via embedding on cooldowns map with synthetic key
      const durKey = `dur:${target.id}:${ability.key}:${Date.now()}`;
      state.cooldowns[durKey] = (ability.duration || 1) + 1;
      log(`<span class="buff">${actor.name} uses ${ability.name} on ${target.name}</span>`);
    } else if (ability.type === "status") {
      const st = state.statuses[target.id] || {};
      Object.assign(st, ability.status || {});
      state.statuses[target.id] = st;
      const durKey = `dur:${target.id}:${ability.key}:${Date.now()}`;
      state.cooldowns[durKey] = (ability.duration || 1) + 1;
      log(`<span class="buff">${actor.name} inflicts ${ability.name} on ${target.name}</span>`);
    }

    setCooldown(actor, ability);

    // After action, dragon AI may override target via taunt next time - handled in aiAct

    if (checkEndConditions()) return;

    endTurnAdvance();
  }

  function aiChooseAbility(unit) {
    const abilities = ABILITIES[unit.id] || [];
    const available = abilities.filter(a => !isOnCooldown(unit, a));
    if (!available.length) return abilities[0];

    if (unit.id === "dragon") {
      const aliveHeroes = state.heroes.filter(isAlive);
      if (aliveHeroes.length >= 2) {
        const flame = available.find(a => a.key === "flame");
        if (flame) return flame;
      }
      return available.find(a => a.key === "claw") || available[0];
    }

    // heroes
    if (unit.id === "cleric") {
      const allyLow = state.heroes.find(h => isAlive(h) && h.hp / h.maxHp < 0.6);
      if (allyLow) {
        const heal = available.find(a => a.key === "heal");
        if (heal) return heal;
      }
      return available.find(a => a.key === "smite") || available[0];
    }
    if (unit.id === "warrior") {
      const taunt = available.find(a => a.key === "taunt");
      if (taunt && Math.random() < 0.3) return taunt;
      return available.find(a => a.key === "slash") || available[0];
    }
    if (unit.id === "mage") {
      return available.find(a => a.key === "fire") || available.find(a => a.key === "bolt") || available[0];
    }

    return available[0];
  }

  function aiChooseTarget(unit, ability) {
    if (ability.target === "self") return unit;
    if (ability.target === "party") return null;

    if (unit.id === "dragon") {
      const taunted = state.heroes.find(h => isAlive(h) && (state.statuses[h.id] && state.statuses[h.id].taunt));
      if (taunted) return taunted;
      const priority = state.heroes
        .filter(isAlive)
        .sort((a, b) => a.role === "support" ? -1 : 1);
      return priority[0] || state.heroes.find(isAlive);
    } else {
      if (ability.target === "ally") {
        // heal lowest
        const ally = state.heroes
          .filter(isAlive)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        return ally || state.heroes[0];
      }
      return state.dragon;
    }
  }

  function aiAct() {
    if (state.phase !== "running") return;
    const unit = currentUnit();
    const ability = aiChooseAbility(unit);
    const target = aiChooseTarget(unit, ability);
    resolveAction(unit, target, ability);
  }

  function startNewGame() {
    state = {
      heroes: JSON.parse(JSON.stringify(HEROES_PRESET)),
      dragon: JSON.parse(JSON.stringify(DRAGON_PRESET)),
      turnOrder: [],
      currentTurnIndex: 0,
      cooldowns: {},
      statuses: {},
      buffs: {},
      autoPlay: state.autoPlay || false,
      phase: "running",
    };

    resetUI();
    render();
    makeTurnOrder();
    updateTurnIndicator();

    // Start with the fastest unit; if it's dragon, AI acts
    renderAbilities();
    if (currentUnit().id === "dragon") {
      setTimeout(aiAct, 450);
    }
  }

  function toggleAutoPlay() {
    state.autoPlay = !state.autoPlay;
    document.getElementById("autoPlayToggle").textContent = `Auto Play: ${state.autoPlay ? "On" : "Off"}`;
    if (state.autoPlay && state.phase === "running") {
      setTimeout(aiAct, 300);
    }
  }

  // ----- Hooks -----
  function init() {
    document.getElementById("newGameBtn").addEventListener("click", startNewGame);
    document.getElementById("autoPlayToggle").addEventListener("click", toggleAutoPlay);

    // Initialize dragon HUD
    const dBar = document.getElementById("dragonHpBar");
    if (dBar) dBar.style.width = "100%";
    document.getElementById("dragonHpText").textContent = `${DRAGON_PRESET.maxHp}/${DRAGON_PRESET.maxHp}`;
  }

  window.addEventListener("DOMContentLoaded", init);
})();