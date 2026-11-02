//so much pain just because windows doesnt have bash ;-;
const { fork, spawn } = require("node:child_process");
const { pipeline } = require("node:stream");
const cloneable = require("cloneable-readable");

function spawn_sink(command, ...args) {
  return spawn_with(command, args, {});
}

//a log sink gets its own process group on posix so a Ctrl+C in the terminal
//does not end it before the coordinator's last lines, it ends with its input
//not on windows, where a detached process opens its own console window
function spawn_log_sink(command, ...args) {
  return spawn_with(command, args, {
    detached: process.platform !== "win32",
  });
}

function spawn_with(command, args, options) {
  const stdio = ["pipe", "inherit", "inherit", "ipc"];
  if (command === "node") {
    return fork(args[0], args.slice(1), { stdio, ...options });
  } else {
    return spawn(command, args, { stdio, ...options });
  }
}

function redirect_into_process(stdout, stderr, target_proc) {
  function err_handler(err) {
    if (err) throw err;
  }
  if (target_proc) {
    pipeline(stdout, target_proc.stdin, err_handler);
    pipeline(stderr, target_proc.stdin, err_handler);
  } else {
    pipeline(stdout, process.stdout, err_handler);
    pipeline(stderr, process.stderr, err_handler);
  }
}

function setup_log_pipes(log_sinks, module_path, ...args) {
  const log_sink_processes = log_sinks.map((command) =>
    command ? spawn_log_sink(...command) : null,
  );

  const runner = fork(module_path, args, {
    stdio: ["inherit", "pipe", "pipe", "ipc"],
  });
  const stdout_clone = cloneable(runner.stdout);
  const stderr_clone = cloneable(runner.stderr);

  if (log_sink_processes.length < 1) {
    log_sink_processes = [null];
  }

  for (let i = 1; i < log_sink_processes.length; i++) {
    redirect_into_process(
      stdout_clone.clone(),
      stderr_clone.clone(),
      log_sink_processes[i],
    );
  }
  redirect_into_process(stdout_clone, stderr_clone, log_sink_processes[0]);
  return runner;
}

module.exports = { setup_log_pipes, spawn_sink };
