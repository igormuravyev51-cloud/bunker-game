const socket = io();
let introCountdown = null;

socket.on("connect", () => {
  socket.emit("join_game", { name: "TV", role: "tv", room_id: "default" });
});

socket.on("tv_state", (state) => {
  handleIntro(state);
  renderRound(state);
  renderButtons(state);
  renderDisaster(state);
  renderBunker(state);
  renderVote(state);
  renderVoteResult(state);
  renderFinal(state);
  renderEpilogues(state);
  renderPlayers(state);
});

socket.on("start_error", (res) => alert(res.error));

const btnStart = document.getElementById("btn-start");
const btnVote = document.getElementById("btn-vote");
const btnNextRound = document.getElementById("btn-next-round");
const btnResolve = document.getElementById("btn-resolve");
const btnIntroSkip = document.getElementById("btn-intro-skip");

btnStart.onclick = () => socket.emit("start_game");
btnVote.onclick = () => socket.emit("start_voting");
btnNextRound.onclick = () => socket.emit("next_round");
btnResolve.onclick = () => socket.emit("resolve_misfortune");
btnIntroSkip.onclick = () => {
  clearInterval(introCountdown);
  socket.emit("finish_intro");
};

// ---------- ВСТУПЛЕНИЕ ----------
let introWasActive = false;

function handleIntro(state) {
  const introEl = document.getElementById("intro");
  const mainEl = document.getElementById("main");

  if (state.phase === "intro" && state.disaster) {
    introEl.classList.remove("hidden");
    mainEl.classList.add("hidden");

    if (!introWasActive) {
      // Запускаем вступление первый раз
      introWasActive = true;
      startIntroAnimation(state.disaster);
    }
  } else {
    introEl.classList.add("hidden");
    mainEl.classList.remove("hidden");
    if (introWasActive) {
      introWasActive = false;
      clearInterval(introCountdown);
    }
  }
}

function startIntroAnimation(disaster) {
  const icon = document.getElementById("intro-icon");
  const tagline = document.getElementById("intro-tagline");
  const title = document.getElementById("intro-title");
  const desc = document.getElementById("intro-desc");
  const timer = document.getElementById("intro-timer");

  // Сброс
  icon.style.opacity = "0";
  tagline.style.opacity = "0";
  title.style.opacity = "0";
  desc.style.opacity = "0";

  icon.textContent = disaster.icon;
  tagline.textContent = (disaster.tagline || "").toUpperCase();
  title.textContent = disaster.name;
  desc.textContent = disaster.desc;

  // Поэтапное появление
  setTimeout(() => icon.style.opacity = "1", 200);
  setTimeout(() => tagline.style.opacity = "1", 1200);
  setTimeout(() => title.style.opacity = "1", 2200);
  setTimeout(() => desc.style.opacity = "1", 3600);

  // Обратный отсчёт 12 секунд
  let t = 12;
  timer.textContent = t;
  clearInterval(introCountdown);
  introCountdown = setInterval(() => {
    t--;
    timer.textContent = t;
    if (t <= 0) {
      clearInterval(introCountdown);
      socket.emit("finish_intro");
    }
  }, 1000);
}

// ---------- КНОПКИ ----------
function renderButtons(state) {
  const p = state.phase;
  btnStart.style.display     = (p === "lobby" && state.players.length >= 2) ? "block" : "none";
  btnVote.style.display      = (p === "discussion") ? "block" : "none";
  btnNextRound.style.display = (p === "vote_result") ? "block" : "none";
  btnResolve.style.display   = (p === "final") ? "block" : "none";
}

// ---------- РАУНД ----------
function renderRound(state) {
  const roundEl = document.getElementById("round");
  const timerEl = document.getElementById("timer");
  const phaseNames = {
    lobby: "Лобби",
    intro: "Вступление",
    discussion: "Обсуждение",
    voting: "Голосование",
    vote_result: "Результат",
    final: "Финал",
    end: "Конец",
  };

  if (state.phase === "lobby") {
    roundEl.textContent = `Игроков в лобби: ${state.players.length}`;
  } else if (state.phase === "final" || state.phase === "end") {
    roundEl.textContent = "ФИНАЛ";
  } else {
    roundEl.textContent = `Раунд ${state.round} • ${phaseNames[state.phase] || state.phase}`;
  }
  if (timerEl) timerEl.textContent = "";
}

