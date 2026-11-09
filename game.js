"use strict";

const levels = [
  {
    title: "旧水管", start: "entry",
    rooms: {
      well: { name: "入口井", theme: "copper", depth: 1 },
      basin: { name: "集水室", theme: "water", depth: 2 },
    },
    nodes: {
      entry: { room: "well", x: 278, y: 58, name: "暗门", symbol: "▤" },
      split: { room: "well", x: 122, y: 175, name: "楼梯平台" },
      bend: { room: "well", x: 260, y: 175, name: "横梁" },
      shelf: { room: "well", x: 260, y: 284, name: "旧壁龛", treasure: "眼镜盒", control: "bridge" },
      duct: { room: "well", x: 48, y: 80, name: "废弃风道" },
      pocket: { room: "basin", x: 286, y: 284, name: "维修夹层", treasure: "布包" },
      door: { room: "well", x: 68, y: 368, name: "集水室井口", symbol: "↓" },
      landing: { room: "basin", x: 68, y: 58, name: "入口井梯口", symbol: "↑" },
      rim: { room: "basin", x: 206, y: 174, name: "水槽边" },
      side: { room: "basin", x: 293, y: 174, name: "排水口", treasure: "铜匣" },
      exit: { room: "basin", x: 97, y: 368, name: "泄压区入口", exit: true },
    },
    edges: [
      ["entry", "split"], ["split", "duct"], ["split", "bend"], ["bend", "shelf"], ["split", "door"],
      ["door", "landing"], ["landing", "rim"], ["rim", "side"], ["side", "pocket"], ["pocket", "rim"], ["rim", "exit", "bridge"],
    ],
  },
  {
    title: "泄压区", start: "entry",
    rooms: {
      steam: { name: "喷汽室", theme: "steam", depth: 3 },
      pump: { name: "泵房", theme: "water", depth: 4 },
    },
    nodes: {
      entry: { room: "steam", x: 97, y: 58, name: "泄压区入口", symbol: "▤" },
      rail: { room: "steam", x: 148, y: 178, name: "扶栏边" },
      grille: { room: "steam", x: 284, y: 178, name: "铜栅通道" },
      alcove: { room: "steam", x: 55, y: 265, name: "检修凹室", treasure: "旧工具箱", fuse: true },
      door: { room: "steam", x: 243, y: 368, name: "泵房井口", symbol: "↓" },
      pump: { room: "pump", x: 243, y: 58, name: "喷汽室梯口", symbol: "↑" },
      plank: { room: "pump", x: 80, y: 156, name: "旧木板" },
      walk: { room: "pump", x: 265, y: 246, name: "石台阶", control: "power" },
      exit: { room: "pump", x: 169, y: 368, name: "闸室入口", exit: true },
    },
    edges: [
      ["entry", "rail"], ["rail", "alcove"], ["rail", "grille", "steam"],
      ["grille", "door"], ["door", "pump"], ["pump", "plank", "loose"],
      ["pump", "walk"], ["walk", "exit", "power"], ["plank", "exit"],
    ],
  },
  {
    title: "底层水闸", start: "entry",
    rooms: {
      gate: { name: "检修层", theme: "copper", depth: 5 },
      lower: { name: "最底层 · 水闸室", theme: "gate", depth: 6 },
    },
    nodes: {
      entry: { room: "gate", x: 169, y: 58, name: "闸室入口", symbol: "▤" },
      split: { room: "gate", x: 96, y: 157, name: "检修平台" },
      valve: { room: "gate", x: 270, y: 157, name: "分水阀", control: "water" },
      bench: { room: "gate", x: 71, y: 271, name: "工作台", treasure: "旧铁盒" },
      ladder: { room: "gate", x: 173, y: 368, name: "底层梯口", symbol: "↓" },
      lower: { room: "lower", x: 173, y: 58, name: "检修层梯口", symbol: "↑" },
      meter: { room: "lower", x: 83, y: 211, name: "水位尺" },
      dry: { room: "lower", x: 285, y: 137, name: "高位栈道" },
      lock: { room: "lower", x: 285, y: 244, name: "闸门锁轮", valve: true },
      seal: { room: "lower", x: 75, y: 328, name: "排空的水渠", treasure: "沉底木箱" },
      gate: { room: "lower", x: 273, y: 368, name: "底层出口", exit: true },
    },
    edges: [
      ["entry", "split"], ["split", "valve"], ["split", "bench"], ["split", "ladder"],
      ["ladder", "lower"], ["lower", "meter"], ["meter", "seal", "water"], ["seal", "gate", "gate"], ["lower", "dry", "dry"], ["dry", "lock"], ["lock", "meter"],
    ],
  },
];

