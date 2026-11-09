const layout = [
  "#S###########",
  "#.#.#.......#",
  "#.#.#.#####.#",
  "#.#...#.#...#",
  "#.#.###.#.###",
  "#.#...#.#...#",
  "#.###.#.###.#",
  "#...#.....#.#",
  "###.#######.#",
  "#...#...#...#",
  "#.###.#.#.#.#",
  "#.....#...#.#",
  "###########.#",
  "#.....#.....#",
  "#.#.###.#####",
  "#.#.#...#...#",
  "#.###.###.#.#",
  "#.........#.#",
  "###########E#",
];

const map = document.getElementById("map");
const status = document.getElementById("status");
const size = 24;
const width = layout[0].length;
const height = layout.length;
const entrance = { x: layout[0].indexOf("S"), y: 0 };
const exit = { x: layout.at(-1).indexOf("E"), y: height - 1 };
let position = entrance;
let finished = false;

function draw(tag, attrs, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  map.append(element);
  return element;
}

map.setAttribute("viewBox", `0 -22 ${width * size} ${height * size + 44}`);
draw("rect", { width: width * size, height: height * size, class: "floor" });
for (const [y, row] of layout.entries()) {
  for (const [x, tile] of [...row].entries()) {
    if (tile !== ".") draw("rect", {
      x: x * size, y: y * size, width: size, height: size,
      class: { "#": "wall", S: "entry", E: "exit" }[tile],
    });
  }
}
draw("text", { x: entrance.x * size + size / 2, y: -6 }, "入口 ↓");
draw("text", { x: exit.x * size + size / 2, y: height * size + 16 }, "↑ 出口");
const avatar = draw("circle", { r: 8, class: "player" });

function render(message) {
  avatar.setAttribute("cx", (position.x + .5) * size);
  avatar.setAttribute("cy", (position.y + .5) * size);
  status.textContent = message;
}

function move(x, y) {
  if (finished || (x === position.x && y === position.y)) return;
  if (x !== position.x && y !== position.y) {
    render("先走到转角，再点转弯后的通道。");
    return;
  }
  const dx = Math.sign(x - position.x);
  const dy = Math.sign(y - position.y);
  let nextX = position.x;
  let nextY = position.y;
  while (nextX !== x || nextY !== y) {
    nextX += dx;
    nextY += dy;
    const tile = layout[nextY]?.[nextX];
    if (!tile || tile === "#") {
      render("这条直道被墙挡住了。");
      return;
    }
  }
  position = { x, y };
  finished = x === exit.x && y === exit.y;
  render(finished ? "找到出口了！" : "沿着通道继续走。");
}

map.addEventListener("click", event => {
  const transform = map.getScreenCTM();
  if (!transform) return;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
  move(Math.floor(point.x / size), Math.floor(point.y / size));
});

document.addEventListener("keydown", event => {
  const direction = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
  if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  move(position.x + direction[0], position.y + direction[1]);
});

document.getElementById("reset").addEventListener("click", () => {
  position = entrance;
  finished = false;
  render("回到入口。沿着通道寻找右下角的出口。");
});
render(status.textContent);
