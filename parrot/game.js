"use strict";

const elements = Object.fromEntries(
  ["scene", "bird", "rope", "arrow", "progress", "status", "actions", "controls", "left", "right"]
    .map(id => [id, document.getElementById(id)]),
);
const platforms = [{ x: 48, y: 213 }, { x: 180, y: 184 }, { x: 312, y: 213 }];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

let state = "room";
let mode = "buttons";
let practiced = false;
let completed = false;
let segment = 0;
let position = 0;
let balance = 0;
let steady = 0;
let gust = 0;
let failures = 0;
let assisted = false;
let held = 0;
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
  held = 0;
  elements.actions.replaceChildren();
  elements.controls.hidden = mode !== "buttons" || !["practice", "walking"].includes(next);
  if (text) message(text);
  elements.progress.textContent = {
    room: "客厅 · 窗边",
    platform: "中途平台",
    done: "终点 · 窗边水碗",
  }[next] || `第 ${segment + 1} 段绳索 / 2`;
  if (next === "room") {
    button("陪鹦鹉走绳索", () => begin("buttons"));
    if ("DeviceOrientationEvent" in window) button("用手机倾斜", enableTilt);
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
  if (mode === "tilt" && next === "calibrating") button("改用按钮", () => {
    const resume = calibration.resume;
    calibration = null;
    mode = "buttons";
    resume();
  });
  button("回到房间", reset);
}

function reset() {
  segment = position = balance = steady = gust = failures = arrival = 0;
  assisted = false;
  calibration = null;
  show("room", "鹦鹉站在窗边。要陪它走到水碗旁吗？");
}

function calibrate(resume) {
  if (mode === "buttons") {
    resume();
    return;
  }
  calibration = { resume, elapsed: 0, stable: 0, anchor: undefined };
  show("calibrating", "请把手机竖着、屏幕朝上，拿稳一小会儿。");
}

function begin(inputMode) {
  mode = inputMode;
  calibrate(() => {
    if (practiced) {
      walk();
    } else {
      balance = -.61;
      show("practice", "鹦鹉往左歪了。向右扶，把它扶正。");
    }
  });
}

async function enableTilt() {
  if (preparingSensor) return;
  preparingSensor = true;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      if (await DeviceOrientationEvent.requestPermission() !== "granted") {
        message("手机没有开启动作权限。可以点「陪鹦鹉走绳索」使用按钮。");
        return;
      }
    }
    begin("tilt");
  } catch {
    message("这个浏览器没能开启倾斜。可以点「陪鹦鹉走绳索」使用按钮。");
  } finally {
    preparingSensor = false;
  }
}

window.addEventListener("deviceorientation", event => {
  if (Number.isFinite(event.gamma) && Number.isFinite(event.beta)) {
    const radians = Math.PI / 180;
    const roll = Math.sin(event.gamma * radians) * Math.cos(event.beta * radians) / radians;
    orientation = { roll, pitch: event.beta, time: performance.now() };
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
    if (orientation && time - orientation.time < 500) {
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
    }
    if (calibration?.elapsed > 3) message("还在等待稳定的姿态读数。也可以点「改用按钮」。");
    return;
  }
  const input = mode === "buttons" ? held : clamp(((orientation?.roll ?? baseline) - baseline) / 13, -1, 1);
  if (state === "practice") {
    balance = clamp(balance + input * dt * 1.8, -1, 1);
    if (Math.abs(balance) < .13) {
      practiced = true;
      balance = 0;
      show("ready", "扶正了。把手机放回舒服的角度，再点「出发」。");
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
  steady = Math.abs(balance) < .34 ? steady + dt : 0;
  if (steady > .28) position += dt * .115;
  if (position >= 1) {
    position = 1;
    checkpoint();
  } else if (Math.abs(balance) > .42) {
    message(balance < 0 ? "鹦鹉向左歪，向右扶。" : "鹦鹉向右歪，向左扶。");
  } else {
    message(warning ? "窗帘动了，风快来了。" : blowing ? "风吹过绳索了。" : "鹦鹉站稳后会继续往前走。");
  }
}

function draw(time) {
  const a = platforms[segment];
  const b = platforms[segment + 1];
  const sway = state === "walking" ? Math.sin(time / 380) * 3 : 0;
  const x = a.x + (b.x - a.x) * position;
  const y = a.y + (b.y - a.y) * position + Math.sin(Math.PI * position) * (5 + sway);
  const pose = state === "done" && arrival < 1 ? (arrival < 0 ? -15 : 19) : balance * 38;
  elements.bird.setAttribute("transform", `translate(${x} ${y}) rotate(${pose})`);
  elements.rope.setAttribute("d", `M48 213Q114 ${208 + sway} 180 184Q246 ${208 + sway} 312 213`);
  elements.scene.classList.toggle("warning", state === "walking" && gust > 0 && gust < .8);
  elements.scene.classList.toggle("gust", state === "walking" && gust >= .8 && gust < 3);
  elements.arrow.textContent = ["practice", "walking"].includes(state) && Math.abs(balance) > .42
    ? (balance < 0 ? "→" : "←") : "";
}

for (const [id, direction] of [["left", -1], ["right", 1]]) {
  const control = elements[id];
  control.addEventListener("pointerdown", event => {
    control.setPointerCapture(event.pointerId);
    held = direction;
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
    control.addEventListener(event, () => { if (held === direction) held = 0; });
  }
}
window.addEventListener("keydown", event => {
  if (mode !== "buttons" || !["practice", "walking"].includes(state)) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  held = event.key === "ArrowLeft" ? -1 : 1;
});
window.addEventListener("keyup", event => {
  if ((event.key === "ArrowLeft" && held < 0) || (event.key === "ArrowRight" && held > 0)) held = 0;
});
window.addEventListener("blur", () => {
  held = 0;
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
