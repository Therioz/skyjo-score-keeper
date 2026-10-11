"use strict";

// --- Estado -------------------------------------------------------------
// Todo se deriva de `players` y `rounds`; los totales y el fin de partida
// se recalculan cada vez, así que corregir una ronda antigua siempre es seguro.

const STORAGE_KEY = "skyjo-marcador-v1";
const TARGET = 100;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const MIN_ROUND = -24; // 12 cartas de -2
const MAX_ROUND = 144; // 12 cartas de 12

const defaultState = () => ({
  screen: "setup",
  draftNames: ["", ""],
  players: [], // [{ id, name }]
  rounds: [], // [{ [playerId]: score }]
});

let state = load();
let editingRound = null; // índice de la ronda que se corrige, o null para una nueva

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.players) && Array.isArray(saved.rounds)) {
      // No reabrimos formularios a medias: volvemos al marcador.
      if (saved.screen === "round" || saved.screen === "history") saved.screen = "board";
      return { ...defaultState(), ...saved };
    }
  } catch (e) {
    // Almacenamiento no disponible o datos dañados: empezamos de cero.
  }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Modo privado sin almacenamiento: la app sigue funcionando sin guardar.
  }
}

function totals() {
  const sums = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  for (const round of state.rounds) {
    for (const p of state.players) sums[p.id] += round[p.id] ?? 0;
  }
  return sums;
}

function gameResult(sums) {
  const values = state.players.map((p) => sums[p.id]);
  if (!values.length || Math.max(...values) < TARGET) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return {
    losers: state.players.filter((p) => sums[p.id] === max),
    winners: state.players.filter((p) => sums[p.id] === min),
  };
}

