#!/usr/bin/env -S pnpm exec node
//Retests the scraped game file download (fresh / repair / no-op), the legacy
//fallback, and evaluates the downloaded files like make_game does.
//Never loads the real config.js: LogUtils gets a stub instead.
//Downloads go to agent-scratch/game-files-retest, not the real game_files.
import Module, { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work_dir = path.join(repo, "agent-scratch", "game-files-retest");
const real_config = path.join(repo, "config.js");

const original_load = Module._load;
Module._load = function (request, parent, is_main) {
  let resolved = null;
  try {
    resolved = Module._resolveFilename(request, parent, is_main);
  } catch (e) {}
  if (resolved == real_config) return { log_level: "silent" };
  return original_load.apply(this, arguments);
};

const repo_require = createRequire(path.join(repo, "package.json"));
const gf = repo_require("./game_files");
const { JSDOM } = repo_require("jsdom");
const node_query = repo_require("jquery");

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " - " + detail : ""}`);
}

fs.rmSync(work_dir, { recursive: true, force: true });
fs.mkdirSync(path.join(work_dir, "game_files"), { recursive: true });
process.chdir(work_dir);

function expected_files(version) {
  return [
    ...new Set(gf.get_game_files(version).concat(gf.get_runner_files())),
  ].map((f) => gf.locate_game_file(f, version));
}
function stray_parts(version) {
  return fs
    .readdirSync(`./game_files/${version}`)
    .filter((f) => f.endsWith(".part"));
}

//fresh download
const version = await gf.ensure_latest();
const manifest_path = `./game_files/${version}/manifest.json`;
check("fresh: manifest written", fs.existsSync(manifest_path));
const files = expected_files(version);
const absent = files.filter((f) => !fs.existsSync(f));
check(
  `fresh: all ${files.length} expected files present`,
  absent.length == 0,
  absent.join(", "),
);
check("fresh: no .part leftovers", stray_parts(version).length == 0);

//repair: drop some files plus the manifest
const dropped = files.filter((f) =>
  /\/(ui|witch_cipher|runner_compat)\.js$/.test(f),
);
const before = Object.fromEntries(dropped.map((f) => [f, fs.readFileSync(f)]));
dropped.concat([manifest_path]).forEach((f) => fs.rmSync(f));
await gf.ensure_latest();
check(
  `repair: ${dropped.length} dropped files restored`,
  dropped.length == 3 && dropped.every((f) => fs.existsSync(f)),
);
check(
  "repair: restored files match the originals",
  dropped.every((f) => fs.readFileSync(f).equals(before[f])),
);
check("repair: manifest rewritten", fs.existsSync(manifest_path));
check("repair: no .part leftovers", stray_parts(version).length == 0);

//no-op: nothing should be downloaded again
const mtimes = files.map((f) => fs.statSync(f).mtimeMs);
await gf.ensure_latest();
check(
  "no-op: no game file rewritten",
  files.every((f, i) => fs.statSync(f).mtimeMs == mtimes[i]),
);

//legacy fallback for versions without a manifest
const legacy = gf.get_game_files(1);
check(
  "fallback: version without manifest gets the hardcoded list",
  legacy.includes("/js/game.js") && legacy.includes("/data.js"),
);

//evaluate the game files the way make_game does, minus the connection
const w = new JSDOM(
  "<!DOCTYPE html><html><head></head><body></body></html>",
  { url: "https://adventure.land/" },
).window;
w.globalThis = w;
w.$ = w.jQuery = node_query(w);
w.console = console;
w.bowser = {};
w.io = () => ({ on() {}, emit() {} });
w._localStorage = w._sessionStorage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
};
vm.createContext(w);
const sources = [path.join(repo, "html_vars.js")].concat(
  gf.get_game_files(version).map((f) => gf.locate_game_file(f, version)),
);
const eval_failures = [];
for (const f of sources) {
  try {
    vm.runInContext(fs.readFileSync(f, "utf8"), w, { filename: f });
  } catch (e) {
    eval_failures.push(`${f}: ${String(e).split("\n")[0]}`);
  }
}
check(
  `load: ${sources.length} files evaluate without throwing`,
  eval_failures.length == 0,
  eval_failures.join("; "),
);
check(`load: G.version is ${version}`, w.G && w.G.version == version);

console.log(`\nversion ${version}, ${failures} failed check(s)`);
//game.js leaves timers running in the context
process.exit(failures ? 1 : 0);
