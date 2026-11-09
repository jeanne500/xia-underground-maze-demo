"use strict";

const elements = Object.fromEntries(
  ["scene", "bird", "rope", "arrow", "progress", "status", "actions", "sensor"]
    .map(id => [id, document.getElementById(id)]),
);
const platforms = [431, 250, 69];
const neutralThreshold = .16;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

let state = "room";
let practiced = false;
let practiceCentered = false;
let completed = false;
let segment = 0;
let position = 0;
let balance = 0;
let steady = 0;
let gust = 0;
let failures = 0;
let assisted = false;
let orientation;
let baseline = 0;
let calibration;
let arrival = 0;
let preparingSensor = false;

function button(label, callback) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", callback);
  elements.actions.append(element);
}

function message(text) {
  if (elements.status.textContent !== text) elements.status.textContent = text;
}

function show(next, text) {
  state = next;
  elements.actions.replaceChildren();
  if (text) message(text);
  elements.progress.textContent = {
    room: "客厅 · 窗边",
    platform: "中途平台",
    done: "终点 · 窗边水碗",
  }[next] || `第 ${segment + 1} 段绳索 / 2`;
  if (next === "room") {
    button("开启感应，陪鹦鹉走绳索", enableTilt);
    return;
  }
  if (next === "ready") button("出发", () => calibrate(walk));
  if (next === "walking") button("暂停", () => show("paused", "已暂停。准备好后点「继续」。"));
  if (next === "paused") button("继续", () => calibrate(() => {
    if (gust > 0 && gust < 3) gust = 0;
    walk();
  }));
  if (next === "platform" || next === "retry") {
    if (next === "retry" && failures >= 3 && !assisted) button("减弱这阵风", () => {
      assisted = true;
      show("retry", "这阵风会轻一些。准备好后点「继续」。");
    });
    button("继续", () => calibrate(walk));
  }
  if (next === "done") button("摸摸鹦鹉", () => {
    arrival = -.65;
    message("鹦鹉歪了歪头，蹭蹭你的手。");
  });
  button("回到房间", reset);
}

function reset() {
  segment = position = balance = steady = gust = failures = arrival = 0;
  assisted = false;
  calibration = null;
  orientation = null;
  elements.sensor.textContent = "姿态感应：等待开启";
  show("room", "鹦鹉站在窗边。要陪它走到水碗旁吗？");
}

function calibrate(resume) {
  calibration = { resume, elapsed: 0, stable: 0, anchor: undefined };
  show("calibrating", "请把手机竖着、屏幕朝上，拿稳一小会儿。");
}

function begin() {
  calibrate(() => {
    if (practiced) {
      walk();
    } else {
      practiceCentered = false;
      balance = -.61;
      show("practice", "鹦鹉往左歪了。向右扶，把它扶正。");
    }
  });
}

async function enableTilt() {
  if (preparingSensor) return;
  if (!window.isSecureContext || !window.DeviceOrientationEvent) {
    message("当前环境无法读取手机姿态。请用手机系统浏览器打开这条 HTTPS 试玩链接。");
    return;
  }
  preparingSensor = true;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      if (await DeviceOrientationEvent.requestPermission() !== "granted") {
        message("姿态权限未允许。请在浏览器中允许动作与方向访问，再重试。");
        return;
      }
    }
    orientation = null;
    elements.sensor.textContent = "姿态感应：等待手机数据";
    begin();
  } catch {
    message("浏览器没有开启姿态感应。请用手机系统浏览器打开链接后重试。");
  } finally {
    preparingSensor = false;
  }
}

window.addEventListener("deviceorientation", event => {
  if (state !== "room" && Number.isFinite(event.gamma) && Number.isFinite(event.beta)) {
    const radians = Math.PI / 180;
    const roll = Math.sin(event.gamma * radians) * Math.cos(event.beta * radians) / radians;
    orientation = { roll, pitch: event.beta };
    const reading = state === "calibrating" ? roll : roll - baseline;
    const label = `姿态感应已连接 · ${reading > 0 ? "+" : ""}${Math.round(reading)}°`;
    if (elements.sensor.textContent !== label) elements.sensor.textContent = label;
  }
});

function walk() {
  balance = steady = 0;
  show("walking", "稳住鹦鹉，它会自己往前走。");
}

function checkpoint() {
  if (segment === 1) {
    arrival = completed ? 1 : 0;
    completed = true;
    show("done", arrival ? "走到水碗旁了！" : "走到水碗旁了。鹦鹉低头喝了一口水。");
  } else {
    segment = 1;
    position = gust = failures = balance = 0;
    assisted = false;
    show("platform", "鹦鹉站稳了。你可以休息，准备好再继续。");
  }
}

