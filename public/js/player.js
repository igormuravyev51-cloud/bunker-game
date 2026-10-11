const socket = io();
let myId = null;
let currentPhoto = null;
let myAbilityUses = {};
let myAbilities = [];
let myNotes = [];
let mySentNotes = [];
let others = [];
let isMyTurn = false;
let alive = true;
let hasVoted = false;
let currentPhase = "lobby";
let currentAbility = null;
let pendingTarget = null;
let pendingCardType = null;
let noteTarget = null;

const CARD_LABELS = {
  profession: "Профессия",
  health: "Здоровье",
  hobby: "Хобби",
  baggage: "Багаж",
  fact: "Факт",
};

const ABILITIES = {
  thief:     { name: "Вор",        icon: "🦹", targeting: "player+cardType", timing: "own_turn", tagline: "Ограбление века",        desc: "Ты выбираешь одного игрока и одну его карту. Карта переходит к тебе, а жертва получает новую случайную." },
  spy:       { name: "Шпион",      icon: "🔍", targeting: "player+cardType", timing: "own_turn", tagline: "Я знаю твой секрет",     desc: "Ты тайно подсматриваешь одну карту игрока. Только ты увидишь результат. 2 использования." },
  shield:    { name: "Щит",        icon: "🛡️", targeting: "self",            timing: "anytime",  tagline: "Меня не тронуть",        desc: "Активирует щит на 1 раунд голосования. Тебя не исключат, даже если большинство проголосует против." },
  curse:     { name: "Проклятие",  icon: "💀", targeting: "player+cardType", timing: "own_turn", tagline: "Твоя жизнь теперь хуже", desc: "Заменяет карту игрока на самую худшую из колоды того же типа." },
  anonymous: { name: "Аноним",     icon: "🎭", targeting: "self",            timing: "anytime",  tagline: "Никто не узнает",        desc: "Твой голос в следующем голосовании будет скрыт." },
};

// ---------- ФОТО ----------
const fileInput = document.getElementById("file-input");
document.getElementById("btn-photo")?.addEventListener("click", () => fileInput.click());
document.getElementById("btn-change-photo")?.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await compressImage(file, 256, 0.7);
  currentPhoto = dataUrl;
  localStorage.setItem("bunker_photo", dataUrl);
  document.getElementById("avatar-preview").innerHTML = `<img src="${dataUrl}" class="avatar-img-lg">`;
  if (myId) socket.emit("set_avatar", { photo: dataUrl });
});

