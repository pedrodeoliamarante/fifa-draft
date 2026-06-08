#!/usr/bin/env node
/**
 * Full end-to-end simulation of the FIFA Draft app.
 *
 * Phases:
 *   1. Reset draft & login all managers
 *   2. Run the full snake draft (120 picks, 8 managers × 15 rounds)
 *      - Each manager picks intelligently by position need
 *      - A few "mistake" picks thrown in (picking a low-ranked player)
 *   3. Verify draft state (rosters, standings, pick history)
 *   4. Set lineups for each manager (starting XI + captain)
 *   5. Propose, accept, reject, and cancel trades
 *   6. Open free agency & claim/release players
 *   7. Final state dump
 */

const BASE = process.env.API_URL || "https://pedro-thinkpad-t14s-gen-1.tail4d61c3.ts.net";

const MANAGERS = [
  "pedro", "tesla_team", "monarcas", "aidan",
  "sam", "evelyn", "hang_he_chan_love", "croat_goats",
];

const tokens = {};
let pickCount = 0;
let errors = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(path, { token, method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error || "unknown"}`);
  return json;
}

function log(phase, msg) {
  console.log(`[${phase}] ${msg}`);
}

function assert(condition, msg) {
  if (!condition) {
    console.error(`  ❌ ASSERT FAILED: ${msg}`);
    errors++;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Phase 1: Reset & Login
// ---------------------------------------------------------------------------

async function phase1_reset_and_login() {
  log("PHASE 1", "=== RESET DRAFT & LOGIN ALL MANAGERS ===");

  // Login as pedro first to get a token for admin ops
  const pedro = await api("/api/login", { method: "POST", body: { loginName: "pedro", password: "demo" } });
  tokens["pedro"] = pedro.token;
  log("PHASE 1", `Logged in as ${pedro.manager.displayName} (id=${pedro.manager.id})`);

  // Reset draft
  await api("/api/admin/reset-draft", { token: tokens["pedro"], method: "POST" });
  log("PHASE 1", "Draft reset successfully");

  // Login all managers
  for (const login of MANAGERS) {
    if (login === "pedro") continue;
    const res = await api("/api/login", { method: "POST", body: { loginName: login, password: "demo" } });
    tokens[login] = res.token;
    log("PHASE 1", `Logged in as ${res.manager.displayName} (id=${res.manager.id})`);
  }

  // Verify draft state
  const draft = await api("/api/draft", { token: tokens["pedro"] });
  assert(draft.managers.length === 8, `Expected 8 managers, got ${draft.managers.length}`);
  assert(draft.isComplete === false, "Draft should not be complete");
  assert(draft.currentPick.pickNumber === 1, `Expected pick 1, got ${draft.currentPick.pickNumber}`);
  assert(draft.timerStart !== null, "Timer should be set");
  log("PHASE 1", `Draft ready: ${draft.managers.length} managers, pick ${draft.currentPick.pickNumber}, ${draft.totalPicks} total picks`);

  return draft;
}

// ---------------------------------------------------------------------------
// Phase 2: Full Snake Draft
// ---------------------------------------------------------------------------

async function phase2_run_draft() {
  log("PHASE 2", "=== RUNNING FULL SNAKE DRAFT ===");

  const totalPicks = 8 * 15; // 120 picks
  const positionPriority = ["GK", "GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
  const managerPicks = {}; // track what each manager picked
  for (const m of MANAGERS) managerPicks[m] = [];

  for (let i = 0; i < totalPicks; i++) {
    const draft = await api("/api/draft", { token: tokens["pedro"] });
    if (draft.isComplete) {
      log("PHASE 2", `Draft completed early at pick ${i}`);
      break;
    }

    const currentManager = draft.currentPick.manager;
    const managerLogin = MANAGERS.find((m) => {
      // Match by id
      return draft.managers.find((dm) => dm.loginName === m && dm.id === currentManager.id);
    });

    if (!managerLogin) {
      log("PHASE 2", `ERROR: Could not find login for manager id ${currentManager.id} (${currentManager.displayName})`);
      errors++;
      break;
    }

    const token = tokens[managerLogin];
    const players = await api("/api/players", { token });
    const available = players.players;

    if (available.length === 0) {
      log("PHASE 2", "No more available players!");
      break;
    }

    // Determine what position this manager needs
    const rosterSoFar = managerPicks[managerLogin];
    const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const usedSquads = new Set();
    for (const p of rosterSoFar) {
      posCounts[p.position] = (posCounts[p.position] || 0) + 1;
      usedSquads.add(p.squadId);
    }

    // Filter out players from countries already on this manager's roster
    const eligible = available.filter((p) => !usedSquads.has(p.squadId));

    let needed = [];
    if (posCounts.GK < 2) needed.push("GK");
    if (posCounts.DEF < 3) needed.push("DEF");
    if (posCounts.MID < 3) needed.push("MID");
    if (posCounts.FWD < 2) needed.push("FWD");
    if (needed.length === 0) {
      if (posCounts.GK < 2) needed.push("GK");
      needed.push("DEF", "MID", "FWD");
    }

    // Occasionally make a "mistake" — pick a random lower-ranked player (10% chance)
    const isMistake = Math.random() < 0.1 && i > 10;
    let pick;

    if (isMistake) {
      // Pick a random eligible player from positions 20-60 in the list
      const pool = eligible.length > 20 ? eligible : available;
      const randomIndex = 20 + Math.floor(Math.random() * Math.min(40, pool.length - 20));
      pick = pool[Math.max(0, Math.min(randomIndex, pool.length - 1))];
      log("PHASE 2", `  🎲 MISTAKE: ${currentManager.displayName} picks ${pick.name} (${pick.position}, ${pick.teamAbbr}, rank #${randomIndex}) instead of best`);
    } else {
      // Pick the best eligible player at a needed position
      pick = eligible.find((p) => needed.includes(p.position)) || eligible[0] || available[0];
    }

    try {
      const result = await api("/api/draft/pick", {
        token,
        method: "POST",
        body: { playerId: pick.id },
      });

      managerPicks[managerLogin].push({ id: pick.id, name: pick.name, position: pick.position, teamAbbr: pick.teamAbbr, squadId: pick.squadId });
      pickCount++;

      if (pickCount % 8 === 0) {
        const round = Math.ceil(pickCount / 8);
        log("PHASE 2", `  Round ${round} complete (${pickCount}/${totalPicks} picks)`);
      } else if (pickCount <= 8 || pickCount % 24 === 0) {
        log("PHASE 2", `  Pick ${draft.currentPick.pickNumber}: ${currentManager.displayName} → ${pick.name} (${pick.position}, ${pick.teamAbbr})`);
      }
    } catch (err) {
      log("PHASE 2", `  ERROR picking ${pick.name} for ${currentManager.displayName}: ${err.message}`);
      errors++;
      // Try picking the first available player instead
      try {
        const fallback = eligible[0] || available[0];
        await api("/api/draft/pick", { token, method: "POST", body: { playerId: fallback.id } });
        managerPicks[managerLogin].push({ id: fallback.id, name: fallback.name, position: fallback.position, teamAbbr: fallback.teamAbbr, squadId: fallback.squadId });
        pickCount++;
      } catch (err2) {
        log("PHASE 2", `  DOUBLE ERROR: ${err2.message}`);
        errors++;
      }
    }
  }

  log("PHASE 2", `Draft finished: ${pickCount} picks made, ${errors} errors`);
  return managerPicks;
}

