const { COORDINATOR_MODULE_PATH } = require("./src/CONSTANTS");
const ConfigUtil = require("./src/ConfigUtil");
const StreamMultiplexer = require("./src/StreamMultiplexer");
const fs = require("fs");

async function get_webpack_started(cfg) {
  try {
    fs.rmSync("./TYPECODE.out", { recursive: true });
  } catch (error) {
    //Sometimes throws if file doesnt exist
    //We want it to not exist, so we ignore it
  }
  if (cfg.enable_TYPECODE) {
    //TODO make this configurable
    const webpack_log_output = [
      [
        "node",
        "./node_modules/logrotate-stream/bin/logrotate-stream",
        "./logs/webpack.log",
        "--keep",
        "3",
        "--size",
        "1500000",
      ],
      null,
    ];
    //Run webpack once so we are guaranteed to have the compiled files
    let wp_seed;
    console.log("Starting Initial WebPack");
    //initially we do not use log_pipes because when the process terminates it will close our stdin/out
    wp_seed = StreamMultiplexer.spawn_sink(
      "node",
      "./node_modules/webpack/bin/webpack",
      "--no-color",
    );

    await new Promise((resolve) => {
      wp_seed.on("close", resolve);
    });
    console.log("Initial WebPack is done");
    return StreamMultiplexer.setup_log_pipes(
      webpack_log_output,
      "./node_modules/webpack/bin/webpack",
      "--no-color",
      "--watch",
    );
  }
  return null;
}

(async () => {
  await ConfigUtil.interactive();

  const cfg = require("./config");
  const webpack_watch = await get_webpack_started(cfg);

  const log_sinks = cfg.log_sinks || [
    [
      "node",
      "./node_modules/logrotate-stream/bin/logrotate-stream",
      "./logs/caracAL.log.jsonl",
      "--keep",
      "3",
      "--size",
      "4500000",
    ],
    ["node", "./standalones/LogPrinter.js"],
  ];
  const coordinator = StreamMultiplexer.setup_log_pipes(
    log_sinks,
    COORDINATOR_MODULE_PATH,
  );
  //the coordinator logs the characters out, so pass signals on and outlive it
  //we exit once its output has drained into the log sinks
  //a second signal gives up on that, the characters exit with the coordinator
  let signalled = false;
  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((signal) =>
    process.on(signal, () => {
      if (signalled) {
        coordinator.kill("SIGKILL");
        process.exit(1);
      }
      signalled = true;
      coordinator.kill(signal);
    }),
  );
  coordinator.on("exit", () => {
    if (webpack_watch) webpack_watch.kill();
  });
})();