const ui = Object.fromEntries(
  ["chapter", "title", "room", "scene", "map", "story", "coins", "hazard", "status", "actions", "hint"]
    .map(id => [id, document.getElementById(id)]),
);

let levelIndex = 0;
let position;
let coins;
let opened;
let valveOpen;
let plankSeen;
let roomStarted;
let moving = false;
let finished = false;
let mechanisms;
let fuseFound;

const level = () => levels[levelIndex];
const current = () => level().nodes[position];

function svg(tag, attrs = {}, label) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  if (label) element.textContent = label;
  return element;
}

function action(label, callback, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", callback);
  ui.actions.append(button);
}

function neighbors() {
  return level().edges
    .filter(([a, b]) => a === position || b === position)
    .map(([a, b, kind]) => ({ target: a === position ? b : a, kind }));
}

const controls = {
  bridge: { label: "摇动吊桥绞盘", on: "吊桥已经落下", message: "链条向下传去，集水室的吊桥落下了。", symbol: "⚙" },
  power: { label: "装上保险芯并送电", on: "配电箱已经送电", message: "电缆亮起，下面的升降门升起来了。", symbol: "ϟ" },
  water: { label: "将水引向高位槽", on: "将水引回低位渠", message: "水流改道。低位渠排空，高位栈道被水封住了。", symbol: "✣" },
};
function isBlocked(kind) {
  if (kind === "dry") return mechanisms.water;
  if (controls[kind]) return !mechanisms[kind];
  return (kind === "gate" && !valveOpen) || (kind === "loose" && plankSeen);
}

function pathBetween(a, b) {
  if (Math.abs(b.x - a.x) < 40 || a.y === b.y) return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  const steps = Math.ceil(Math.abs(b.y - a.y) / 13);
  let d = `M${a.x} ${a.y}`;
  for (let i = 1; i <= steps; i++) {
    d += ` H${a.x + (b.x - a.x) * i / steps} V${a.y + (b.y - a.y) * i / steps}`;
  }
  return d;
}

