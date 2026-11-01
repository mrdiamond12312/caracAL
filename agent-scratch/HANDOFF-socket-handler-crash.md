# Handoff: game 18285 socket-handler crash (2026-11-02)

Context from a session in `CODE/adventure-land-scripts-backup`, for continuing work in caracAL.
Nothing below is committed; per AGENTS.md the human reviews and commits.

## Symptom

On the server (`moooh-the-cow`, `/home/ubuntu/caracAL`, revision `d30a946`), fighters
restart-looped: a new `log_init` pid about every 0.6–1.1s, while the merchant ran normally. Bots
eventually got in "after some time". Each crash printed:

```
TypeError: Cannot read properties of null (reading 'name')
    at Socket.<anonymous> (file://./game_files/18285/game.js:2781:45)
    at Emitter.emit (.../@socket.io/component-emitter/index.js:143:20)
    at Socket.emitEvent (.../socket.io-client/build/cjs/socket.js:519:20)
    ...
Node.js v20.20.0
```

## Cause

Game 18285's `socket.on("ui", ...)` handler in `game.js`:

```js
if (data.cevent && data.name == character.name) call_code_function("trigger_character_event", ...);
```

`character` is `null` until the server's `start` arrives. A `ui` message with a `cevent` that
lands between socket connect and `start` throws. In a browser that only reaches the console. In
caracAL it is an uncaught exception that kills the CharacterThread process.
- **Why it eventually works:** each attempt only crashes if a `cevent` arrives in that short
  window. A quiet window lets `start` through, and the bot is safe until its next login.
- **Why the loop was 1/s:** the server's caracAL (`d30a946`) restarts an exited process
  immediately (`result.on("exit") → start_char`). The backoff fix (`13f3f89`, refined in
  `64b0bad`/`6e20791`) is only in the local checkout, which is at `d504218`.

Not checked: the local `game_files/` only has `18183`, so the 18285 source was read from the
server, and only lines 2770–2790. Other unguarded `character.` reads in 18285 are possible.

## Change made (uncommitted): `src/CharacterThread.js`

- New `make_handler_safe_io(io)`, next to `patch_no_graphics_skin_change`. It returns an `io`
  wrapper (statics kept via `Object.assign`). The wrapper overrides each socket's `emitEvent`
  with a try/catch that logs `game "<event>" handler threw` and carries on.
- `make_game` sets `game_context.io = make_handler_safe_io(io)` (was `= io`).
- **Why `emitEvent`, not `on`:**
  - It is the socket's single incoming dispatch point, called as `this.emitEvent(args)`, so an
    instance override takes. The server's stack trace shows the same method.
  - Wrapping `on` would break `once`: component-emitter's `once` removes itself through its own
    inner wrapper.
  - The game's `socket.off(event, handler)` calls (runner_functions.js, generated_zones.js) need
    the original handler identity.
- As in a browser, a throw skips the remaining listeners for that one event.
- The game's own `socket.onevent` override (game.js ~1620) sits above `emitEvent` and is
  unaffected.

## Verification

- `node --check src/CharacterThread.js` passes.
- `./agent-scratch/test-handler-safe-io.mjs` (offline, never connects) runs the real wrapper
  against socket.io-client 4.8.4. The throw is caught, `once` fires once, `off` removes the
  handler, and `io.connect`/`io.Manager` are still there.
- Not run against the live game.

## Open items

1. Deploy to the server: pull the full local caracAL (backoff fix + this patch), not just
   `CharacterThread.js`. Then restart caracAL.
2. After deploying, confirm the loop is gone. Grep the log for `handler threw`; each hit is a
   login that would have crashed.
3. Optionally, report upstream: line 2781 in game.js needs a `character &&` guard.
4. Optional: check whether the Nov 1 "login flood" had the same cause. Run
   `ls -la --time-style=full-iso game_files/` on the server, and
   `grep -c "reading 'name'" logs/caracAL.log.jsonl*`.

## Related state in the scripts repo (`CODE/adventure-land-scripts-backup`)

`party_plan.37.js` has an uncommitted "deploy slot" version. The slot frees on the deployed bot's
first realm heartbeat, which now also fires at load, or after 15s. It logs
`In game <ms>ms after the deploy`. Commit `1d56479` there has a 1s fixed-spacing version. Once
the patched caracAL is live, use those ms numbers to decide whether a login slot is needed at all.
It was built on the assumption that the server rejected simultaneous logins, and that cause is now
doubtful. Its REFERENCE.md "One login at a time" section carries a correction note.
