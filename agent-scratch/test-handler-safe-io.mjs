#!/usr/bin/env -S pnpm exec node
// Checks make_handler_safe_io (src/CharacterThread.js) against the real
// socket.io-client: a throwing handler is caught, once/off still work.
// Offline: the socket is created with autoConnect false and never connects.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const io = require("socket.io-client");

const source = readFileSync("./src/CharacterThread.js", "utf8");
const body = source.slice(
  source.indexOf("function make_handler_safe_io"),
  source.indexOf("async function make_runner"),
);
const make_handler_safe_io = new Function(`return (${body})`)();

const safe_io = make_handler_safe_io(io);
const socket = safe_io("http://127.0.0.1:1", { autoConnect: false });

const character = null;
let once_calls = 0;
let off_calls = 0;
//the same read as game 18285 game.js:2781 before "start"
socket.on("ui", (data) => {
  if (data.cevent && data.name == character.name) return;
});
socket.once("start", () => once_calls++);
const removed = () => off_calls++;
socket.on("x", removed);
socket.off("x", removed);

socket.emitEvent(["ui", { cevent: true, name: "someone" }]);
socket.emitEvent(["start", {}]);
socket.emitEvent(["start", {}]);
socket.emitEvent(["x", {}]);

const result = {
  survived_throw: true,
  once_fired_once: once_calls === 1,
  off_removed: off_calls === 0,
  keeps_io_statics:
    typeof safe_io.connect === "function" &&
    typeof safe_io.Manager === "function",
};
console.log(result);
process.exit(Object.values(result).every(Boolean) ? 0 : 1);
