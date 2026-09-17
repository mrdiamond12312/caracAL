//The tail of the spoofed jinja block from the game page.
//It is split out of html_vars.js because of load order: the declarations in
//html_vars.js have to be in place before the game files are evaluated (their
//top-level code reads them - npc_obstruction_hint.js calls storage_get(), which
//reads is_electron, and game.js does `var scale = parseInt(scale)`), while the
//statements below call into those same files and so have to run after them.
//On the real page these are two separate script blocks for the same reason.

if (!is_sdk) {
  for (var f in log_flags) log_flags[f] = 0;
}

X.servers = [
  {
    name: "I",
    region: "EU",
    players: 10,
    key: "EUI",
    port: 2053,
    addr: "eu1.adventure.land",
  },
  {
    name: "II",
    region: "EU",
    players: 23,
    key: "EUII",
    port: 2083,
    addr: "eu2.adventure.land",
  },
  {
    name: "PVP",
    region: "EU",
    players: 3,
    key: "EUPVP",
    port: 2087,
    addr: "eupvp.adventure.land",
  },
  {
    name: "I",
    region: "US",
    players: 18,
    key: "USI",
    port: 2053,
    addr: "us1.adventure.land",
  },
  {
    name: "II",
    region: "US",
    players: 10,
    key: "USII",
    port: 2083,
    addr: "us2.adventure.land",
  },
  {
    name: "III",
    region: "US",
    players: 51,
    key: "USIII",
    port: 2053,
    addr: "us3.adventure.land",
  },
  {
    name: "PVP",
    region: "US",
    players: 14,
    key: "USPVP",
    port: 2087,
    addr: "uspvp.adventure.land",
  },
  {
    name: "I",
    region: "ASIA",
    players: 12,
    key: "ASIAI",
    port: 2053,
    addr: "asia1.adventure.land",
  },
];
X.characters = [];
X.tutorial = { step: 0, completed: [] };
X.unread = 0;
X.codes = {};

code_logic();