function compressImage(file, maxSize, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
        else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- ВХОД ----------
document.getElementById("btn-join").addEventListener("click", () => {
  const name = document.getElementById("name-input").value.trim();
  if (!name) { showToast("Введи имя!", "error"); return; }
  localStorage.setItem("bunker_player_name", name);

  const savedId = localStorage.getItem("bunker_player_id");
  socket.emit("join_game", {
    name,
    role: "player",
    room_id: "default",
    player_id: savedId || null,
  });

  if (currentPhoto) setTimeout(() => socket.emit("set_avatar", { photo: currentPhoto }), 300);
  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
});

socket.on("connect", () => {
  const savedId = localStorage.getItem("bunker_player_id");
  const savedName = localStorage.getItem("bunker_player_name");
  const savedPhoto = localStorage.getItem("bunker_photo");
  if (savedPhoto) currentPhoto = savedPhoto;

  if (savedId && savedName) {
    socket.emit("join_game", {
      name: savedName,
      role: "player",
      room_id: "default",
      player_id: savedId,
    });
    document.getElementById("lobby").classList.add("hidden");
    document.getElementById("game").classList.remove("hidden");
    if (savedPhoto) setTimeout(() => socket.emit("set_avatar", { photo: savedPhoto }), 500);
  }
});

socket.on("reconnected", (data) => {
  if (data.player_id) localStorage.setItem("bunker_player_id", data.player_id);
});

// ---------- СЕРВЕР ----------
socket.on("me", (view) => {
  myId = view.me.id;
  myAbilities = view.me.abilities || [];
  myAbilityUses = view.me.ability_uses || {};
  myNotes = view.me.notes || [];
  mySentNotes = view.me.sent_notes || [];
  others = view.others || [];
  isMyTurn = !!view.me.is_my_turn;
  alive = view.me.alive;
  hasVoted = !!view.me.has_voted;
  currentPhase = view.phase;

  renderMe(view.me);
  renderAbilities();
  renderOthers();
  renderNotes();
  renderPhaseUI();
  renderEpilogue(view.epilogue, view.phase);
});

socket.on("ability_result", (res) => {
  if (res.ok) showToast("✅ " + res.message, "ok");
  else showToast("❌ " + res.error, "error");
  closeAbilityModal();
});

socket.on("vote_error", (res) => showToast("❌ " + res.error, "error"));
socket.on("note_error", (res) => showToast("❌ " + res.error, "error"));
socket.on("note_sent", () => {
  showToast("✉️ Записка отправлена анонимно", "ok");
  closeNoteModal();
});

// ---------- ФАЗЫ ----------
function renderPhaseUI() {
  const turnBanner = document.getElementById("turn-banner");
  const voteBanner = document.getElementById("vote-banner");
  const voteList = document.getElementById("vote-list");
  const btnNext = document.getElementById("btn-next-turn");
  const finalPanel = document.getElementById("final-panel");

  turnBanner.classList.add("hidden");
  btnNext.classList.add("hidden");
  voteBanner.classList.add("hidden");
  voteList.classList.add("hidden");
  finalPanel.classList.add("hidden");

  if (!alive) {
    document.getElementById("my-status").textContent = "💀 ВЫГНАН";
  }

  if (currentPhase === "discussion" && isMyTurn && alive) {
    turnBanner.classList.remove("hidden");
    btnNext.classList.remove("hidden");
  }

  if (currentPhase === "voting" && alive) {
    if (!hasVoted) {
      voteBanner.classList.remove("hidden");
      voteList.classList.remove("hidden");
      voteBanner.textContent = "🗳️ ГОЛОСОВАНИЕ — выбери кого выгнать";
      renderVoteList();
    } else {
      voteBanner.classList.remove("hidden");
      voteBanner.textContent = "✅ Голос отдан. Ждём остальных...";
    }
  }

  if (currentPhase === "final" || currentPhase === "end") {
    finalPanel.classList.remove("hidden");
  }
}

function renderVoteList() {
  const list = document.getElementById("vote-list");
  list.innerHTML = "";
  const aliveOthers = others.filter(o => o.alive);
  if (!aliveOthers.length) {
    list.innerHTML = '<div class="empty">Некого выбирать</div>';
    return;
  }
  aliveOthers.forEach(o => {
    const btn = document.createElement("button");
    btn.className = "vote-btn";
    const avatarHtml = o.avatar_photo
      ? `<img src="${o.avatar_photo}" class="avatar-tiny">`
      : `<span class="target-emoji">${o.avatar}</span>`;
    btn.innerHTML = `${avatarHtml}<span>${o.name}</span>`;
    btn.onclick = () => {
      if (!confirm(`Проголосовать против ${o.name}?`)) return;
      socket.emit("cast_vote", { target_id: o.id });
      hasVoted = true;
      renderPhaseUI();
    };
    list.appendChild(btn);
  });
}

// ---------- РЕНДЕР ----------
function renderMe(me) {
  document.getElementById("my-avatar").textContent = me.avatar;
  document.getElementById("my-name").textContent = me.name;
  document.getElementById("my-status").textContent = me.alive ? "Живой" : "💀 ВЫГНАН";

  const photoEl = document.getElementById("my-photo");
  if (me.avatar_photo) {
    photoEl.src = me.avatar_photo;
    photoEl.style.display = "block";
    document.getElementById("my-avatar").style.display = "none";
  } else {
    photoEl.style.display = "none";
    document.getElementById("my-avatar").style.display = "block";
  }

  const cardsEl = document.getElementById("my-cards");
  cardsEl.innerHTML = "";
  Object.entries(me.cards).forEach(([type, card]) => {
    const isRevealed = me.revealed.includes(type);
    const div = document.createElement("div");
    div.className = "card-item" + (isRevealed ? " revealed" : "");
    div.innerHTML = `
      <div class="card-icon">${card.icon}</div>
      <div class="card-body">
        <div class="card-type">${CARD_LABELS[type] || type}</div>
        <div class="card-title">${card.title}</div>
        <div class="card-value">${card.value}</div>
      </div>
      <button class="reveal-btn" ${isRevealed || !isMyTurn || !alive ? "disabled" : ""}>
        ${isRevealed ? "✓ Открыто" : (isMyTurn && alive ? "Открыть" : "🔒 Жди хода")}
      </button>
    `;
    if (!isRevealed && isMyTurn && alive) {
      div.querySelector("button").onclick = () => socket.emit("reveal_card", { card_type: type });
    }
    cardsEl.appendChild(div);
  });
}

function renderAbilities() {
  const el = document.getElementById("my-abilities");
  el.innerHTML = "";
  if (!myAbilities.length) {
    el.innerHTML = '<div class="empty">Пока нет способностей</div>';
    return;
  }
  myAbilities.forEach(id => {
    const ab = ABILITIES[id];
    const left = myAbilityUses[id] ?? 0;
    const isOwnTurn = ab.timing === "own_turn";
    const blockedByTurn = isOwnTurn && !isMyTurn;
    const disabled = left <= 0 || blockedByTurn || !alive;

    const div = document.createElement("div");
    div.className = "ability-card" + (left <= 0 ? " used" : "");

    let hintHtml = "";
    if (blockedByTurn) hintHtml = `<div class="ability-hint">🔒 Только в свой ход</div>`;
    else if (isOwnTurn) hintHtml = `<div class="ability-hint ok">🎬 Можно в свой ход</div>`;
    else hintHtml = `<div class="ability-hint ok">♾️ Можно в любой момент</div>`;

    div.innerHTML = `
      <div class="ability-icon">${ab.icon}</div>
      <div class="ability-info">
        <div class="ability-name">${ab.name}</div>
        <div class="ability-uses">Осталось: ${left}</div>
        ${hintHtml}
      </div>
      <div class="ability-buttons">
        <button class="btn btn-small btn-ghost" data-desc="${id}">📖 Описание</button>
        <button class="btn btn-small" data-use="${id}" ${disabled ? "disabled" : ""}>Использовать</button>
      </div>
    `;
    div.querySelector('[data-desc]').onclick = () => openDescModal(id);
    if (!disabled) div.querySelector('[data-use]').onclick = () => openAbilityModal(id);
    el.appendChild(div);
  });
}

function renderOthers() {
  const el = document.getElementById("others");
  el.innerHTML = "";
  if (!others.length) { el.innerHTML = '<div class="empty">Пока никого нет</div>'; return; }
  others.forEach(p => {
    const chips = Object.values(p.revealed_cards || {}).map(c =>
      `<div class="revealed-chip reveal-anim">${c.icon} ${c.title}</div>`
    ).join("");
    const div = document.createElement("div");
    div.className = "card-item" + (p.alive ? "" : " dead");
    const avatarHtml = p.avatar_photo
      ? `<img src="${p.avatar_photo}" class="avatar-small">`
      : `<div class="card-icon">${p.avatar}</div>`;
    div.innerHTML = `
      ${avatarHtml}
      <div class="card-body">
        <div class="card-title">${p.name} ${p.alive ? "" : "💀"}</div>
        <div class="revealed-cards" style="justify-content:flex-start">${chips || '<span class="dim">Ничего не открыл</span>'}</div>
      </div>
    `;
    el.appendChild(div);
  });
}

// ---------- ЗАПИСКИ ----------
function renderNotes() {
  const list = document.getElementById("notes-list");
  list.innerHTML = "";
  if (!myNotes.length) {
    list.innerHTML = '<div class="empty" style="padding:12px">Пока нет записок</div>';
    return;
  }
  myNotes.slice().reverse().forEach(n => {
    const div = document.createElement("div");
    div.className = "note-item";
    div.innerHTML = `
      <div class="note-header">
        <span class="note-from">✉️ Аноним</span>
        <span class="note-round">Раунд ${n.round}</span>
      </div>
      <div class="note-text">${escapeHtml(n.text)}</div>
    `;
    list.appendChild(div);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

document.getElementById("btn-send-note").onclick = openNoteModal;

function openNoteModal() {
  if (currentPhase !== "discussion" && currentPhase !== "voting") {
    showToast("Записки можно отправлять в фазе обсуждения", "error");
    return;
  }
  if (!alive) {
    showToast("Ты исключён", "error");
    return;
  }
  noteTarget = null;
  document.getElementById("note-text").value = "";
  document.getElementById("note-send").disabled = true;

  const grid = document.getElementById("note-targets");
  grid.innerHTML = "";
  const available = others.filter(o => o.alive && !mySentNotes.includes(o.id));
  if (!available.length) {
    grid.innerHTML = '<div class="empty">Некуда отправлять</div>';
  }
  available.forEach(o => {
    const b = document.createElement("button");
    b.className = "target-btn";
    b.innerHTML = o.avatar_photo
      ? `<img src="${o.avatar_photo}" class="avatar-tiny"><span>${o.name}</span>`
      : `<span class="target-emoji">${o.avatar}</span><span>${o.name}</span>`;
    b.onclick = () => {
      noteTarget = o.id;
      grid.querySelectorAll(".target-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      checkNoteReady();
    };
    grid.appendChild(b);
  });
  document.getElementById("note-modal").classList.remove("hidden");
}

document.getElementById("note-text").addEventListener("input", checkNoteReady);
function checkNoteReady() {
  const text = document.getElementById("note-text").value.trim();
  const ok = noteTarget && text.length >= 2;
  document.getElementById("note-send").disabled = !ok;
}

document.getElementById("note-cancel").onclick = closeNoteModal;
document.getElementById("note-send").onclick = () => {
  const text = document.getElementById("note-text").value.trim();
  if (!noteTarget || !text) return;
  socket.emit("send_note", { to_id: noteTarget, text });
};

function closeNoteModal() {
  document.getElementById("note-modal").classList.add("hidden");
  noteTarget = null;
}

// ---------- ЭПИЛОГ ----------
function renderEpilogue(text, phase) {
  const el = document.getElementById("my-epilogue");
  const hint = document.getElementById("final-hint");
  if (phase === "end" && text) {
    el.classList.remove("hidden");
    el.innerHTML = `
      <div class="my-epilogue-title">📜 ТВОЙ ЭПИЛОГ</div>
      <div class="my-epilogue-text">${escapeHtml(text)}</div>
    `;
    hint.style.display = "none";
  } else {
    el.classList.add("hidden");
    hint.style.display = "block";
  }
}

// ---------- МОДАЛКИ СПОСОБНОСТЕЙ ----------
document.getElementById("btn-next-turn").onclick = () => socket.emit("next_turn");

const modal = document.getElementById("modal");
const descModal = document.getElementById("desc-modal");

function openAbilityModal(abilityId) {
  currentAbility = abilityId;
  pendingTarget = null;
  pendingCardType = null;
  const ab = ABILITIES[abilityId];
  document.getElementById("modal-icon").textContent = ab.icon;
  document.getElementById("modal-title").textContent = ab.name;
  document.getElementById("modal-desc").textContent = ab.tagline || "";
  document.getElementById("modal-confirm").disabled = true;

  const body = document.getElementById("modal-body");
  body.innerHTML = "";

  if (ab.targeting === "self") {
    body.innerHTML = '<div class="modal-hint">Способность действует на тебя. Нажми «Применить».</div>';
    document.getElementById("modal-confirm").disabled = false;
  } else {
    body.innerHTML = '<div class="modal-label">Выбери игрока:</div>';
    const grid = document.createElement("div");
    grid.className = "target-grid";
    others.filter(o => o.alive).forEach(o => {
      const b = document.createElement("button");
      b.className = "target-btn";
      b.innerHTML = o.avatar_photo
        ? `<img src="${o.avatar_photo}" class="avatar-tiny"><span>${o.name}</span>`
        : `<span class="target-emoji">${o.avatar}</span><span>${o.name}</span>`;
      b.onclick = () => {
        pendingTarget = o.id;
        grid.querySelectorAll(".target-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        renderCardTypePicker();
      };
      grid.appendChild(b);
    });
    body.appendChild(grid);
    const cardPicker = document.createElement("div");
    cardPicker.id = "card-picker";
    body.appendChild(cardPicker);
  }
  modal.classList.remove("hidden");
}

function renderCardTypePicker() {
  const picker = document.getElementById("card-picker");
  picker.innerHTML = '<div class="modal-label">Что украсть/проклясть/подсмотреть:</div>';
  const grid = document.createElement("div");
  grid.className = "cardtype-grid";
  Object.entries(CARD_LABELS).forEach(([type, label]) => {
    const b = document.createElement("button");
    b.className = "cardtype-btn";
    b.textContent = label;
    b.onclick = () => {
      pendingCardType = type;
      grid.querySelectorAll(".cardtype-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      document.getElementById("modal-confirm").disabled = false;
    };
    grid.appendChild(b);
  });
  picker.appendChild(grid);
}

document.getElementById("modal-cancel").onclick = closeAbilityModal;
document.getElementById("modal-confirm").onclick = () => {
  socket.emit("use_ability_event", {
    ability_id: currentAbility,
    target_id: pendingTarget,
    card_type: pendingCardType,
  });
};

function closeAbilityModal() {
  modal.classList.add("hidden");
  currentAbility = null;
  pendingTarget = null;
  pendingCardType = null;
}

function openDescModal(abilityId) {
  const ab = ABILITIES[abilityId];
  document.getElementById("desc-icon").textContent = ab.icon;
  document.getElementById("desc-tagline").textContent = ab.tagline || "";
  document.getElementById("desc-title").textContent = ab.name;
  document.getElementById("desc-text").textContent = ab.desc;
  const timingEl = document.getElementById("desc-timing");
  if (ab.timing === "own_turn") {
    timingEl.innerHTML = "🎬 <b>Используется только в свой ход</b>";
    timingEl.className = "desc-timing warn";
  } else {
    timingEl.innerHTML = "♾️ <b>Можно использовать в любой момент</b>";
    timingEl.className = "desc-timing ok";
  }
  descModal.classList.remove("hidden");
}
document.getElementById("desc-close").onclick = () => descModal.classList.add("hidden");

// ---------- ТОСТ ----------
let toastTimer = null;
function showToast(text, kind = "ok") {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.className = "toast " + kind;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3000);
}