// ---------------------------------------------------------------------------
// Phase 3: Verify Draft State
// ---------------------------------------------------------------------------

async function phase3_verify_draft() {
  log("PHASE 3", "=== VERIFYING DRAFT STATE ===");

  const draft = await api("/api/draft", { token: tokens["pedro"] });
  assert(draft.isComplete === true, "Draft should be complete");
  assert(draft.picks.length === 120, `Expected 120 picks, got ${draft.picks.length}`);

  // Check each manager has 15 players
  const standings = await api("/api/standings", { token: tokens["pedro"] });
  for (const row of standings.standings) {
    assert(row.roster?.length === 15, `${row.displayName} has ${row.roster?.length} players, expected 15`);
    log("PHASE 3", `  ${row.displayName}: ${row.roster?.length} players, ${row.totalPoints} pts`);
  }

  // Check snake order: first pick should be manager 1, 8th pick should be manager 8,
  // 9th pick (round 2) should be manager 8, 16th should be manager 1
  assert(draft.picks[0].managerId === draft.managers[0].id, "Pick 1 should be manager 1");
  assert(draft.picks[7].managerId === draft.managers[7].id, "Pick 8 should be manager 8");
  assert(draft.picks[8].managerId === draft.managers[7].id, "Pick 9 (round 2) should be manager 8 (snake)");
  assert(draft.picks[15].managerId === draft.managers[0].id, "Pick 16 (round 2 end) should be manager 1 (snake)");
  log("PHASE 3", "Snake draft order verified ✓");

  // Check managerSquads populated
  for (const m of draft.managers) {
    const squads = draft.managerSquads[m.id];
    assert(Array.isArray(squads), `managerSquads for ${m.displayName} should be an array`);
    assert(squads.length === 15, `${m.displayName} should have 15 squad entries, got ${squads?.length}`);
  }
  log("PHASE 3", "Manager squads verified ✓");

  // Verify no player is owned by two managers
  const allPlayerIds = new Set();
  let duplicates = 0;
  for (const row of standings.standings) {
    for (const p of row.roster || []) {
      if (allPlayerIds.has(p.id)) {
        log("PHASE 3", `  DUPLICATE: Player ${p.name} (${p.id}) owned by multiple managers!`);
        duplicates++;
      }
      allPlayerIds.add(p.id);
    }
  }
  assert(duplicates === 0, `Found ${duplicates} duplicate player ownerships`);
  log("PHASE 3", `Unique player ownership verified ✓ (${allPlayerIds.size} unique players)`);

  // Verify one-per-country per manager
  let countryDups = 0;
  for (const row of standings.standings) {
    const squads = new Set();
    for (const p of row.roster || []) {
      if (squads.has(p.squadId)) {
        log("PHASE 3", `  COUNTRY DUP: ${row.displayName} has multiple players from squad ${p.squadId} (${p.teamAbbr})`);
        countryDups++;
      }
      squads.add(p.squadId);
    }
  }
  assert(countryDups === 0, `Found ${countryDups} country duplicates`);
  log("PHASE 3", `One-per-country verified ✓`);
}

