let buildings = {};

const defaultState = {
  currentLevels: {},
  goal: { building: "keep", level: 1 },
  specialCompleted: {}
};

let state = JSON.parse(localStorage.getItem("evonyData")) || defaultState;

function save() {
  localStorage.setItem("evonyData", JSON.stringify(state));
}

function showLoader() {
  document.getElementById("loader").classList.remove("hidden");
}

function hideLoader() {
  document.getElementById("loader").classList.add("hidden");
}

async function loadData() {
  const res = await fetch("buildings.json");
  buildings = await res.json();

  for (const b in buildings) {
    if (state.currentLevels[b] == null) state.currentLevels[b] = 0;
  }

  renderCurrent();
  renderGoal();
}

function renderCurrent() {
  const el = document.getElementById("current-levels");
  el.innerHTML = "";

  for (const b in buildings) {
    const card = document.createElement("div");
    card.className = "building-card";

    const label = document.createElement("label");
    label.textContent = formatName(b);

    const input = document.createElement("input");
    input.type = "number";
    input.min = 0;
    input.value = state.currentLevels[b];
    input.onchange = e => {
      state.currentLevels[b] = +e.target.value;
      save();
    };

    card.appendChild(label);
    card.appendChild(input);
    el.appendChild(card);
  }
}

function formatName(name) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function renderGoal() {
  const sel = document.getElementById("goal-building");
  sel.innerHTML = "";
  for (const b in buildings) {
    const o = document.createElement("option");
    o.value = b;
    o.textContent = b;
    sel.appendChild(o);
  }
  sel.value = state.goal.building;
  sel.onchange = e => { state.goal.building = e.target.value; save(); };

  const lvl = document.getElementById("goal-level");
  lvl.value = state.goal.level;
  lvl.onchange = e => { state.goal.level = +e.target.value; save(); };
}

function resolve(building, level, res = {}, specials = []) {
  if (!buildings[building]) {
    console.warn("Missing building:", building);
    return { levels: res, specials };
  }
  if (!res[building] || res[building] < level) res[building] = level;

  for (let i = 1; i <= level; i++) {
    const data = buildings[building]?.[i] || {};
    const reqs = data.requirements || {};

    for (const r in reqs) {
      if (
        reqs[r] !== null &&
        !["food", "lumber", "stone", "ore", "gold", "special"].includes(r)
      ) {
        resolve(r, reqs[r], res, specials);
      }
    }

    if (reqs.special && !specials.includes(reqs.special)) {
      specials.push(reqs.special);
    }
  }

  return { levels: res, specials };
}

function getPlan(current, target) {
  const p = {};
  for (const b in target) {
    if ((current[b] || 0) < target[b]) {
      p[b] = { from: current[b] || 0, to: target[b] };
    }
  }
  return p;
}

function applyMinimums(requiredLevels) {
  const updated = [];
  for (const b in requiredLevels) {
    const required = requiredLevels[b];
    const current = state.currentLevels[b] || 0;

    // only bump UP, never down
    if (current < required) {
      state.currentLevels[b] = required;
      updated.push(b);
    }
  }

  save();
  renderCurrent(); // refresh UI
  // highlight updated cards
  setTimeout(() => {
    updated.forEach(b => {
      const cards = document.querySelectorAll(".building-card");
      cards.forEach(card => {
        if (card.querySelector("label").textContent === formatName(b)) {
          card.style.boxShadow = "0 0 10px #22c55e";
        }
      });
    });
  }, 0);
}

function calcResources(plan) {
  const total = { food: 0, lumber: 0, stone: 0, ore: 0, gold: 0 };

  for (const b in plan) {
    for (let lvl = plan[b].from + 1; lvl <= plan[b].to; lvl++) {
      const data = buildings[b]?.[lvl] || {};
      const cost = data.requirements || {};

      total.food += cost.food || 0;
      total.lumber += cost.lumber || 0;
      total.stone += cost.stone || 0;
      total.ore += cost.ore || 0;
      total.gold += cost.gold || 0;
    }
  }

  return total;
}

function renderRequired(data) {
  const el = document.getElementById("required");
  el.innerHTML = "";
  for (const b in data) {
    el.innerHTML += `<div class='result-item'>${b}: ${data[b]}</div>`;
  }
}

function renderPlan(data) {
  const el = document.getElementById("plan");
  el.innerHTML = "";
  if (Object.keys(data).length === 0) { el.innerHTML = "Done 🎉"; return; }
  for (const b in data) {
    el.innerHTML += `<div class='result-item'>${b}: ${data[b].from} → ${data[b].to}</div>`;
  }
}

function renderResources(r) {
  const el = document.getElementById("resources");
  el.innerHTML = "";
  for (const k in r) {
    el.innerHTML += `<div class='result-item'>${k}: ${r[k].toLocaleString()}</div>`;
  }
}