function renderDisaster(state) {
  const panel = document.getElementById("disaster-panel");
  if (!state.disaster || state.phase === "intro") { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  document.getElementById("disaster-icon").textContent = state.disaster.icon;
  document.getElementById("disaster-tagline").textContent = state.disaster.tagline || "";
  document.getElementById("disaster-name").textContent = state.disaster.name;
  document.getElementById("disaster-desc").textContent = state.disaster.desc;
}

function renderBunker(state) {
  const panel = document.getElementById("bunker-panel");
  if (!state.bunker || state.phase === "intro") { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  const b = state.bunker;
  document.getElementById("bunker-grid").innerHTML = `
    <div class="bunker-chip"><span class="bunker-chip-icon">🚪</span><span class="bunker-chip-label">Мест</span><span class="bunker-chip-value">${b.slots ?? "?"}</span></div>
    <div class="bunker-chip"><span class="bunker-chip-icon">📐</span><span class="bunker-chip-label">Площадь</span><span class="bunker-chip-value">${b.size ?? "?"} м²</span></div>
    <div class="bunker-chip"><span class="bunker-chip-icon">🍞</span><span class="bunker-chip-label">Еда</span><span class="bunker-chip-value">${b.food ?? "?"} мес.</span></div>
    <div class="bunker-chip"><span class="bunker-chip-icon">💧</span><span class="bunker-chip-label">Вода</span><span class="bunker-chip-value">${b.water ?? "?"} мес.</span></div>
    <div class="bunker-chip"><span class="bunker-chip-icon">⚡</span><span class="bunker-chip-label">Энергия</span><span class="bunker-chip-value">${b.power ?? "?"} мес.</span></div>
    <div class="bunker-chip"><span class="bunker-chip-icon">💊</span><span class="bunker-chip-label">Медикаменты</span><span class="bunker-chip-value">${b.med ?? "?"} мес.</span></div>
  `;
}

function renderVote(state) {
  const panel = document.getElementById("vote-panel");
  if (state.phase !== "voting") { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");

  document.getElementById("vote-subtitle").textContent =
    `Проголосовали: ${state.votes_count} / ${state.alive_count}`;

  const grid = document.getElementById("vote-grid");
  grid.innerHTML = "";
  const tally = state.votes_tally || {};

  state.players.filter(p => p.alive).forEach(p => {
    const votes = tally[p.id] || 0;
    const tile = document.createElement("div");
    tile.className = "vote-tile" + (votes > 0 ? " has-votes" : "");
    const avatarHtml = p.avatar_photo
      ? `<img src="${p.avatar_photo}" class="vote-avatar-img">`
      : `<div class="vote-avatar">${p.avatar}</div>`;
    tile.innerHTML = `
      ${avatarHtml}
      <div class="vote-name">${p.name}</div>
      <div class="vote-count">${votes > 0 ? `${votes} 🗳️` : "—"}</div>
    `;
    grid.appendChild(tile);
  });
}

function renderVoteResult(state) {
  const panel = document.getElementById("vote-result");
  if (state.phase !== "vote_result") { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");

  const iconEl = document.getElementById("vote-result-icon");
  const nameEl = document.getElementById("vote-result-name");
  const textEl = document.getElementById("vote-result-text");

  if (state.last_excluded) {
    const p = state.players.find(x => x.id === state.last_excluded);
    iconEl.textContent = "💀";
    nameEl.textContent = p ? p.name : "—";
    textEl.textContent = "ВЫГНАН ИЗ БУНКЕРА";
    panel.classList.add("death-anim");
    setTimeout(() => panel.classList.remove("death-anim"), 2000);
  } else {
    iconEl.textContent = "🤝";
    nameEl.textContent = "Никто не исключён";
    textEl.textContent = "Ничья или Щит спас игрока";
    panel.classList.remove("death-anim");
  }
}

function renderFinal(state) {
  const panel = document.getElementById("final-panel");
  if (state.phase !== "final" && state.phase !== "end") {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const grid = document.getElementById("final-grid");
  grid.innerHTML = "";

  state.final_misfortunes.forEach((mf, i) => {
    const result = state.final_results[i];
    let status = "⏳ Ожидание";
    let cls = "pending";
    if (result) {
      status = result.passed
        ? `✅ ПРОЙДЕНО (${result.score}/${result.threshold})`
        : `❌ ПРОВАЛЕНО (${result.score}/${result.threshold})`;
      cls = result.passed ? "passed" : "failed";
    } else if (i === state.final_index) {
      status = `⚡ Сейчас (порог ${mf.threshold})`;
      cls = "current";
    }

    const card = document.createElement("div");
    card.className = `misfortune-card ${cls}`;
    card.innerHTML = `
      <div class="misfortune-icon">${mf.icon}</div>
      <div class="misfortune-name">${mf.name}</div>
      <div class="misfortune-desc">${mf.desc}</div>
      <div class="misfortune-status">${status}</div>
    `;
    grid.appendChild(card);
  });

  const subtitle = document.getElementById("final-subtitle");
  if (state.phase === "end") {
    subtitle.innerHTML = state.winner
      ? `<span class="win-text">🏆 ПОБЕДА! Бункер выжил</span>`
      : `<span class="lose-text">💀 ПОРАЖЕНИЕ. Бункер погиб</span>`;
  } else {
    subtitle.textContent = `Несчастье ${state.final_index + 1} из 2`;
  }
}

function renderEpilogues(state) {
  const panel = document.getElementById("epilogues-panel");
  if (state.phase !== "end" || !state.epilogues) {
    panel.classList.add("hidden");
    return;
  }
  const entries = Object.entries(state.epilogues);
  if (!entries.length) { panel.classList.add("hidden"); return; }

  panel.classList.remove("hidden");
  const grid = document.getElementById("epilogues-grid");
  grid.innerHTML = "";

  entries.forEach(([pid, text]) => {
    const p = state.players.find(x => x.id === pid);
    if (!p) return;
    const card = document.createElement("div");
    card.className = "epilogue-card" + (p.alive && state.winner ? "" : " lost");
    const avatarHtml = p.avatar_photo
      ? `<img src="${p.avatar_photo}" class="epilogue-avatar-img">`
      : `<div class="epilogue-avatar">${p.avatar}</div>`;
    card.innerHTML = `
      ${avatarHtml}
      <div class="epilogue-body">
        <div class="epilogue-name">${p.name}</div>
        <div class="epilogue-text">${text}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderPlayers(state) {
  const container = document.getElementById("players");
  container.innerHTML = "";
  state.players.forEach(p => {
    const isActive = p.id === state.active_player_id;
    const tile = document.createElement("div");
    tile.className = "player-tile " +
      (p.alive ? "alive" : "dead") +
      (p.in_bunker ? " in-bunker" : "") +
      (isActive ? " active-turn" : "");

    const chips = Object.values(p.revealed_cards || {}).map(c =>
      `<div class="revealed-chip reveal-anim">${c.icon} ${c.title}</div>`
    ).join("");

    const avatarHtml = p.avatar_photo
      ? `<img src="${p.avatar_photo}" class="player-avatar-img">`
      : `<div class="player-avatar">${p.avatar}</div>`;

    const turnBadge = isActive && p.alive ? `<div class="turn-badge">🎬 ХОД</div>` : "";
    const shieldBadge = p.has_shield ? `<div class="shield-badge">🛡️</div>` : "";

    tile.innerHTML = `
      ${turnBadge}
      ${shieldBadge}
      ${avatarHtml}
      <div class="player-name">${p.name}</div>
      <div class="player-status">${
        !p.alive ? "💀 Выгнан" :
        p.in_bunker ? "🏠 В бункере" : "⏳ Ждёт"
      }</div>
      <div class="revealed-cards">${chips}</div>
    `;
    container.appendChild(tile);
  });
}