function tick(dt, time) {
  if (state === "calibrating") {
    calibration.elapsed += dt;
    if (orientation && Math.abs(orientation.pitch) < 22 && Math.abs(orientation.roll) < 20) {
      if (!calibration.anchor || Math.abs(calibration.anchor.roll - orientation.roll) > 1.8
          || Math.abs(calibration.anchor.pitch - orientation.pitch) > 2.5) {
        calibration.anchor = orientation;
        calibration.stable = 0;
      }
      calibration.stable += dt;
      if (calibration.stable >= .45) {
        baseline = orientation.roll;
        const resume = calibration.resume;
        calibration = null;
        resume();
      }
    } else {
      calibration.stable = 0;
      calibration.anchor = undefined;
    }
    if (calibration?.elapsed > 3) {
      message(orientation ? "已收到姿态数据。请保持竖屏、屏幕朝上，平稳拿住。"
        : "还没收到姿态数据。请轻倾手机试一下。如果读数仍不出现，请用 Safari 或 Chrome 打开分享链接并允许感应。");
    }
    return;
  }
  const input = clamp(((orientation?.roll ?? baseline) - baseline) / 13, -1, 1);
  if (state === "practice") {
    if (!practiceCentered) {
      balance = clamp(balance + input * dt * 1.8, -1, 1);
      if (Math.abs(balance) < .13) {
        practiceCentered = true;
        balance = 0;
      }
    }
    if (practiceCentered) {
      message("扶正了。现在把手机放回水平。");
      if (Math.abs(input) <= neutralThreshold) {
        practiced = true;
        show("ready", "准备好了。点「出发」，鹦鹉会自己往上走。");
      }
    }
    return;
  }
  if (state === "done") {
    if (arrival < 1) arrival = Math.min(1, arrival + dt);
    return;
  }
  if (state !== "walking") return;

  const windPoint = segment === 0 ? .38 : .54;
  if (position >= windPoint && gust < 3) gust = Math.min(3, gust + dt);
  const warning = gust > 0 && gust < .8;
  const blowing = gust >= .8 && gust < 3;
  const wind = blowing ? (segment === 0 ? -1 : 1) * (assisted ? .45 : .98) : 0;
  const sway = Math.sin(position * 33 + time / 380) * .19;
  balance += (wind + sway + input * 2 - balance * .83) * dt;
  if (Math.abs(balance) >= .89) {
    failures++;
    position = gust = balance = 0;
    show("retry", "鹦鹉飞回了最近的停歇点。准备好后再试。");
    return;
  }
  const neutral = Math.abs(input) <= neutralThreshold;
  steady = Math.abs(balance) < .34 && neutral ? steady + dt : 0;
  if (steady > .28) position += dt * .115;
  if (position >= 1) {
    position = 1;
    checkpoint();
  } else if (Math.abs(balance) > .42) {
    message(balance < 0 ? "鹦鹉向左歪，向右扶。" : "鹦鹉向右歪，向左扶。");
  } else if (Math.abs(balance) < .34 && !neutral) {
    message("扶正了，把手机放回水平。");
  } else {
    message(warning ? "窗帘动了，风快来了。" : blowing ? "风吹过绳索了。" : "鹦鹉站稳后会继续往前走。");
  }
}

function draw(time) {
  const from = platforms[segment];
  const to = platforms[segment + 1];
  const sway = state === "walking" ? Math.sin(time / 380) * 3 : 0;
  const x = 140 + sway * Math.sin(Math.PI * position) + balance * 13;
  const y = from + (to - from) * position;
  const pose = state === "done" && arrival < 1 ? (arrival < 0 ? -15 : 19) : balance * 38;
  elements.bird.setAttribute("transform", `translate(${x} ${y}) rotate(${pose})`);
  elements.rope.setAttribute("d", `M140 431Q${140 + sway * 2} 340 140 250Q${140 + sway * 2} 160 140 69`);
  elements.arrow.setAttribute("y", clamp(y, 48, 452));
  elements.scene.classList.toggle("warning", state === "walking" && gust > 0 && gust < .8);
  elements.scene.classList.toggle("gust", state === "walking" && gust >= .8 && gust < 3);
  elements.arrow.textContent = ["practice", "walking"].includes(state) && Math.abs(balance) > .42
    ? (balance < 0 ? "→" : "←") : "";
}

window.addEventListener("blur", () => {
  if (state === "walking") show("paused", "已暂停。准备好后点「继续」。");
});

reset();
let previousTime = performance.now();
function frame(time) {
  tick(clamp((time - previousTime) / 1000, 0, .05), time);
  draw(time);
  previousTime = time;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