function renderSpecials(list) {
  const el = document.getElementById("special-reqs");
  el.innerHTML = "";

  list.forEach(req => {
    const id = `special-${req}`;
    const wrapper = document.createElement("div");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.specialCompleted[req] || false;
    checkbox.onchange = e => { state.specialCompleted[req] = e.target.checked; save(); };

    const label = document.createElement("label");
    label.textContent = req;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    el.appendChild(wrapper);
  });
}

function getPriority(building) {
  const goalBuilding = state.goal.building;
  const goalLevel = state.goal.level;
  const current = state.currentLevels;

  if (building === goalBuilding) return 10000;

  let bestScore = 0;
  const GAP_WEIGHT = 100;
  const PROXIMITY_WEIGHT = 10;

  const goalData = buildings[goalBuilding];

  for (let lvl = 1; lvl <= goalLevel; lvl++) {
    const reqs = goalData[lvl]?.requirements || {};
    if (reqs[building] !== undefined && reqs[building] !== null) {
      const requiredLevel = reqs[building];
      const currentLevel = current[building] || 0;

      const gap = Math.max(0, requiredLevel - currentLevel);
      const proximity = goalLevel - lvl;
      const proximityScore = Math.max(0, 50 - proximity);

      const score = gap * GAP_WEIGHT + proximityScore * PROXIMITY_WEIGHT;
      if (score > bestScore) bestScore = score;
    }
  }

  return bestScore || 1;
}

function getBuildOrder(plan, targetLevels) {
  const order = [];

  function canUpgrade(building, level, currentLevels) {
    const reqs = buildings[building][level]?.requirements || {};

    for (const r in reqs) {
      if (
        reqs[r] !== null &&
        !["food", "lumber", "stone", "ore", "gold", "special"].includes(r)
      ) {
        if ((currentLevels[r] || 0) < reqs[r]) {
          return false;
        }
      }
    }

    return true;
  }

  const simulated = { ...state.currentLevels };
  let progress = true;

  while (progress) {
    progress = false;
    const sortedBuildings = Object.keys(plan).sort((a, b) => getPriority(b) - getPriority(a));

    for (const b of sortedBuildings) {
      const target = targetLevels[b];
      simulated[b] = simulated[b] || 0;

      while (simulated[b] < target) {
        const nextLevel = simulated[b] + 1;
        if (canUpgrade(b, nextLevel, simulated)) {
          order.push(`${b} → ${nextLevel}`);
          simulated[b]++;
          progress = true;
        } else {
          break;
        }
      }
    }
  }

  return order;
}

function getBlockers(plan, simulated) {
  const blockers = [];
  for (const b in plan) {
    const nextLevel = (simulated[b] || 0) + 1;
    const reqs = buildings[b][nextLevel]?.requirements || {};
    for (const r in reqs) {
      if (
        reqs[r] !== null &&
        !["food", "lumber", "stone", "ore", "gold", "special"].includes(r)
      ) {
        if ((simulated[r] || 0) < reqs[r]) {
          blockers.push(`${b} needs ${r} → ${reqs[r]}`);
        }
      }
    }
  }
  return [...new Set(blockers)];
}

function renderOrder(order, blockers = []) {
  const container = document.getElementById("build-order") || (() => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = "<h2>Build Order</h2><div id='build-order'></div>";
    document.body.appendChild(card);
    return document.getElementById("build-order");
  })();

  container.innerHTML = "";

  if (order.length === 0 && blockers.length === 0) {
    container.innerHTML = "Nothing to build 🎉";
    return;
  }

  order.forEach(step => { container.innerHTML += `<div class='result-item'>${step}</div>`; });
  if (blockers.length > 0) {
    container.innerHTML += `<div style='margin-top:10px;color:#f87171;font-weight:bold'>Blocked:</div>`;
    blockers.forEach(b => container.innerHTML += `<div class='result-item'>❌ ${b}</div>`);
  }
}

function calculate() {
  showLoader();

  // Let UI render BEFORE heavy work
  setTimeout(() => {
    const { levels, specials } = resolve(state.goal.building, state.goal.level);
    const plan = getPlan(state.currentLevels, levels);
    const resources = calcResources(plan);
    const order = getBuildOrder(plan, levels);

    const simulated = { ...state.currentLevels };
    order.forEach(step => {
      const [b, lvl] = step.split(" → ");
      simulated[b] = Number(lvl);
    });

    const blockers = getBlockers(plan, simulated);

    renderRequired(levels);
    renderPlan(plan);
    renderResources(resources);
    renderSpecials(specials);
    renderOrder(order, blockers);

    hideLoader(); // 👈 IMPORTANT
  }, 10); // tiny delay so spinner appears first
}

document.getElementById("calc-btn").addEventListener("click", calculate);
loadData();

document.getElementById("auto-fill")?.addEventListener("click", () => {
  const { levels } = resolve(state.goal.building, state.goal.level);
  applyMinimums(levels);
});