function drawMap(choices) {
  ui.map.replaceChildren();
  const panels = [];
  for (const [index, stage] of levels.entries()) {
    for (const [roomId, room] of Object.entries(stage.rooms)) {
      const column = Math.floor((room.depth - 1) / 2) === 1 ? room.depth % 2 : (room.depth - 1) % 2;
      const x = 5 + column * 177;
      const y = 5 + Math.floor((room.depth - 1) / 2) * 181;
      panels.push({ index, stage, roomId, room, x, y });
    }
  }
  for (const [i, panel] of panels.entries()) {
    const next = panels[i + 1];
    if (!next) break;
    const horizontal = panel.y === next.y;
    const x = horizontal ? Math.max(panel.x, next.x) - 3 : panel.x + 87;
    const y = horizontal ? panel.y + 89 : next.y - 3;
    ui.map.append(svg("text", { x, y, class: "map-link" }, horizontal ? (next.x > panel.x ? "›" : "‹") : "⌄"));
  }
  let activePanel;
  for (const { index, stage, roomId, room, x, y } of panels) {
    const active = index === levelIndex && current().room === roomId;
    const frame = svg("g", { transform: `translate(${x} ${y})` });
    frame.append(
      svg("rect", { width: 173, height: 173, rx: 8, class: active ? "map-room active" : "map-room" }),
      svg("text", { x: 9, y: 16, class: "map-room-title" }, `B${room.depth} · ${room.name.replace("最底层 · ", "")}`),
    );
    const plan = svg("g", { transform: "translate(7 17) scale(.44 .37)" });
    frame.append(plan);
    ui.map.append(frame);
    if (active) activePanel = plan;

    for (const [from, to, kind] of stage.edges) {
      const a = stage.nodes[from];
      const b = stage.nodes[to];
      if (a.room !== roomId || b.room !== roomId) continue;
      const blocked = index === levelIndex ? isBlocked(kind)
        : index > levelIndex && ["bridge", "power", "water", "gate"].includes(kind);
      plan.append(svg("path", { d: pathBetween(a, b), class: blocked ? "overview-route blocked" : "overview-route" }));
      if (blocked || kind === "steam" || kind === "loose") {
        const name = { bridge: "吊桥", power: "电门", water: "水渠", dry: "栈道", gate: "水闸", steam: "蒸汽", loose: "木板" }[kind];
        const attrs = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8, class: "overview-label" };
        plan.append(svg("text", attrs, blocked ? `× ${name}` : name));
      }
    }

    for (const [id, node] of Object.entries(stage.nodes)) {
      if (node.room !== roomId) continue;
      const choice = active && choices.find(item => item.target === id && !isBlocked(item.kind));
      const onward = active && id === position && choices.find(item => stage.nodes[item.target].room !== node.room);
      const mark = svg("g", { transform: `translate(${node.x} ${node.y})`, class: choice || onward ? "overview-node available" : "overview-node" });
      mark.append(svg("circle", { r: 32, fill: "transparent" }), svg("circle", { r: 8, class: "overview-dot" }));
      const labels = { shelf: "绞盘", alcove: "工具箱", walk: "配电箱", valve: "分水阀", lock: "锁轮" };
      const label = labels[id] || (node.exit ? (room.depth === 6 ? "出口" : "↓") : node.symbol);
      if (label) mark.append(svg("text", { y: 25, class: "overview-label" }, label));
      if (choice || onward) mark.addEventListener("click", () => move(choice || onward));
      plan.append(mark);
    }
  }
  const avatar = svg("g", { id: "avatar", class: "avatar", transform: `translate(${current().x} ${current().y})` });
  avatar.append(
    svg("ellipse", { rx: 10, ry: 2, fill: "#1c1711", opacity: ".7" }),
    svg("path", { d: "M-5 -2L-4 -10H5L7 -2M-7 -16L-10 -10M6 -16L9 -11", fill: "none", stroke: "#efc994", "stroke-width": 3, "stroke-linecap": "round" }),
    svg("rect", { x: -6, y: -19, width: 12, height: 11, rx: 2, fill: "#f3d5a1" }),
    svg("path", { d: "M0 -19V-8 M-6 -14H6", stroke: "#805c48", "stroke-width": 2 }),
    svg("circle", { cy: -24, r: 5, fill: "#f0ba89", stroke: "#584033", "stroke-width": 1.5 }),
    svg("path", { d: "M-5 -25Q-3 -31 4 -27", fill: "none", stroke: "#fff0cf", "stroke-width": 2 }),
  );
  activePanel.append(avatar);
}

function phase() {
  const elapsed = (performance.now() - roomStarted) % 7000;
  if (elapsed < 1800) return "danger";
  return elapsed < 5800 ? "safe" : "warning";
}

function updateSteam() {
  if (finished || !position || current().room !== "steam") return;
  const state = phase();
  if (ui.hazard.dataset.phase === state) return;
  const labels = {
    danger: "喷汽中 · 先留在平台上",
    safe: "汽停 · 可以通过铜栅",
    warning: "铜栅嘶响 · 蒸汽快来了",
  };
  ui.hazard.dataset.phase = state;
  ui.hazard.textContent = labels[state];

}

