// The Witch in Spooky Forest: a short greeting with her services, the cauldron of the Witch's Cipher
// and the realm's clue board. Rules: node/logic/witch_cipher.js.

var witch_mix = [],
	witch_day = null,
	witch_result = null,
	witch_timer = null;

function witch_request(action, fields) {
	var id = randomStr(30);
	return new Promise(function (resolve, reject) {
		var timer = setTimeout(function () {
			finish({ failed: true, reason: "timeout" });
		}, 10000);
		function response(data) {
			if (data && data.request_id === id && data.place === "interaction") finish(data);
		}
		function disconnected() {
			finish({ failed: true, reason: "disconnected" });
		}
		function finish(data) {
			clearTimeout(timer);
			socket.off("game_response", response);
			socket.off("disconnect", disconnected);
			if (data.failed) reject(data);
			else resolve(data);
		}
		socket.on("game_response", response);
		socket.on("disconnect", disconnected);
		socket.emit("interaction", Object.assign({}, fields || {}, { type: "witchcipher", action: action, request_id: id }));
	});
}

function witch_ingredients() {
	return G.events.witchcipher.ingredients.map(function (entry) {
		return entry[0];
	});
}

function witch_cipher_live() {
	return !!(typeof S != "undefined" && S.witchcipher && S.witchcipher.live && S.witchcipher.end > schedule_now());
}

// One slot per ingredient of the recipe, filled from the left
function witch_slots() {
	var slots = G.events.witchcipher.slots;
	while (witch_mix.length < slots) witch_mix.push(null);
	witch_mix.length = slots;
	return slots;
}

function witch_failure(data) {
	if (no_graphics || !data) return;
	if (data.phrase) return add_log(phrase.message(data), "gray");
	var known = ["witchcipher_not_live", "witchcipher_no_mixes", "witchcipher_ingredients", "witchcipher_elsewhere", "distance", "cant_in_bank"];
	if (known.includes(data.reason)) add_log(phrase.html("interface.witch.fail." + data.reason, { item: data.item ? G.items[data.item].name : "" }), "gray");
}

// The account's day (mixes left, the realm and the Parcels earned), for Events.
function witch_day_refresh() {
	if (!character || !socket) return Promise.resolve(null);
	return witch_request("info")
		.then(function (data) {
			witch_day = Object.assign({ checked: Date.now() }, data);
			if (typeof events_window_refresh == "function") events_window_refresh();
			return witch_day;
		})
		.catch(function () {
			return null;
		});
}

function witch_buttons(list) {
	return (
		"<div style='clear:both;float:right;margin-top:7px'>" +
		list
			.map(function (entry) {
				return "<div class='slimbutton' onclick='" + entry[1] + "'>" + entry[0] + "</div>";
			})
			.join(" ") +
		"</div>"
	);
}

// The greeting: BREW while her cauldron boils, then RECIPES, PARCELS and INFO.
function render_witch(service) {
	if (no_graphics || !character) return;
	if (service == "recipes") {
		render_recipes("witch");
		$("#recipe-item").html(render_interaction({ auto: true, skin: "brewingwitch", message: phrase.html("npc.witch.greeting") }, "return_html"));
		return;
	}
	if (service == "parcels") return render_exchange_shrine("witch");
	if (service == "brew") return render_witch_cauldron();
	var live = witch_cipher_live(),
		message,
		buttons = [];
	if (live) message = phrase.html("interface.witch.greeting_live");
	else {
		var next = schedule_next("witchcipher");
		message = next
			? phrase.html("interface.witch.greeting_closed", { time: schedule_time_text(next.at, "realm") })
			: phrase.html("interface.witch.greeting_idle");
	}
	if (live) buttons.push([phrase.html("interface.witch.brew"), "render_witch(\"brew\")"]);
	buttons.push([phrase.html("interface.witch.recipes"), "render_witch(\"recipes\")"]);
	buttons.push([phrase.html("interface.witch.parcels"), "render_witch(\"parcels\")"]);
	buttons.push([phrase.html("interface.item.info"), "open_guide(\"event-witchcipher\",\"/docs/guide/event-witchcipher\")"]);
	render_interaction({ auto: true, skin: "brewingwitch", message: "<div style='font-size:24px'>" + message + "</div>" });
	$("#topleftcornerui > div").append(witch_buttons(buttons));
}

function witch_count(name) {
	var total = 0;
	(character.items || []).forEach(function (item) {
		if (item && item.name == name && !item.l) total += item.q || 1;
	});
	witch_mix.forEach(function (used) {
		if (used == name) total--;
	});
	return total;
}