// --- Utilidades ---------------------------------------------------------

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function joinNames(players) {
  const names = players.map((p) => p.name);
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " y " + names.at(-1);
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function go(screen) {
  state.screen = screen;
  save();
  render();
}

// --- Pantalla de jugadores ----------------------------------------------

function renderSetup() {
  const list = $("#player-list");
  list.replaceChildren();
  state.draftNames.forEach((name, i) => {
    const input = el("input", {
      className: "text-input",
      type: "text",
      value: name,
      placeholder: `Jugador ${i + 1}`,
      maxLength: 20,
      autocapitalize: "words",
      autocomplete: "off",
      enterKeyHint: i === state.draftNames.length - 1 ? "done" : "next",
    });
    input.setAttribute("aria-label", `Nombre del jugador ${i + 1}`);
    input.addEventListener("input", () => {
      state.draftNames[i] = input.value;
      save();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const next = list.querySelectorAll("input")[i + 1];
      if (next) next.focus();
      else input.blur();
    });

    const remove = el("button", { className: "icon-btn", type: "button", textContent: "✕" });
    remove.setAttribute("aria-label", `Quitar jugador ${i + 1}`);
    remove.disabled = state.draftNames.length <= MIN_PLAYERS;
    remove.addEventListener("click", () => {
      state.draftNames.splice(i, 1);
      save();
      renderSetup();
    });

    list.append(el("li", {}, input, remove));
  });
  $("#btn-add-player").hidden = state.draftNames.length >= MAX_PLAYERS;
  $("#setup-error").textContent = "";
}

$("#btn-add-player").addEventListener("click", () => {
  if (state.draftNames.length >= MAX_PLAYERS) return;
  state.draftNames.push("");
  save();
  renderSetup();
  const inputs = $("#player-list").querySelectorAll("input");
  inputs[inputs.length - 1].focus();
});

$("#btn-start").addEventListener("click", () => {
  const names = state.draftNames.map((n) => n.trim());
  const error = $("#setup-error");
  if (names.some((n) => !n)) {
    error.textContent = "Escribe el nombre de todos los jugadores.";
    return;
  }
  const lower = names.map((n) => n.toLocaleLowerCase("es"));
  if (new Set(lower).size !== lower.length) {
    error.textContent = "Hay nombres repetidos.";
    return;
  }
  state.players = names.map((name) => ({ id: newId(), name }));
  state.rounds = [];
  go("board");
});

// --- Marcador -----------------------------------------------------------

function renderBoard() {
  const sums = totals();
  const result = gameResult(sums);
  const lastRound = state.rounds.at(-1);

  $("#round-title").textContent = result
    ? "Fin de la partida"
    : `Ronda ${state.rounds.length + 1}`;

  const gameOver = $("#game-over");
  gameOver.hidden = !result;
  if (result) {
    const l = result.losers;
    const w = result.winners;
    $("#game-over-loser").textContent =
      l.length === 1 ? `¡${l[0].name} ha perdido!` : `¡${joinNames(l)} han perdido!`;
    $("#game-over-winner").textContent =
      w.length === 1 ? `Gana ${w[0].name} 🏆` : `Empate: ganan ${joinNames(w)} 🏆`;
  }

  const sorted = [...state.players].sort((a, b) => sums[a.id] - sums[b.id]);
  const minTotal = sums[sorted[0].id];
  const list = $("#leaderboard");
  list.replaceChildren();
  sorted.forEach((p, i) => {
    const total = sums[p.id];
    const pct = Math.max(0, Math.min(100, (total / TARGET) * 100));
    const classes = [];
    if (total >= TARGET) classes.push("danger");
    else if (total >= 80) classes.push("warn");
    if (state.rounds.length && total === minTotal) classes.push("leader");
    if (result && result.losers.includes(p)) classes.push("lost");

    const last = lastRound
      ? el("span", { className: "last", textContent: `(${lastRound[p.id] > 0 ? "+" : ""}${lastRound[p.id]})` })
      : "";
    const bar = el("div", { className: "bar" }, el("span", { style: `width:${pct}%` }));
    bar.setAttribute("aria-hidden", "true");

    list.append(
      el(
        "li",
        { className: classes.join(" ") },
        el("span", { className: "pos", textContent: `${i + 1}.` }),
        el("span", { className: "name", textContent: p.name }),
        el("span", { className: "total", textContent: total }, last),
        bar,
      ),
    );
  });

  $("#btn-add-round").hidden = !!result;
  $("#btn-play-again").hidden = !result;
  $("#btn-history").hidden = state.rounds.length === 0;
}

$("#btn-add-round").addEventListener("click", () => {
  editingRound = null;
  go("round");
});

$("#btn-play-again").addEventListener("click", () => {
  state.rounds = [];
  go("board");
});

$("#btn-history").addEventListener("click", () => go("history"));

// --- Reiniciar ----------------------------------------------------------

const resetDialog = $("#dialog-reset");

$("#btn-menu-reset").addEventListener("click", () => resetDialog.showModal());
$("#btn-reset-cancel").addEventListener("click", () => resetDialog.close());

$("#btn-reset-keep").addEventListener("click", () => {
  resetDialog.close();
  state.rounds = [];
  go("board");
});

$("#btn-reset-all").addEventListener("click", () => {
  resetDialog.close();
  const names = state.players.map(() => "");
  state = defaultState();
  state.draftNames = names.length >= MIN_PLAYERS ? names : state.draftNames;
  go("setup");
});

// --- Introducir / corregir ronda ----------------------------------------

function parseScore(raw) {
  // Acepta el signo menos normal y el "−" tipográfico que a veces inserta iOS.
  const text = raw.trim().replace(/[−–]/g, "-");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_ROUND && n <= MAX_ROUND ? n : null;
}

function renderRoundForm() {
  const isEdit = editingRound !== null;
  const existing = isEdit ? state.rounds[editingRound] : null;
  const number = isEdit ? editingRound + 1 : state.rounds.length + 1;
  $("#round-form-title").textContent = isEdit ? `Corregir ronda ${number}` : `Ronda ${number}`;
  $("#btn-delete-round").hidden = !isEdit;
  $("#round-error").textContent = "";

  const list = $("#round-inputs");
  list.replaceChildren();
  state.players.forEach((p, i) => {
    const input = el("input", {
      className: "text-input",
      type: "text",
      inputMode: "numeric",
      autocomplete: "off",
      value: existing ? String(existing[p.id]) : "",
      placeholder: "0",
      enterKeyHint: i === state.players.length - 1 ? "done" : "next",
    });
    input.dataset.playerId = p.id;
    input.setAttribute("aria-label", `Puntos de ${p.name}`);
    input.addEventListener("input", () => input.classList.remove("invalid"));
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const next = list.querySelectorAll("input")[i + 1];
      if (next) next.focus();
      else $("#round-form").requestSubmit();
    });

    // El teclado numérico del iPhone no tiene signo menos, así que lo ponemos aquí.
    const sign = el("button", { className: "icon-btn", type: "button", textContent: "±" });
    sign.setAttribute("aria-label", `Cambiar signo de ${p.name}`);
    sign.addEventListener("click", () => {
      const v = input.value.trim().replace(/[−–]/g, "-");
      input.value = v.startsWith("-") ? v.slice(1) : "-" + v;
      input.classList.remove("invalid");
    });

    list.append(el("li", {}, el("span", { className: "label", textContent: p.name }), sign, input));
  });

  if (!isEdit) list.querySelector("input")?.focus();
}