function render(message, refocus = false) {
  const node = current();
  const room = level().rooms[node.room];
  const choices = neighbors();
  ui.story.hidden = true;
  ui.scene.classList.add("overview");
  ui.hint.hidden = false;
  ui.coins.hidden = false;
  ui.coins.textContent = `金币 ${coins}`;
  ui.chapter.textContent = `地下管网 · 第 ${room.depth} / 6 层`;
  ui.title.textContent = level().title;
  ui.room.textContent = room.name;
  if (ui.scene.dataset.depth && ui.scene.dataset.depth !== String(room.depth)
      && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const offset = room.depth > Number(ui.scene.dataset.depth) ? 30 : -30;
    ui.map.animate([{ transform: `translateY(${offset}px)`, opacity: .45 }, { transform: "none", opacity: 1 }],
      { duration: 300, easing: "ease-out" });
  }
  ui.scene.dataset.depth = room.depth;
  ui.scene.dataset.theme = room.theme;
  ui.hazard.hidden = node.room !== "steam";
  ui.hazard.dataset.phase = "";
  const clues = {
    shelf: "绞盘的铁链穿过地板，一直伸向下面的集水室。",
    rim: "对岸的吊桥悬着，吊索伸向上一层。",
    walk: "配电箱空了一个槽。箱盖画着一枚细长的保险芯。",
    valve: "管道铭牌写着「高位蓄水，低位排空」。转动阀门会交换两条水路。",
    meter: "出口有两道阻碍。锁轮在对岸高处，门前的低位水渠还需要排空。",
  };
  ui.status.textContent = message || clues[position] || `现在在${node.name}。`;
  drawMap(choices);
  const goals = [
    mechanisms.bridge ? "吊桥已落下，从 B2 下行。" : "B2 吊桥悬起 → 去 B1 绞盘放下吊桥。",
    mechanisms.power ? "电门已开启，从 B4 下行。" : fuseFound ? "已找到保险芯 → 去 B4 配电箱送电。" : "B4 电门断电 → 在 B3 工具箱找保险芯。",
    valveOpen ? (mechanisms.water ? "低位渠已排空 → 走 B6 水渠到出口。" : "门锁已解 → 去 B5 分水阀排空低位渠。")
      : (mechanisms.water ? "高位栈道被淹 → 去 B5 分水阀让栈道露出来。" : "出口上锁 → 走 B6 高位栈道，到锁轮解锁。"),
  ];
  ui.hint.textContent = goals[levelIndex];
  updateSteam();
  ui.actions.replaceChildren();
  for (const choice of choices) {
    const target = level().nodes[choice.target];
    let label = target.room === node.room ? `去${target.name}` : `前往${level().rooms[target.room].name}`;
    if (choice.kind === "gate" && !valveOpen) label = "水闸闭锁";
    if (choice.kind === "loose" && plankSeen) label = "木板松动";
    const obstructions = { bridge: "吊桥悬在上方", power: "升降门没有电", water: "低位渠积满水", dry: "高位栈道被水封住" };
    if (isBlocked(choice.kind) && obstructions[choice.kind]) label = obstructions[choice.kind];
    action(label, () => move(choice), isBlocked(choice.kind));
  }
  if (node.treasure && !opened.has(position)) {
    action(`打开${node.treasure}`, () => {
      opened.add(position);
      coins += 3;
      if (node.fuse) fuseFound = true;
      render(`${node.treasure}里有 3 枚金币。${node.fuse ? "还找到了一枚保险芯，已收好。" : ""}`, true);
    });
  }
  if (node.control) {
    const control = controls[node.control];
    const active = mechanisms[node.control];
    const needsFuse = node.control === "power" && !fuseFound;
    action(needsFuse ? "配电箱缺一枚保险芯" : active ? control.on : control.label, () => {
      mechanisms[node.control] = !active;
      render(active ? "水流回到低位渠，高位栈道露出来了。" : control.message, true);
    }, needsFuse || (active && node.control !== "water"));
  }
  if (node.valve && !valveOpen) {
    action("转动阀门", () => {
      valveOpen = true;
      render("锁轮转动，最底层出口的闸门解锁了。还需要走到门前。", true);
    });
  }
  if (refocus) ui.actions.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
}