function witch_clock(ms) {
	var seconds = Math.max(0, Math.ceil(ms / 1000));
	return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

function witch_status_html() {
	var cipher = S.witchcipher,
		now = schedule_now(),
		parts = [];
	if (!witch_cipher_live()) return phrase.html("interface.witch.closed");
	if (character.witchcipher) parts.push(phrase.html("interface.witch.mixes_left", { count: character.witchcipher.mixes_left }));
	if (now < cipher.gather_end) parts.push(phrase.html("interface.witch.gathering", { time: witch_clock(cipher.gather_end - now) }));
	else parts.push(phrase.html("interface.witch.brewing", { time: witch_clock(cipher.end - now) }));
	return parts.join(" · ");
}

function witch_icon(name, args) {
	return item_container(Object.assign({ skin: G.items[name].skin, draggable: false }, args || {}), { name: name });
}

function witch_board_html() {
	var cipher = S.witchcipher || {},
		html = "<div style='background-color: black; border: 5px solid gray; padding: 12px 14px; font-size: 24px; text-align: left; min-width: 250px'>";
	html += "<div style='color:#AF6AE2'>" + phrase.html("interface.witch.board") + "</div>";
	// The last cracked recipe stays above the new one's board
	if (cipher.cracked) {
		html += "<div class='mt5' style='color:#F59A3C'>" + phrase.html("interface.witch.cracked_by", { name: cipher.cracked.by }) + "</div><div>";
		cipher.cracked.recipe.forEach(function (name) {
			html += witch_icon(name, { size: 20, space: 1, margin: 1 });
		});
		html += "</div>";
	}
	if (cipher.board && cipher.board.length) html += "<div style='color:#9B9B9B'>" + phrase.html("interface.witch.possible", { count: cipher.possible }) + "</div>";
	if (!cipher.board || !cipher.board.length) html += "<div style='color:#9B9B9B'>" + phrase.html("interface.witch.board_empty") + "</div>";
	// Newest first; a busy realm's board scrolls inside the panel instead of running off the screen
	html += "<div style='max-height: min(52vh, 420px); overflow-y: auto'>";
	(cipher.board || []).slice().reverse().forEach(function (entry) {
		html += "<div style='white-space:nowrap'>";
		entry.mix.forEach(function (name) {
			html += witch_icon(name, { size: 20, space: 1, margin: 1 });
		});
		html += " <span style='vertical-align: top; line-height: 26px; color:#85C76B'>" + phrase.html("interface.witch.right", { count: entry.right }) + "</span></div>";
	});
	return html + "</div></div>";
}

// Whether server.status.witchcipher.fit marks this recipe as still fitting every clue: recipe n is bit
// n & 3 of hex digit n >> 2, and puts ingredient (n / 4^i) % 4 in slot i, as the server counts them.
function witch_fit_has(fit, mix) {
	var names = witch_ingredients(),
		n = 0;
	for (var i = mix.length - 1; i >= 0; i--) n = n * names.length + names.indexOf(mix[i]);
	return !!((parseInt(fit[n >> 2], 16) >> (n & 3)) & 1);
}

// Whether a full mix fits every clue, as the server scores it. The fit bits cover every mix of the
// current recipe, including the ones the board no longer shows.
function witch_mix_fits(mix) {
	var cipher = S.witchcipher || {},
		board = cipher.board || [];
	var key = mix.join(",");
	if (board.some(function (entry) { return entry.mix.join(",") == key; })) return "tried";
	if (cipher.fit) return witch_fit_has(cipher.fit, mix);
	if (cipher.mixes > board.length) return null;
	return board.every(function (entry) {
		var right = 0;
		for (var i = 0; i < mix.length; i++) if (mix[i] == entry.mix[i]) right++;
		return right == entry.right;
	});
}

// The cauldron: one slot per ingredient of the recipe, in a row, because the order matters. Click an
// ingredient below or in the inventory to fill the next slot; click a filled slot to empty it.
function render_witch_cauldron() {
	if (no_graphics || !character) return;
	reset_inventory(1);
	topleft_npc = "witchcipher";
	rendered_target = topleft_npc;
	var html = "<div id='witch-cauldron' style='background-color: black; border: 5px solid gray; padding: 20px; font-size: 24px; display: inline-block; vertical-align: top; text-align: center'>";
	html += "<div>";
	for (var i = 0; i < witch_slots(); i++) {
		if (witch_mix[i]) html += witch_icon(witch_mix[i], { cid: "witchslot" + i, onclick: "witch_mix_remove(" + i + ")" });
		else html += item_container({ shade: "cipherdraught", cid: "witchslot" + i, s_op: 0.36, draggable: false });
	}
	html += "</div>";
	html += "<div id='witch-status' class='mb5' style='color:#AF6AE2; font-size: 20px'>" + witch_status_html() + "</div>";
	html += "<div class='mb5'>";
	witch_ingredients().forEach(function (name) {
		html += item_container({ skin: G.items[name].skin, draggable: false, onclick: "witch_mix_add(\"" + name + "\")" }, { name: name, q: witch_count(name) });
	});
	html += "</div>";
	if (witch_result)
		html +=
			"<div class='mb5' style='font-size: 20px'><span style='color:#85C76B'>" +
			phrase.html("interface.witch.right", { count: witch_result.right }) +
			"</span> <span style='color:#AF6AE2'>" +
			(witch_result.parcels ? phrase.html("interface.witch.parcels_paid", { count: witch_result.parcels }) : phrase.html("interface.witch.parcels_none")) +
			"</span></div>";
	else if (witch_mix.indexOf(null) == -1) {
		// Before brewing: does this mix fit the clues, so it pays a Parcel?
		var fits = witch_mix_fits(witch_mix);
		if (fits === true) html += "<div class='mb5' style='font-size: 20px; color:#85C76B'>" + phrase.html("interface.witch.fits") + "</div>";
		else if (fits === false) html += "<div class='mb5' style='font-size: 20px; color:#9B9B9B'>" + phrase.html("interface.witch.fits_not") + "</div>";
		else if (fits == "tried") html += "<div class='mb5' style='font-size: 20px; color:#9B9B9B'>" + phrase.html("interface.witch.fits_tried") + "</div>";
	}
	html +=
		"<div><div class='gamebutton clickable' onclick='witch_mix_reset()'>" +
		phrase.html("interface.craftsman.reset") +
		"</div> <div class='gamebutton clickable' onclick='witch_brew_click()'>" +
		phrase.html("interface.witch.brew") +
		"</div></div>";
	html += "</div>";
	html += "<div id='witch-board' style='display: inline-block; vertical-align: top; margin-left: 5px'>" + witch_board_html() + "</div>";
	render_ui_panel("#topleftcornerui", html);
	if (!inventory) (render_inventory(), (inventory_opened_for = topleft_npc));
	if (!witch_timer)
		witch_timer = setInterval(function () {
			if (!$("#witch-cauldron").length) {
				clearInterval(witch_timer);
				witch_timer = null;
				return;
			}
			$("#witch-status").html(witch_status_html());
		}, 1000);
}

function witch_mix_add(name) {
	if (!witch_ingredients().includes(name) || witch_count(name) < 1) return;
	witch_slots();
	var slot = witch_mix.indexOf(null);
	if (slot == -1) return;
	witch_mix[slot] = name;
	witch_result = null;
	render_witch_cauldron();
}

function witch_mix_remove(slot) {
	witch_mix[slot] = null;
	witch_result = null;
	render_witch_cauldron();
}

function witch_mix_reset() {
	witch_mix = [];
	witch_result = null;
	render_witch_cauldron();
}

// One brew at a time: a second click while the first is on its way would spend another of the day's mixes
var witch_brewing = false;
function witch_brew_click() {
	if (witch_brewing) return;
	witch_slots();
	if (witch_mix.indexOf(null) != -1) return add_log(phrase.html("interface.witch.fill_slots", { count: witch_mix.length }), "gray");
	var mix = witch_mix.slice();
	witch_brewing = true;
	witch_request("brew", { items: mix })
		.then(function (data) {
			witch_result = data;
			witch_mix = [];
			if ($("#witch-cauldron").length) render_witch_cauldron();
		})
		.catch(witch_failure)
		.finally(function () {
			witch_brewing = false;
		});
}

// The board follows server.status.witchcipher while the cauldron is open.
function witch_cipher_refresh() {
	if (no_graphics || !$("#witch-board").length) return;
	$("#witch-board").html(witch_board_html());
	$("#witch-status").html(witch_status_html());
}

// Trick or Treat: knock on the door you stand next to (or a given door index).
function knock_request(door) {
	var id = randomStr(30);
	return new Promise(function (resolve, reject) {
		var timer = setTimeout(function () {
			finish({ failed: true, reason: "timeout" });
		}, 10000);
		function response(data) {
			if (data && data.request_id === id && data.place === "interaction") finish(data);
		}
		function finish(data) {
			clearTimeout(timer);
			socket.off("game_response", response);
			if (data.failed) reject(data);
			else resolve(data);
		}
		socket.on("game_response", response);
		socket.emit("interaction", { type: "knock", door: door, request_id: id });
	});
}

function knock_click(door) {
	knock_request(door).catch(function (data) {
		if (no_graphics || !data) return;
		var known = ["trickortreat_season", "trickortreat_door", "trickortreat_knocked", "trickortreat_limit", "cant_in_bank"];
		if (known.includes(data.reason)) add_log(phrase.html("interface.trickortreat.fail." + data.reason), "gray");
	});
}

// ---------- Halloween sounds and effects ----------
// These run on socket events that can reach headless CODE characters at any time, so each returns
// before touching graphics when there are none.

// NPCs are live entities, sent like players while they are in view
function halloween_witch_npc() {
	return get_npc("witch");
}

// A small cloud of the game's smoke puffs around a spot, so an effect reads at a glance
function halloween_cloud(x, y, type, count, spread) {
	var a_map = current_map;
	for (var i = 0; i < count; i++)
		draw_timeout(function () {
			if (a_map == current_map) assassin_smoke(x + (Math.random() * 2 - 1) * spread, y + (Math.random() * 2 - 1) * spread * 0.5, type);
		}, i * 45);
}

// Trick or Treat: everyone near the door hears the knock, and the door answers a moment later
// (G.events.trickortreat.reveal) with a treat that flies to the knocker, or a trick.
function trick_or_treat_effect(data) {
	if (no_graphics || no_html) return;
	var door = G.events.trickortreat.doors[data.door];
	if (!door || door[0] != current_map) return;
	var x = door[1],
		y = door[2],
		a_map = current_map;
	sfx("halloween_knock", x, y);
	// One glint on the door for each knock
	[0, 170].forEach(function (ms, i) {
		draw_timeout(function () {
			if (a_map == current_map) assassin_smoke(x + (i ? 3 : -3), y - 12, "crackle");
		}, ms);
	});
	draw_timeout(function () {
		if (no_graphics || a_map != current_map) return;
		var knocker = get_player(data.name);
		if (data.treat) {
			sfx("halloween_treat", x, y);
			halloween_cloud(x, y - 14, "confetti", 4, 10);
			// The treat drops from the top of the door into the knocker's hands
			if (knocker && G.items[data.treat]) map_animation(G.items[data.treat].skin, { item: true, x: x, y: y - 34, target: knocker, speed: 90 });
			if (knocker) d_text(phrase("server.floating.treat"), knocker, { color: "#F5A05B", size: "large" });
		} else {
			sfx("halloween_boo", x, y);
			// A Ghost floats out in a cold blue cloud; Spooked! comes as a purple one
			halloween_cloud(x, y - 6, data.trick == "ghost" ? "explode_c" : "explode_b", 4, 10);
			if (knocker) {
				d_text(phrase("server.floating.boo"), knocker, { color: "#AD91DC", size: "large" });
				v_shake_i(knocker);
				if (knocker.me) v_shake();
			}
		}
		if (knocker && (data.parcel || data.laugh)) confetti_shower(knocker, 1);
	}, G.events.trickortreat.reveal * 1000);
}

// The Witch's cauldron bubbles for every mix brewed near her; a cracked recipe gets a fanfare.
function witch_cipher_effect(data) {
	if (no_graphics || no_html) return;
	var witch = halloween_witch_npc(),
		brewer = get_player(data.name);
	if (!witch) return;
	var x = get_x(witch),
		y = get_y(witch);
	sfx("halloween_brew", x, y);
	halloween_cloud(x, y - 12, "explode_b", 3, 8);
	start_animation(witch, data.cracked ? "success" : "exchange");
	if (brewer) d_text(phrase("interface.witch.right", { count: data.right }), brewer, { color: data.cracked ? "#F59A3C" : "#85C76B" });
	if (data.cracked) {
		draw_timeout(function () {
			sfx("halloween_cracked", x, y);
		}, 250);
		if (brewer) confetti_shower(brewer, 2);
	}
}

// Opening a Witch's Parcel at her: she hands it over like Xyn does.
function witch_parcel_effect() {
	if (no_graphics || no_html) return;
	var witch = halloween_witch_npc();
	sfx("open");
	if (witch) start_animation(witch, "exchange");
}

// Graveyard Rising: the graves stir with each wave (the monsters climb out on their own), and the
// Gargoyle wakes in a cloud of stone dust that shakes the screen nearby.
function graveyard_effect(data) {
	if (no_graphics || no_html || current_map != "spookytown") return;
	var spot = G.events.graveyard.gargoyle;
	if (data.stage == "wave") return sfx("halloween_rise", spot[0], spot[1]);
	if (data.stage != "gargoyle") return;
	sfx("halloween_stone", spot[0], spot[1]);
	halloween_cloud(spot[0], spot[1] - 10, "explode_up", 10, 24);
	if (character && point_distance(character.real_x, character.real_y, spot[0], spot[1]) < 500) v_shake();
}

// The season's events announce themselves with a short creepy motif; the Horseman rides out in smoke.
function halloween_event_effect(data) {
	if (no_graphics || no_html) return;
	sfx("halloween_spooky");
	if (data.name == "horseman" && data.map == current_map) halloween_cloud(data.x, data.y, "explode_b", 6, 16);
}
