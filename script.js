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

async function loadData() {
  const res = await fetch("buildings.json");
  buildings = await res.json();

  for (const b in buildings) {
    if (state.currentLevels[b] == null) state.currentLevels[b] = 0;
  }

  renderCurrent();
  renderGoal();
  addSectionControls();
  loadLayout();
  loadCollapsed();
}

function addSectionControls() {
  document.querySelectorAll(".section").forEach(section => {
    const header = section.querySelector(".section-header");

    const controls = document.createElement("div");
    controls.className = "section-controls";

    const up = document.createElement("button");
    up.textContent = "⬆";
    up.onclick = (e) => {
      e.stopPropagation();
      moveSection(section, -1);
    };

    const down = document.createElement("button");
    down.textContent = "⬇";
    down.onclick = (e) => {
      e.stopPropagation();
      moveSection(section, 1);
    };

    controls.appendChild(up);
    controls.appendChild(down);
    header.appendChild(controls);
  });
}

function moveSection(section, dir) {
  const container = document.getElementById("main-layout");
  const sections = Array.from(container.children);
  const index = sections.indexOf(section);

  const newIndex = index + dir;
  if (newIndex < 0 || newIndex >= sections.length) return;

  container.insertBefore(
    section,
    dir === 1 ? sections[newIndex].nextSibling : sections[newIndex]
  );

  saveLayout();
}

function saveLayout() {
  const order = Array.from(document.querySelectorAll(".section"))
    .map(s => s.dataset.id);
  localStorage.setItem("layoutOrder", JSON.stringify(order));
}

function loadLayout() {
  const order = JSON.parse(localStorage.getItem("layoutOrder"));
  if (!order) return;

  const container = document.getElementById("main-layout");

  order.forEach(id => {
    const el = document.querySelector(`.section[data-id="${id}"]`);
    if (el) container.appendChild(el);
  });
}

function saveCollapsed() {
  const state = {};
  document.querySelectorAll(".section").forEach(s => {
    const id = s.dataset.id;
    const hidden = s.querySelector(".section-body").classList.contains("hidden");
    state[id] = hidden;
  });
  localStorage.setItem("collapsedState", JSON.stringify(state));
}

function loadCollapsed() {
  const state = JSON.parse(localStorage.getItem("collapsedState")) || {};
  document.querySelectorAll(".section").forEach(s => {
    if (state[s.dataset.id]) {
      s.querySelector(".section-body").classList.add("hidden");
    }
  });
}

function renderCurrent() {
  const el = document.getElementById("current-levels");
  el.innerHTML = "";

  const buildingList = Object.keys(buildings);
  const batchSize = 10; // number of cards per batch
  let index = 0;

  function renderBatch() {
    const batch = buildingList.slice(index, index + batchSize);
    batch.forEach(b => {
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
    });

    index += batchSize;

    if (index < buildingList.length) {
      // Schedule next batch
      requestAnimationFrame(renderBatch);
    }
  }

  // Start first batch
  renderBatch();
}