async function move({ target, kind }) {
  if (moving || isBlocked(kind)) return;
  const origin = current();
  const from = position;
  const destination = level().nodes[target];
  const failed = kind === "loose" || (kind === "steam" && phase() !== "safe");
  const usedKeyboard = ui.actions.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
  moving = true;
  for (const button of ui.actions.children) button.disabled = true;
  if (origin.room === destination.room && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const avatar = document.getElementById("avatar");
    const edge = level().edges.find(([a, b]) => (a === from && b === target) || (a === target && b === from));
    const route = svg("path", { d: pathBetween(level().nodes[edge[0]], level().nodes[edge[1]]) });
    const length = route.getTotalLength();
    const frames = Array.from({ length: 21 }, (_, index) => {
      let progress = index / 20;
      if (failed) progress = Math.min(progress, 1 - progress);
      if (edge[0] !== from) progress = 1 - progress;
      const { x, y } = route.getPointAtLength(length * progress);
      return { transform: `translate(${x}px, ${y}px)` };
    });
    await avatar.animate(frames, { duration: failed ? 650 : 480, easing: "ease-in-out" }).finished;
  }
  moving = false;
  if (failed) {
    if (kind === "loose") plankSeen = true;
    const reason = kind === "loose" ? "木板一踩就松了" : "铜栅喷出一阵蒸汽";
    render(`${reason}。你退回了${origin.name}。`, usedKeyboard);
    return;
  }
  position = target;
  if (origin.room !== destination.room) roomStarted = performance.now();
  if (destination.exit) {
    coins += 5;
    if (levelIndex + 1 === levels.length) {
      showHome();
    } else {
      enter(levelIndex + 1, "找到出口，获得 5 枚金币。", usedKeyboard);
    }
    return;
  }
  const message = destination.valve && !valveOpen
    ? "阀门连着通向下层的管道。"
    : neighbors().length === 1 && !destination.treasure
      ? `走到${destination.name}，前面没有通路。` : "";
  render(message, usedKeyboard);
}

function enter(index, message, refocus) {
  levelIndex = index;
  position = level().start;
  opened = new Set();
  valveOpen = false;
  mechanisms = { bridge: false, power: false, water: false };
  fuseFound = false;
  plankSeen = false;
  roomStarted = performance.now();
  render(message, refocus);
}

function start(refocus = false) {
  coins = 0;
  delete ui.scene.dataset.depth;
  finished = false;
  enter(0, "沿楼梯向下，在每个平台选下一段路。", refocus);
}

function showHome() {
  finished = true;
  ui.chapter.textContent = "从家出发 · 三关完成";
  ui.title.textContent = "回到客厅";
  ui.room.textContent = "鹦鹉正在窗边";
  ui.scene.dataset.theme = "home";
  ui.scene.classList.remove("overview");
  ui.map.replaceChildren();
  ui.story.hidden = false;
  ui.story.querySelector("p").textContent = "管道尽头竟然通向自家客厅。鹦鹉跳到栖木上，回头看了你一眼。";
  ui.coins.textContent = `金币 ${coins}`;
  ui.hazard.hidden = true;
  ui.hint.hidden = true;
  ui.status.textContent = "找到回家的路，获得 5 枚金币。";
  ui.actions.replaceChildren();
  action("再走一次迷宫", () => start(true));
  ui.actions.firstElementChild.focus({ preventScroll: true });
}

start();
setInterval(updateSteam, 80);