// ---------------------------------------------------------------------------
// Phase 4: Set Lineups
// ---------------------------------------------------------------------------

async function phase4_set_lineups() {
  log("PHASE 4", "=== SETTING LINEUPS FOR ALL MANAGERS ===");

  for (const login of MANAGERS) {
    const token = tokens[login];
    const me = await api("/api/me", { token });
    const roster = me.team.players;

    if (roster.length < 11) {
      log("PHASE 4", `  ${me.manager.displayName}: only ${roster.length} players, skipping lineup`);
      continue;
    }

    // Build a valid 4-3-3 lineup
    const gks = roster.filter((p) => p.position === "GK");
    const defs = roster.filter((p) => p.position === "DEF");
    const mids = roster.filter((p) => p.position === "MID");
    const fwds = roster.filter((p) => p.position === "FWD");

    const xi = [
      ...gks.slice(0, 1),
      ...defs.slice(0, 4),
      ...mids.slice(0, 3),
      ...fwds.slice(0, 3),
    ];

    if (xi.length < 11) {
      // Fill remaining spots from any position
      const inXI = new Set(xi.map((p) => p.id));
      for (const p of roster) {
        if (xi.length >= 11) break;
        if (!inXI.has(p.id)) { xi.push(p); inXI.add(p.id); }
      }
    }

    const captainId = xi.find((p) => p.position === "FWD")?.id || xi[0].id;

    try {
      // Toggle each player into XI
      for (const p of xi.slice(0, 11)) {
        await api("/api/lineup/toggle", { token, method: "POST", body: { playerId: p.id } });
      }

      // Set captain
      await api("/api/lineup/captain", { token, method: "POST", body: { playerId: captainId } });

      const lineup = await api("/api/lineup", { token });
      assert(lineup.startingXI.length === 11, `${me.manager.displayName} XI should have 11, got ${lineup.startingXI.length}`);
      assert(lineup.captainId === captainId, `${me.manager.displayName} captain should be ${captainId}`);
      log("PHASE 4", `  ${me.manager.displayName}: XI set (${lineup.startingXI.length}/11), captain=${lineup.captainId} ✓`);
    } catch (err) {
      log("PHASE 4", `  ERROR setting lineup for ${me.manager.displayName}: ${err.message}`);
      errors++;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 5: Trades
// ---------------------------------------------------------------------------

async function phase5_trades() {
  log("PHASE 5", "=== TESTING TRADES ===");

  // Pedro proposes a trade to Tesla Team
  const pedroMe = await api("/api/me", { token: tokens["pedro"] });
  const teslaMe = await api("/api/me", { token: tokens["tesla_team"] });

  const pedroPlayer = pedroMe.team.players[0];
  const teslaPlayer = teslaMe.team.players[0];

  log("PHASE 5", `  Proposing: Pedro's ${pedroPlayer.name} ↔ Tesla's ${teslaPlayer.name}`);

  const trade1 = await api("/api/trades", {
    token: tokens["pedro"],
    method: "POST",
    body: {
      toManagerId: teslaMe.manager.id,
      offeringPlayerIds: [pedroPlayer.id],
      requestingPlayerIds: [teslaPlayer.id],
    },
  });
  assert(trade1.tradeId, "Trade should be created");
  log("PHASE 5", `  Trade #${trade1.tradeId} proposed ✓`);

  // Tesla accepts
  await api(`/api/trades/${trade1.tradeId}/accept`, { token: tokens["tesla_team"], method: "POST" });
  log("PHASE 5", `  Trade #${trade1.tradeId} accepted ✓`);

  // Verify players swapped
  const pedroAfter = await api("/api/me", { token: tokens["pedro"] });
  const teslaAfter = await api("/api/me", { token: tokens["tesla_team"] });

  const pedroHasTeslaPlayer = pedroAfter.team.players.some((p) => p.id === teslaPlayer.id);
  const teslaHasPedroPlayer = teslaAfter.team.players.some((p) => p.id === pedroPlayer.id);
  assert(pedroHasTeslaPlayer, `Pedro should now have ${teslaPlayer.name}`);
  assert(teslaHasPedroPlayer, `Tesla should now have ${pedroPlayer.name}`);
  log("PHASE 5", `  Player swap verified ✓`);

  // Monarcas proposes to Aidan, then cancels
  const monarcasMe = await api("/api/me", { token: tokens["monarcas"] });
  const aidanMe = await api("/api/me", { token: tokens["aidan"] });
  const trade2 = await api("/api/trades", {
    token: tokens["monarcas"],
    method: "POST",
    body: {
      toManagerId: aidanMe.manager.id,
      offeringPlayerIds: [monarcasMe.team.players[1].id],
      requestingPlayerIds: [aidanMe.team.players[1].id],
    },
  });
  await api(`/api/trades/${trade2.tradeId}/cancel`, { token: tokens["monarcas"], method: "POST" });
  log("PHASE 5", `  Trade #${trade2.tradeId} cancelled ✓`);

  // Sam proposes to Evelyn, Evelyn rejects
  const samMe = await api("/api/me", { token: tokens["sam"] });
  const evelynMe = await api("/api/me", { token: tokens["evelyn"] });
  const trade3 = await api("/api/trades", {
    token: tokens["sam"],
    method: "POST",
    body: {
      toManagerId: evelynMe.manager.id,
      offeringPlayerIds: [samMe.team.players[2].id],
      requestingPlayerIds: [evelynMe.team.players[2].id],
    },
  });
  await api(`/api/trades/${trade3.tradeId}/reject`, { token: tokens["evelyn"], method: "POST" });
  log("PHASE 5", `  Trade #${trade3.tradeId} rejected ✓`);

  // Verify trade list
  const allTrades = await api("/api/trades", { token: tokens["pedro"] });
  assert(allTrades.trades.length === 3, `Expected 3 trades, got ${allTrades.trades.length}`);
  const statuses = allTrades.trades.map((t) => t.status).sort();
  assert(statuses.includes("accepted"), "Should have an accepted trade");
  assert(statuses.includes("cancelled"), "Should have a cancelled trade");
  assert(statuses.includes("rejected"), "Should have a rejected trade");
  log("PHASE 5", `  Trade history verified: ${allTrades.trades.length} trades ✓`);
}

// ---------------------------------------------------------------------------
// Phase 6: Free Agency
// ---------------------------------------------------------------------------

async function phase6_free_agency() {
  log("PHASE 6", "=== TESTING FREE AGENCY ===");

  // Check FA status (should be closed)
  const status1 = await api("/api/free-agents/status", { token: tokens["pedro"] });
  assert(status1.isOpen === false, "FA should be closed initially");
  log("PHASE 6", `  FA status: closed ✓`);

  // Complete matchday to open FA
  await api("/api/admin/complete-matchday", { token: tokens["pedro"], method: "POST", body: { matchday: 1 } });
  const status2 = await api("/api/free-agents/status", { token: tokens["pedro"] });
  assert(status2.isOpen === true, "FA should be open after completing matchday");
  log("PHASE 6", `  FA opened after matchday 1 ✓`);

  // Get FA pool
  const pool = await api("/api/free-agents/pool", { token: tokens["pedro"] });
  assert(pool.pool.length > 0, "FA pool should have players");
  log("PHASE 6", `  FA pool: ${pool.pool.length} players available`);

  // Pedro releases a player first, then claims from FA
  const pedroMe = await api("/api/me", { token: tokens["pedro"] });
  const releasePlayer = pedroMe.team.players[pedroMe.team.players.length - 1]; // release last player

  await api("/api/free-agents/release", { token: tokens["pedro"], method: "POST", body: { playerId: releasePlayer.id } });
  log("PHASE 6", `  Pedro released ${releasePlayer.name} (${releasePlayer.position})`);

  const pedroAfterRelease = await api("/api/me", { token: tokens["pedro"] });
  assert(pedroAfterRelease.team.players.length === 14, `Pedro should have 14 players, got ${pedroAfterRelease.team.players.length}`);

  // Claim a free agent
  const faPlayer = pool.pool[0];
  await api("/api/free-agents/claim", { token: tokens["pedro"], method: "POST", body: { playerId: faPlayer.id } });
  log("PHASE 6", `  Pedro claimed ${faPlayer.name} (${faPlayer.position}) from FA`);

  const pedroFinal = await api("/api/me", { token: tokens["pedro"] });
  assert(pedroFinal.team.players.length === 15, `Pedro should be back to 15 players, got ${pedroFinal.team.players.length}`);
  assert(pedroFinal.team.players.some((p) => p.id === faPlayer.id), `Pedro should have ${faPlayer.name}`);
  log("PHASE 6", `  FA claim verified ✓`);
}

// ---------------------------------------------------------------------------
// Phase 7: Final State
// ---------------------------------------------------------------------------

async function phase7_final_state() {
  log("PHASE 7", "=== FINAL STATE DUMP ===");

  const standings = await api("/api/standings", { token: tokens["pedro"] });
  log("PHASE 7", "League Standings:");
  for (const [i, row] of standings.standings.entries()) {
    log("PHASE 7", `  ${i + 1}. ${row.displayName} — ${row.totalPoints} pts, ${row.roster?.length} players`);
  }

  const draft = await api("/api/draft", { token: tokens["pedro"] });
  log("PHASE 7", `Draft: ${draft.picks.length} picks, complete=${draft.isComplete}`);

  const trades = await api("/api/trades", { token: tokens["pedro"] });
  log("PHASE 7", `Trades: ${trades.trades.length} total`);
  for (const t of trades.trades) {
    log("PHASE 7", `  #${t.id}: ${t.fromName} → ${t.toName} (${t.status})`);
  }

  const faStatus = await api("/api/free-agents/status", { token: tokens["pedro"] });
  log("PHASE 7", `Free Agency: open=${faStatus.isOpen}, matchday=${faStatus.currentMatchday}`);

  // Check rounds
  const rounds = await api("/api/rounds", { token: tokens["pedro"] });
  log("PHASE 7", `Schedule: ${rounds.rounds?.length} rounds`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🏆 FIFA DRAFT FULL SIMULATION");
  console.log(`Server: ${BASE}`);
  console.log("=".repeat(60));

  const start = Date.now();

  try {
    await phase1_reset_and_login();
    console.log();
    await phase2_run_draft();
    console.log();
    await phase3_verify_draft();
    console.log();
    await phase4_set_lineups();
    console.log();
    await phase5_trades();
    console.log();
    await phase6_free_agency();
    console.log();
    await phase7_final_state();
  } catch (err) {
    console.error(`\n💀 FATAL ERROR: ${err.message}`);
    console.error(err.stack);
    errors++;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Simulation complete in ${elapsed}s`);
  console.log(`   ${pickCount} draft picks made`);
  console.log(`   ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