$("#round-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const round = {};
  let firstBad = null;
  for (const input of $("#round-inputs").querySelectorAll("input")) {
    const score = parseScore(input.value);
    input.classList.toggle("invalid", score === null);
    if (score === null && !firstBad) firstBad = input;
    round[input.dataset.playerId] = score;
  }
  if (firstBad) {
    $("#round-error").textContent = `Escribe un número entero entre ${MIN_ROUND} y ${MAX_ROUND} para cada jugador.`;
    firstBad.focus();
    return;
  }
  if (editingRound !== null) state.rounds[editingRound] = round;
  else state.rounds.push(round);
  const backTo = editingRound !== null ? "history" : "board";
  editingRound = null;
  go(backTo);
});

$("#btn-cancel-round").addEventListener("click", () => {
  const backTo = editingRound !== null ? "history" : "board";
  editingRound = null;
  go(backTo);
});

$("#btn-delete-round").addEventListener("click", () => {
  if (editingRound === null) return;
  if (!confirm(`¿Borrar la ronda ${editingRound + 1}?`)) return;
  state.rounds.splice(editingRound, 1);
  editingRound = null;
  go(state.rounds.length ? "history" : "board");
});

// --- Historial ----------------------------------------------------------

function renderHistory() {
  const table = $("#history-table");
  const sums = totals();
  const headRow = el("tr", {}, el("th", { textContent: "Ronda" }), ...state.players.map((p) => el("th", { textContent: p.name })));
  const body = el("tbody");
  state.rounds.forEach((round, i) => {
    const row = el("tr", {}, el("td", { textContent: i + 1 }), ...state.players.map((p) => el("td", { textContent: round[p.id] })));
    row.addEventListener("click", () => {
      editingRound = i;
      go("round");
    });
    body.append(row);
  });
  const foot = el("tfoot", {}, el("tr", {}, el("td", { textContent: "Total" }), ...state.players.map((p) => el("td", { textContent: sums[p.id] }))));
  table.replaceChildren(el("thead", {}, headRow), body, foot);
}

$("#btn-close-history").addEventListener("click", () => go("board"));

// --- Render -------------------------------------------------------------

function render() {
  if (state.screen !== "setup" && state.players.length < MIN_PLAYERS) state.screen = "setup";
  for (const s of ["setup", "board", "round", "history"]) {
    $(`#screen-${s}`).hidden = state.screen !== s;
  }
  if (state.screen === "setup") renderSetup();
  if (state.screen === "board") renderBoard();
  if (state.screen === "round") renderRoundForm();
  if (state.screen === "history") renderHistory();
  window.scrollTo(0, 0);
}

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