function formatName(name) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatShort(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(2).replace(/\.00$/, "") + "T";
  if (num >= 1e9)  return (num / 1e9).toFixed(2).replace(/\.00$/, "") + "B";
  if (num >= 1e6)  return (num / 1e6).toFixed(2).replace(/\.00$/, "") + "M";
  if (num >= 1e3)  return (num / 1e3).toFixed(2).replace(/\.00$/, "") + "K";
  return num.toString();
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

const resolveCache = {};

function resolve(building, level, res = {}, specials = [], visiting = new Set(), maxLevels = {}) {
  const key = building + "-" + level;

  if (visiting.has(key)) return { levels: res, specials };
  visiting.add(key);

  // 🛑 CAP levels
  if (!maxLevels[building] || level > maxLevels[building]) {
    maxLevels[building] = level;
  } else {
    return { levels: res, specials }; // don't go deeper if we've already hit higher
  }

  if (!res[building] || res[building] < level) {
    res[building] = level;
  }

  const buildingData = buildings[building] || {};

  for (let i = 1; i <= level; i++) {
    const reqs = buildingData[i]?.requirements || {};

    for (const r in reqs) {
      if (
        reqs[r] !== null &&
        !["food","lumber","stone","ore","gold","special"].includes(r)
      ) {
        resolve(r, reqs[r], res, specials, visiting, maxLevels);
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

function renderRequired(targetLevels) {
  const el = document.getElementById("required");
  el.innerHTML = "";

  const rows = Object.entries(targetLevels)
    .filter(([b, target]) => (state.currentLevels[b] || 0) < target)
    .map(([b, target]) => {
      const current = state.currentLevels[b] || 0;

      let total = { food: 0, lumber: 0, stone: 0, ore: 0, gold: 0 };

      for (let lvl = current + 1; lvl <= target; lvl++) {
        const cost = buildings[b]?.[lvl]?.requirements || {};
        total.food += cost.food || 0;
        total.lumber += cost.lumber || 0;
        total.stone += cost.stone || 0;
        total.ore += cost.ore || 0;
        total.gold += cost.gold || 0;
      }

      return `
        <div class='result-item'>
          <strong>${formatName(b)}</strong>: ${current} → ${target}
          <div style="font-size:12px; opacity:0.8">
            🥩 ${formatShort(total.food)} 
            🌲 ${formatShort(total.lumber)} 
            🪨 ${formatShort(total.stone)} 
            ⛏ ${formatShort(total.ore)} 
            💰 ${formatShort(total.gold)}
          </div>
        </div>
      `;
    });

  el.innerHTML = rows.join("") || "All requirements met 🎉";
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
    const buildingData = buildings[building];
    if (!buildingData) return false;

    const levelData = buildingData[level];
    if (!levelData || !levelData.requirements) return true;

    const reqs = levelData.requirements || {};

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
    if (!buildingData || !buildingData[level]) {
      console.warn("Missing building/level:", building, level);
      return false;
    }
    return true;
  }

  const simulated = { ...state.currentLevels };
  let progress = true;

  const buildingsToUpgrade = Object.keys(plan); // ✅ use this instead

  while (progress) {
    progress = false;

    const sortedBuildings = [...buildingsToUpgrade].sort(
      (a, b) => getPriority(b) - getPriority(a)
    );

    for (const b of sortedBuildings) {
      const target = targetLevels[b];
      if (!target) continue;
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

function getBlockers(plan, simulated, targetLevels) {
  const blockers = [];

  for (const b in plan) {
    const current = simulated[b] || 0;
    const target = targetLevels[b];

    // Only check if NOT finished
    if (current >= target) continue;

    const nextLevel = current + 1;

    const buildingData = buildings[b];
    if (!buildingData) continue;

    const levelData = buildingData[nextLevel];
    if (!levelData || !levelData.requirements) continue;

    const reqs = levelData.requirements;

    for (const r in reqs) {
      if (
        reqs[r] !== null &&
        !["food", "lumber", "stone", "ore", "gold", "special"].includes(r)
      ) {
        if ((simulated[r] || 0) < reqs[r]) {
          blockers.push({
            building: b,
            requirement: r,
            level: reqs[r]
          });
        }
      }
    }
  }

  return Object.values(
    blockers.reduce((acc, item) => {
      const key = `${item.building}-${item.requirement}-${item.level}`;
      acc[key] = item; // dedupe
      return acc;
    }, {})
  );
}

function renderOrder(order, blockers = []) {
  const container = document.getElementById("build-order")
  container.innerHTML = "";

  if (order.length === 0 && blockers.length === 0) {
    container.innerHTML = "Nothing to build 🎉";
    return;
  }

  // --- Achieved All button at the top ---
  const achievedAllBtn = document.createElement("button");
  achievedAllBtn.textContent = "✔ Achieved All";
  achievedAllBtn.style.marginBottom = "10px";
  achievedAllBtn.onclick = () => {
    const grouped = {};
    order.forEach(step => {
      const [b, lvl] = step.split(" → ");
      grouped[b] = grouped[b] || [];
      grouped[b].push(Number(lvl));
    });
    Object.entries(grouped).forEach(([b, lvls]) => {
      state.currentLevels[b] = Math.max(...lvls);
    });
    save();
    renderCurrent();
    calculate();
  };
  container.appendChild(achievedAllBtn);

  // --- Group steps by building ---
  const grouped = {};
  order.forEach(step => {
    const [b, lvl] = step.split(" → ");
    grouped[b] = grouped[b] || [];
    grouped[b].push(Number(lvl));
  });

  Object.entries(grouped).slice(0, 5).forEach(([building, levels]) => {
    const maxLevel = Math.max(...levels);
    const row = document.createElement("div");
    row.className = "result-item";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.marginBottom = "6px";

    const label = document.createElement("span");
    label.textContent = formatName(building);

    // --- Dropdown for level selection up to max ---
    const select = document.createElement("select");

    const currentLevel = state.currentLevels[building] || 0;

    // Filter + sort (descending)
    const sortedLevels = levels
      .filter(lvl => lvl > currentLevel)
      .sort((a, b) => b - a);

    // Build dropdown
    sortedLevels.forEach(lvl => {
      const option = document.createElement("option");
      option.value = lvl;
      option.textContent = lvl;
      select.appendChild(option);
    });

    // Disable if nothing to upgrade
    if (sortedLevels.length === 0) {
      select.disabled = true;
    } else {
      // Default to NEXT level
      select.value = Math.min(...sortedLevels);
    }

    // --- Achieved button ---
    const btn = document.createElement("button");
    btn.textContent = "✔ Achieved";
    btn.disabled = select.disabled;
    btn.onclick = () => {
      const selectedLvl = Number(select.value);
      state.currentLevels[building] = selectedLvl;
      save();
      renderCurrent();
      calculate();
      row.style.opacity = "0.5";
      btn.disabled = true;
    };

    row.appendChild(label);
    row.appendChild(select);
    row.appendChild(btn);
    container.appendChild(row);
  });

  if (blockers.length > 0) {
    const blockHeader = document.createElement("div");
    blockHeader.style.marginTop = "10px";
    blockHeader.style.color = "#f87171";
    blockHeader.style.fontWeight = "bold";
    blockHeader.textContent = "Blocked:";
    container.appendChild(blockHeader);

    // --- Group blockers by level ---
    const blockersByLevel = {};

    blockers.forEach(b => {
      blockersByLevel[b.level] = blockersByLevel[b.level] || [];
      blockersByLevel[b.level].push(b);
    });

    // --- Sort levels ascending ---
    const sortedLevels = Object.keys(blockersByLevel)
      .map(Number)
      .sort((a, b) => a - b);

    // --- Render grouped blockers ---
    sortedLevels.forEach(level => {
      const levelHeader = document.createElement("div");
      levelHeader.style.marginTop = "6px";
      levelHeader.style.fontWeight = "bold";
      levelHeader.textContent = `Level ${level}`;
      container.appendChild(levelHeader);

      blockersByLevel[level].sort((a, b) => getPriority(b.building) - getPriority(a.building)).forEach(b => {
        const item = document.createElement("div");
        item.className = "result-item";
        item.textContent =
          `❌ ${formatName(b.requirement)} needed for ${formatName(b.building)}`;
        container.appendChild(item);
      });
    });
  }

  const DISPLAY_LIMIT = 5;
  const groupedEntries = Object.entries(grouped);

  if (groupedEntries.length > DISPLAY_LIMIT) {
    const more = document.createElement("div");
    more.style.marginTop = "8px";
    more.style.opacity = "0.7";

    const remaining = groupedEntries.length - DISPLAY_LIMIT;
    more.textContent = `...and ${remaining} more buildings`;

    container.appendChild(more);
  }
}

async function calculate() {
  const loader = document.getElementById("loader");
  loader.classList.remove("hidden"); // show loader

  // Give the browser a moment to render the loader
  await new Promise(resolve => setTimeout(resolve, 10));

  // ---- Heavy computation starts here ----
  const { levels, specials } = resolve(state.goal.building, state.goal.level);
  const plan = getPlan(state.currentLevels, levels);
  const resources = calcResources(plan);
  const order = getBuildOrder(plan, levels);

  const simulated = { ...state.currentLevels };
  order.forEach(step => {
    const [b, lvl] = step.split(" → ");
    simulated[b] = Number(lvl);
  });

  const blockers = getBlockers(plan, simulated, levels);

  renderRequired(levels);
  renderResources(resources);
  renderSpecials(specials);
  renderOrder(order, blockers);
  // ---- Heavy computation ends ----

  loader.classList.add("hidden"); // hide loader
}

document.getElementById("calc-btn").addEventListener("click", calculate);
loadData();

document.addEventListener("click", e => {
  if (e.target.classList.contains("section-header")) {
    const section = e.target.closest(".section");
    const body = section.querySelector(".section-body");
    body.classList.toggle("hidden");
    saveCollapsed();
  }
});

