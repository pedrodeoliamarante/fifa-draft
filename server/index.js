const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const express = require("express");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const fifaDir = path.join(dataDir, "fifa-fantasy");
const dbPath = path.join(dataDir, "draft.db");

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TOTAL_ROUNDS = 15;
const MAX_ROSTER = 15;
const MAX_GK = 2;
const PICK_TIMER_MS = 60 * 60 * 1000; // 1 hour

const initialManagers = [
  { displayName: "Brasil Penta", loginName: "pedro", password: "demo", logo: "/assets/pedro.png" },
  { displayName: "Tesla Team", loginName: "tesla_team", password: "demo", logo: "/assets/tesla.png" },
  { displayName: "Monarcas", loginName: "monarcas", password: "demo", logo: "/assets/monarcas.png" },
  { displayName: "Aidan", loginName: "aidan", password: "demo", logo: "/assets/aidan.png" },
  { displayName: "Sam Bruh Scores", loginName: "sam", password: "demo", logo: "/assets/sam.png" },
  { displayName: "Evelyn Stars", loginName: "evelyn", password: "demo", logo: "/assets/evelyn.png" },
  { displayName: "Hang He Chan Love", loginName: "hang_he_chan_love", password: "demo", logo: "/assets/kellen.png" },
  { displayName: "Croat Goats", loginName: "croat_goats", password: "demo", logo: "/assets/croats.png" },
];

const formationSlots = {
  "3-4-3": ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
  "3-5-2": ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD"],
  "4-4-2": ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"],
  "4-3-3": ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
  "4-5-1": ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD"],
  "5-3-2": ["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"],
  "5-4-1": ["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fifaDir, name), "utf8"));
}

function positionCounts(players) {
  const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) c[p.position] = (c[p.position] || 0) + 1;
  return c;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function setupSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      login_name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      logo TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      manager_id INTEGER NOT NULL REFERENCES managers(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS league_managers (
      league_id INTEGER NOT NULL REFERENCES leagues(id),
      manager_id INTEGER NOT NULL REFERENCES managers(id),
      draft_position INTEGER NOT NULL,
      PRIMARY KEY (league_id, manager_id)
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL REFERENCES leagues(id),
      manager_id INTEGER NOT NULL REFERENCES managers(id),
      UNIQUE (league_id, manager_id)
    );

    CREATE TABLE IF NOT EXISTS squads (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      abbreviation TEXT NOT NULL,
      group_name TEXT,
      is_eliminated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      known_name TEXT,
      squad_id INTEGER NOT NULL REFERENCES squads(id),
      position TEXT NOT NULL,
      price REAL NOT NULL,
      status TEXT NOT NULL,
      match_status TEXT,
      percent_selected REAL NOT NULL,
      total_points REAL NOT NULL,
      avg_points REAL NOT NULL,
      form REAL NOT NULL,
      last_round_points REAL NOT NULL,
      one_to_watch INTEGER NOT NULL,
      next_fixture_id INTEGER,
      fifa_id TEXT
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY,
      stage TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fixtures (
      id INTEGER PRIMARY KEY,
      round_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      date TEXT,
      status TEXT NOT NULL,
      period TEXT,
      venue_name TEXT,
      venue_city TEXT,
      home_squad_id INTEGER,
      away_squad_id INTEGER,
      home_squad_abbr TEXT,
      away_squad_abbr TEXT,
      home_score INTEGER,
      away_score INTEGER
    );

    CREATE TABLE IF NOT EXISTS team_players (
      team_id INTEGER NOT NULL REFERENCES teams(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      acquired_via TEXT NOT NULL DEFAULT 'draft',
      is_active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (team_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS lineups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      round_id INTEGER NOT NULL,
      formation TEXT NOT NULL,
      captain_player_id INTEGER REFERENCES players(id),
      locked_at TEXT,
      UNIQUE (team_id, round_id)
    );

    CREATE TABLE IF NOT EXISTS lineup_players (
      lineup_id INTEGER NOT NULL REFERENCES lineups(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      slot_index INTEGER NOT NULL,
      slot_position TEXT NOT NULL,
      PRIMARY KEY (lineup_id, slot_index)
    );

    CREATE TABLE IF NOT EXISTS draft_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL REFERENCES leagues(id),
      pick_number INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      manager_id INTEGER NOT NULL REFERENCES managers(id),
      player_id INTEGER REFERENCES players(id),
      UNIQUE (league_id, pick_number)
    );

    CREATE TABLE IF NOT EXISTS draft_timers (
      league_id INTEGER PRIMARY KEY REFERENCES leagues(id),
      current_pick_started_at TEXT NOT NULL,
      timer_duration_ms INTEGER NOT NULL DEFAULT 3600000
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL REFERENCES leagues(id),
      from_manager_id INTEGER NOT NULL REFERENCES managers(id),
      to_manager_id INTEGER NOT NULL REFERENCES managers(id),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS trade_players (
      trade_id INTEGER NOT NULL REFERENCES trades(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      direction TEXT NOT NULL,
      PRIMARY KEY (trade_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS free_agent_state (
      league_id INTEGER PRIMARY KEY REFERENCES leagues(id),
      pool_seed INTEGER NOT NULL,
      current_matchday INTEGER NOT NULL DEFAULT 1,
      is_open INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS completed_matchdays (
      league_id INTEGER NOT NULL REFERENCES leagues(id),
      matchday_number INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      PRIMARY KEY (league_id, matchday_number)
    );

    CREATE TABLE IF NOT EXISTS player_round_points (
      player_id INTEGER NOT NULL REFERENCES players(id),
      round_id INTEGER NOT NULL,
      points REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, round_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_team_players_active_player
    ON team_players(player_id)
    WHERE is_active = 1;
  `);
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seedManagersAndLeague() {
  const insertManager = db.prepare(
    "INSERT OR IGNORE INTO managers (display_name, login_name, password_hash, logo) VALUES (?, ?, ?, ?)"
  );
  for (const m of initialManagers) {
    insertManager.run(m.displayName, m.loginName, hashPassword(m.password), m.logo);
  }

  db.prepare("INSERT OR IGNORE INTO leagues (id, name, status) VALUES (1, ?, ?)").run("World Cup Draft", "setup");

  const managers = db.prepare("SELECT id FROM managers ORDER BY id").all();
  const insertLM = db.prepare("INSERT OR IGNORE INTO league_managers (league_id, manager_id, draft_position) VALUES (1, ?, ?)");
  const insertTeam = db.prepare("INSERT OR IGNORE INTO teams (league_id, manager_id) VALUES (1, ?)");
  managers.forEach((m, i) => {
    insertLM.run(m.id, i + 1);
    insertTeam.run(m.id);
  });

  // Seed FA state
  db.prepare("INSERT OR IGNORE INTO free_agent_state (league_id, pool_seed, current_matchday, is_open) VALUES (1, ?, 1, 0)").run(Date.now());
}

function seedFifaData() {
  if (db.prepare("SELECT COUNT(*) AS count FROM players").get().count > 0) return;

  const squads = readJson("squads.json");
  const players = readJson("players.json");
  const roundsData = readJson("rounds.json");

  db.exec("BEGIN");
  try {
    const insSquad = db.prepare("INSERT INTO squads (id, name, abbreviation, group_name, is_eliminated) VALUES (?, ?, ?, ?, ?)");
    for (const s of squads) insSquad.run(s.id, s.name, s.abbr, s.group, s.isEliminated ? 1 : 0);

    const insPlayer = db.prepare(`
      INSERT INTO players (id, first_name, last_name, known_name, squad_id, position, price, status,
        match_status, percent_selected, total_points, avg_points, form, last_round_points, one_to_watch, next_fixture_id, fifa_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of players) {
      insPlayer.run(p.id, p.firstName, p.lastName, p.knownName, p.squadId, p.position, p.price, p.status,
        p.matchStatus, p.percentSelected, p.stats.totalPoints, p.stats.avgPoints, p.stats.form,
        p.stats.lastRoundPoints, p.oneToWatch ? 1 : 0, p.stats.nextFixtureFromScheduledRound, p.fifaId);
    }

    const insRound = db.prepare("INSERT OR IGNORE INTO rounds (id, stage) VALUES (?, ?)");
    const insFixture = db.prepare(`
      INSERT INTO fixtures (id, round_id, stage, date, status, period, venue_name, venue_city,
        home_squad_id, away_squad_id, home_squad_abbr, away_squad_abbr, home_score, away_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of roundsData) {
      insRound.run(r.id, r.stage || "group");
      for (const f of r.tournaments || []) {
        insFixture.run(f.id, r.id, r.stage || "group", f.date, f.status, f.period, f.venueName, f.venueCity,
          f.homeSquadId, f.awaySquadId, f.homeSquadAbbr, f.awaySquadAbbr, f.homeScore, f.awayScore);
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Player SQL helper
// ---------------------------------------------------------------------------

function playerSelectSql(whereClause = "") {
  return `
    SELECT p.id, p.first_name AS firstName, p.last_name AS lastName, p.known_name AS knownName,
      COALESCE(p.known_name, TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))) AS name,
      p.squad_id AS squadId, p.position, p.price, p.status, p.match_status AS matchStatus,
      p.percent_selected AS percentSelected, p.total_points AS totalPoints, p.avg_points AS avgPoints,
      p.form, p.last_round_points AS lastRoundPoints, p.one_to_watch AS oneToWatch, p.fifa_id AS fifaId,
      s.name AS team, s.abbreviation AS teamAbbr, s.group_name AS groupName,
      f.date AS nextFixtureDate,
      CASE WHEN f.id IS NULL THEN NULL ELSE f.home_squad_abbr || ' v ' || f.away_squad_abbr END AS nextFixture
    FROM players p
    JOIN squads s ON s.id = p.squad_id
    LEFT JOIN fixtures f ON f.id = p.next_fixture_id
    ${whereClause}
  `;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function getSessionManager(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  return db.prepare(`
    SELECT m.id, m.display_name AS displayName, m.login_name AS loginName, m.logo
    FROM sessions ss JOIN managers m ON m.id = ss.manager_id WHERE ss.token = ?
  `).get(token);
}

function requireAuth(req, res, next) {
  const manager = getSessionManager(req);
  if (!manager) return res.status(401).json({ error: "Not logged in" });
  req.manager = manager;
  next();
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

function getLeagueForManager(managerId) {
  return db.prepare(`
    SELECT l.id, l.name, l.status, lm.draft_position AS draftPosition
    FROM leagues l JOIN league_managers lm ON lm.league_id = l.id
    WHERE lm.manager_id = ? ORDER BY l.id LIMIT 1
  `).get(managerId);
}

function getTeamForManager(managerId) {
  const team = db.prepare("SELECT id, league_id AS leagueId, manager_id AS managerId FROM teams WHERE manager_id = ? LIMIT 1").get(managerId);
  if (!team) return null;
  const players = db.prepare(playerSelectSql("JOIN team_players tp ON tp.player_id = p.id WHERE tp.team_id = ? AND tp.is_active = 1")).all(team.id);
  return { ...team, players };
}

function getTeamId(managerId) {
  const row = db.prepare("SELECT id FROM teams WHERE league_id = 1 AND manager_id = ?").get(managerId);
  return row ? row.id : null;
}

function getLeagueManagers(leagueId = 1) {
  return db.prepare(`
    SELECT m.id, m.display_name AS displayName, m.login_name AS loginName, m.logo, lm.draft_position AS draftPosition
    FROM league_managers lm JOIN managers m ON m.id = lm.manager_id
    WHERE lm.league_id = ? ORDER BY lm.draft_position
  `).all(leagueId);
}

function getRosterPlayers(teamId) {
  return db.prepare(playerSelectSql("JOIN team_players tp ON tp.player_id = p.id WHERE tp.team_id = ? AND tp.is_active = 1")).all(teamId);
}

// ---------------------------------------------------------------------------
// Draft logic
// ---------------------------------------------------------------------------

function getDraftManagerForPick(managers, pickNumber) {
  const roundNumber = Math.ceil(pickNumber / managers.length);
  const indexInRound = (pickNumber - 1) % managers.length;
  const orderedIndex = roundNumber % 2 === 1 ? indexInRound : managers.length - 1 - indexInRound;
  return { manager: managers[orderedIndex], roundNumber };
}

function getDraftState(leagueId = 1) {
  const managers = getLeagueManagers(leagueId);
  const totalPicks = managers.length * TOTAL_ROUNDS;
  const picks = db.prepare(`
    SELECT dp.id, dp.pick_number AS pickNumber, dp.round_number AS roundNumber,
      dp.manager_id AS managerId, m.display_name AS managerName, dp.player_id AS playerId,
      COALESCE(p.known_name, TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))) AS playerName,
      p.position, s.abbreviation AS teamAbbr, p.squad_id AS squadId
    FROM draft_picks dp JOIN managers m ON m.id = dp.manager_id
    LEFT JOIN players p ON p.id = dp.player_id LEFT JOIN squads s ON s.id = p.squad_id
    WHERE dp.league_id = ? ORDER BY dp.pick_number
  `).all(leagueId);

  const nextPickNumber = picks.length + 1;
  const isComplete = nextPickNumber > totalPicks;
  const current = isComplete ? null : getDraftManagerForPick(managers, nextPickNumber);

  // Build managerSquads map
  const managerSquads = {};
  for (const m of managers) managerSquads[m.id] = [];
  for (const pick of picks) {
    if (pick.squadId && managerSquads[pick.managerId]) {
      managerSquads[pick.managerId].push(pick.squadId);
    }
  }

  // Timer
  const timer = db.prepare("SELECT current_pick_started_at AS startedAt FROM draft_timers WHERE league_id = ?").get(leagueId);

  return {
    managers, picks, totalRounds: TOTAL_ROUNDS, totalPicks, nextPickNumber, isComplete, managerSquads,
    currentPick: current ? { pickNumber: nextPickNumber, roundNumber: current.roundNumber, manager: current.manager } : null,
    timerStart: timer ? new Date(timer.startedAt).getTime() : null,
  };
}

function executePick(leagueId, pickNumber, roundNumber, managerId, playerId) {
  const teamId = getTeamId(managerId);
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO draft_picks (league_id, pick_number, round_number, manager_id, player_id) VALUES (?, ?, ?, ?, ?)")
      .run(leagueId, pickNumber, roundNumber, managerId, playerId);
    db.prepare("INSERT INTO team_players (team_id, player_id, acquired_via, is_active) VALUES (?, ?, 'draft', 1)")
      .run(teamId, playerId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  // Reset timer for next pick
  db.prepare("INSERT OR REPLACE INTO draft_timers (league_id, current_pick_started_at, timer_duration_ms) VALUES (?, ?, ?)")
    .run(leagueId, new Date().toISOString(), PICK_TIMER_MS);
}

function autoPick(leagueId) {
  const draft = getDraftState(leagueId);
  if (draft.isComplete) return null;

  const managerId = draft.currentPick.manager.id;
  const teamId = getTeamId(managerId);
  const roster = getRosterPlayers(teamId);
  const counts = positionCounts(roster);

  const needed = [];
  if (counts.GK < 2) needed.push("GK");
  if (counts.DEF < 3) needed.push("DEF");
  if (counts.MID < 3) needed.push("MID");
  if (counts.FWD < 2) needed.push("FWD");
  if (needed.length === 0) {
    if (counts.GK < MAX_GK) needed.push("GK");
    needed.push("DEF", "MID", "FWD");
  }

  const available = db.prepare(`
    ${playerSelectSql(`
      LEFT JOIN team_players owned ON owned.player_id = p.id AND owned.is_active = 1
      WHERE p.status = 'playing' AND owned.player_id IS NULL
    `)} ORDER BY p.price DESC, p.percent_selected DESC
  `).all();

  const posSet = new Set(needed);
  const pick = available.find((p) => posSet.has(p.position)) || available[0];
  if (!pick) return null;

  executePick(leagueId, draft.currentPick.pickNumber, draft.currentPick.roundNumber, managerId, pick.id);
  return pick;
}

function checkAndRunAutoPick(leagueId = 1) {
  const draft = getDraftState(leagueId);
  if (draft.isComplete) return;

  const timer = db.prepare("SELECT current_pick_started_at AS startedAt, timer_duration_ms AS duration FROM draft_timers WHERE league_id = ?").get(leagueId);
  if (!timer) return;

  const elapsed = Date.now() - new Date(timer.startedAt).getTime();
  if (elapsed >= timer.duration) {
    console.log(`Auto-picking for ${draft.currentPick.manager.displayName} (timer expired)`);
    autoPick(leagueId);
    checkAndRunAutoPick(leagueId); // recurse in case multiple expired
  }
}

// ---------------------------------------------------------------------------
// Lineup helpers
// ---------------------------------------------------------------------------

function getWorkingLineup(teamId) {
  const lineup = db.prepare("SELECT id, formation, captain_player_id AS captainId FROM lineups WHERE team_id = ? AND round_id = 0").get(teamId);
  if (!lineup) return { formation: "4-3-3", startingXI: [], captainId: null };
  const players = db.prepare("SELECT player_id AS playerId FROM lineup_players WHERE lineup_id = ? ORDER BY slot_index").all(lineup.id);
  return { formation: lineup.formation, startingXI: players.map((p) => p.playerId), captainId: lineup.captainId };
}

function saveWorkingLineup(teamId, formation, startingXI, captainId) {
  db.exec("BEGIN");
  try {
    const existing = db.prepare("SELECT id FROM lineups WHERE team_id = ? AND round_id = 0").get(teamId);
    let lineupId;
    if (existing) {
      db.prepare("UPDATE lineups SET formation = ?, captain_player_id = ? WHERE id = ?").run(formation, captainId, existing.id);
      db.prepare("DELETE FROM lineup_players WHERE lineup_id = ?").run(existing.id);
      lineupId = existing.id;
    } else {
      const result = db.prepare("INSERT INTO lineups (team_id, round_id, formation, captain_player_id) VALUES (?, 0, ?, ?)").run(teamId, formation, captainId);
      lineupId = Number(result.lastInsertRowid);
    }
    const ins = db.prepare("INSERT INTO lineup_players (lineup_id, player_id, slot_index, slot_position) VALUES (?, ?, ?, ?)");
    const slots = formationSlots[formation] || formationSlots["4-3-3"];
    startingXI.forEach((playerId, i) => ins.run(lineupId, playerId, i, slots[i] || "BENCH"));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

function getRoundInfo(roundId) {
  const fixtures = db.prepare("SELECT * FROM fixtures WHERE round_id = ? ORDER BY date").all(roundId);
  const round = db.prepare("SELECT * FROM rounds WHERE id = ?").get(roundId);
  const firstKickoff = fixtures.length > 0 && fixtures[0].date ? new Date(fixtures[0].date).getTime() : null;
  const isLocked = firstKickoff ? Date.now() >= firstKickoff : false;
  const lockTimeLeft = firstKickoff && !isLocked ? firstKickoff - Date.now() : 0;
  return { id: roundId, stage: round?.stage, fixtures, firstKickoff, isLocked, lockTimeLeft };
}

function getCurrentMatchday() {
  const now = Date.now();
  const rounds = db.prepare("SELECT DISTINCT round_id FROM fixtures ORDER BY round_id").all();
  let upcoming = null;
  let active = null;

  for (const { round_id } of rounds) {
    const info = getRoundInfo(round_id);
    if (!info.firstKickoff) continue;
    const lastFixture = info.fixtures[info.fixtures.length - 1];
    const lastKickoff = lastFixture?.date ? new Date(lastFixture.date).getTime() : info.firstKickoff;

    if (now < info.firstKickoff) {
      if (!upcoming || info.firstKickoff < upcoming.firstKickoff) upcoming = info;
    } else if (now <= lastKickoff + 3 * 60 * 60 * 1000) {
      active = info;
    }
  }
  return active || upcoming || null;
}

// ---------------------------------------------------------------------------
// Free agent helpers
// ---------------------------------------------------------------------------

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateFreeAgentPool(leagueId = 1) {
  const fa = db.prepare("SELECT pool_seed AS seed FROM free_agent_state WHERE league_id = ?").get(leagueId);
  if (!fa) return [];

  const managers = getLeagueManagers(leagueId);
  const available = db.prepare(`
    ${playerSelectSql(`
      LEFT JOIN team_players owned ON owned.player_id = p.id AND owned.is_active = 1
      WHERE p.status = 'playing' AND owned.player_id IS NULL
    `)} ORDER BY p.price DESC
  `).all();

  if (available.length === 0) return [];

  const poolSize = Math.min(managers.length * 3, available.length);
  const total = available.length;
  const topEnd = Math.floor(total * 0.3);
  const midEnd = Math.floor(total * 0.7);

  const topTier = available.slice(0, topEnd);
  const midTier = available.slice(topEnd, midEnd);
  const lowTier = available.slice(midEnd);

  const topCount = Math.round(poolSize * 0.7);
  const midCount = Math.round(poolSize * 0.2);
  const lowCount = poolSize - topCount - midCount;

  const rng = seededRandom(fa.seed);
  function sample(arr, n) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(n, shuffled.length));
  }

  return [...sample(topTier, topCount), ...sample(midTier, midCount), ...sample(lowTier, lowCount)]
    .sort((a, b) => b.price - a.price);
}

// ---------------------------------------------------------------------------
// Schema setup & seed
// ---------------------------------------------------------------------------

setupSchema();
seedManagersAndLeague();
seedFifaData();

// Start draft timer if not already set
const draftState = getDraftState(1);
if (!draftState.isComplete && !draftState.timerStart) {
  db.prepare("INSERT OR REPLACE INTO draft_timers (league_id, current_pick_started_at, timer_duration_ms) VALUES (1, ?, ?)")
    .run(new Date().toISOString(), PICK_TIMER_MS);
}

// Auto-pick interval
setInterval(() => {
  try { checkAndRunAutoPick(1); } catch (err) { console.error("Auto-pick error:", err.message); }
}, 30000);

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
// Serve frontend static files (so everything runs on one origin — no CORS popups)
const distDir = path.join(rootDir, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: "index.html" }));
}

app.use(express.json());

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

app.post("/api/login", (req, res) => {
  const { loginName, password } = req.body || {};
  const manager = db.prepare(`
    SELECT id, display_name AS displayName, login_name AS loginName, password_hash AS passwordHash, logo
    FROM managers WHERE login_name = ?
  `).get(loginName || "");

  if (!manager || manager.passwordHash !== hashPassword(password || "")) {
    return res.status(401).json({ error: "Invalid login" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, manager_id, created_at) VALUES (?, ?, ?)").run(token, manager.id, new Date().toISOString());

  res.json({
    token,
    manager: { id: manager.id, displayName: manager.displayName, loginName: manager.loginName, logo: manager.logo },
    league: getLeagueForManager(manager.id),
    team: getTeamForManager(manager.id),
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    manager: req.manager,
    league: getLeagueForManager(req.manager.id),
    team: getTeamForManager(req.manager.id),
  });
});

// ---------------------------------------------------------------------------
// Player endpoints
// ---------------------------------------------------------------------------

app.get("/api/players", requireAuth, (req, res) => {
  const players = db.prepare(`
    ${playerSelectSql(`
      LEFT JOIN team_players owned ON owned.player_id = p.id AND owned.is_active = 1
      WHERE p.status = 'playing' AND owned.player_id IS NULL
    `)} ORDER BY p.price DESC, p.percent_selected DESC, name ASC
  `).all();
  res.json({ players });
});

app.get("/api/my-team", requireAuth, (req, res) => {
  res.json({ team: getTeamForManager(req.manager.id) });
});

app.get("/api/teams/:managerId", requireAuth, (req, res) => {
  res.json({ team: getTeamForManager(Number(req.params.managerId)) });
});

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

app.get("/api/standings", requireAuth, (req, res) => {
  const managers = getLeagueManagers(1);
  const standings = managers.map((m) => {
    const team = getTeamForManager(m.id);
    const totalPoints = (team?.players || []).reduce((sum, p) => sum + (p.totalPoints || 0), 0);
    return { managerId: m.id, displayName: m.displayName, logo: m.logo, totalPoints, roster: team?.players || [] };
  }).sort((a, b) => b.totalPoints - a.totalPoints);
  res.json({ standings });
});

// ---------------------------------------------------------------------------
// Draft endpoints
// ---------------------------------------------------------------------------

app.get("/api/draft", requireAuth, (req, res) => {
  checkAndRunAutoPick(1);
  res.json(getDraftState(1));
});

app.post("/api/draft/pick", requireAuth, (req, res) => {
  const playerId = Number(req.body?.playerId);
  if (!Number.isInteger(playerId)) return res.status(400).json({ error: "Invalid player" });

  checkAndRunAutoPick(1);
  const draft = getDraftState(1);
  if (draft.isComplete) return res.status(400).json({ error: "Draft is complete" });
  if (draft.currentPick.manager.id !== req.manager.id) {
    return res.status(403).json({ error: `It is ${draft.currentPick.manager.displayName}'s turn.` });
  }

  const player = db.prepare("SELECT id, status, squad_id AS squadId FROM players WHERE id = ?").get(playerId);
  if (!player || player.status !== "playing") return res.status(400).json({ error: "Player is not available" });

  const alreadyOwned = db.prepare("SELECT team_id FROM team_players WHERE player_id = ? AND is_active = 1").get(playerId);
  if (alreadyOwned) return res.status(409).json({ error: "Player has already been drafted" });

  const teamId = getTeamId(req.manager.id);
  const rosterCount = db.prepare("SELECT COUNT(*) AS count FROM team_players WHERE team_id = ? AND is_active = 1").get(teamId).count;
  if (rosterCount >= MAX_ROSTER) return res.status(400).json({ error: "Roster is already full" });

  // Position check
  const roster = getRosterPlayers(teamId);
  const counts = positionCounts(roster);
  if (player.position === "GK" && counts.GK >= MAX_GK) {
    return res.status(400).json({ error: "Cannot add another GK to your roster" });
  }

  try {
    executePick(1, draft.currentPick.pickNumber, draft.currentPick.roundNumber, req.manager.id, playerId);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Pick could not be saved — player or pick already taken." });
    }
    throw err;
  }

  res.json({ ok: true, draft: getDraftState(1), team: getTeamForManager(req.manager.id) });
});

// ---------------------------------------------------------------------------
// Lineup endpoints
// ---------------------------------------------------------------------------

app.get("/api/lineup", requireAuth, (req, res) => {
  const teamId = getTeamId(req.manager.id);
  res.json(getWorkingLineup(teamId));
});

app.post("/api/lineup", requireAuth, (req, res) => {
  const { formation, startingXI, captainId } = req.body || {};
  if (!formationSlots[formation]) return res.status(400).json({ error: "Invalid formation" });
  if (!Array.isArray(startingXI) || startingXI.length !== 11) return res.status(400).json({ error: "Starting XI must have 11 players" });

  const teamId = getTeamId(req.manager.id);
  const roster = getRosterPlayers(teamId);
  const rosterIds = new Set(roster.map((p) => p.id));

  for (const pid of startingXI) {
    if (!rosterIds.has(pid)) return res.status(400).json({ error: `Player ${pid} is not on your roster` });
  }
  if (captainId && !startingXI.includes(captainId)) return res.status(400).json({ error: "Captain must be in starting XI" });

  // Validate formation positions
  const slots = formationSlots[formation];
  const slotCounts = {};
  for (const s of slots) slotCounts[s] = (slotCounts[s] || 0) + 1;
  const xiPlayers = startingXI.map((id) => roster.find((p) => p.id === id));
  const xiCounts = positionCounts(xiPlayers);
  for (const pos of Object.keys(slotCounts)) {
    if ((xiCounts[pos] || 0) !== slotCounts[pos]) {
      return res.status(400).json({ error: `Formation ${formation} requires ${slotCounts[pos]} ${pos}, got ${xiCounts[pos] || 0}` });
    }
  }

  saveWorkingLineup(teamId, formation, startingXI, captainId);
  res.json(getWorkingLineup(teamId));
});

app.post("/api/lineup/toggle", requireAuth, (req, res) => {
  const { playerId } = req.body || {};
  const teamId = getTeamId(req.manager.id);
  const lineup = getWorkingLineup(teamId);
  const roster = getRosterPlayers(teamId);
  const rosterIds = new Set(roster.map((p) => p.id));

  if (!rosterIds.has(playerId)) return res.status(400).json({ error: "Player not on roster" });

  let xi = [...lineup.startingXI];
  let captain = lineup.captainId;

  if (xi.includes(playerId)) {
    xi = xi.filter((id) => id !== playerId);
    if (captain === playerId) captain = null;
  } else {
    if (xi.length >= 11) return res.status(400).json({ error: "Starting XI is full (11 players)" });
    xi.push(playerId);
  }

  saveWorkingLineup(teamId, lineup.formation, xi, captain);
  res.json(getWorkingLineup(teamId));
});

app.post("/api/lineup/captain", requireAuth, (req, res) => {
  const { playerId } = req.body || {};
  const teamId = getTeamId(req.manager.id);
  const lineup = getWorkingLineup(teamId);

  if (!lineup.startingXI.includes(playerId)) return res.status(400).json({ error: "Captain must be in starting XI" });

  saveWorkingLineup(teamId, lineup.formation, lineup.startingXI, playerId);
  res.json(getWorkingLineup(teamId));
});

app.get("/api/lineup/locked/:roundId", requireAuth, (req, res) => {
  const teamId = getTeamId(req.manager.id);
  const roundId = Number(req.params.roundId);
  const lineup = db.prepare("SELECT id, formation, captain_player_id AS captainId, locked_at AS lockedAt FROM lineups WHERE team_id = ? AND round_id = ?").get(teamId, roundId);
  if (!lineup) return res.json({ formation: null, startingXI: [], captainId: null, lockedAt: null });
  const players = db.prepare("SELECT player_id AS playerId FROM lineup_players WHERE lineup_id = ? ORDER BY slot_index").all(lineup.id);
  res.json({ formation: lineup.formation, startingXI: players.map((p) => p.playerId), captainId: lineup.captainId, lockedAt: lineup.lockedAt });
});

// ---------------------------------------------------------------------------
// Trade endpoints
// ---------------------------------------------------------------------------

app.get("/api/trades", requireAuth, (req, res) => {
  const trades = db.prepare(`
    SELECT t.id, t.from_manager_id AS fromManagerId, t.to_manager_id AS toManagerId,
      t.status, t.created_at AS createdAt, t.completed_at AS completedAt,
      mf.display_name AS fromName, mt.display_name AS toName
    FROM trades t
    JOIN managers mf ON mf.id = t.from_manager_id
    JOIN managers mt ON mt.id = t.to_manager_id
    WHERE t.league_id = 1 ORDER BY t.created_at DESC
  `).all();

  for (const trade of trades) {
    const players = db.prepare("SELECT player_id AS playerId, direction FROM trade_players WHERE trade_id = ?").all(trade.id);
    trade.offeringPlayerIds = players.filter((p) => p.direction === "offering").map((p) => p.playerId);
    trade.requestingPlayerIds = players.filter((p) => p.direction === "requesting").map((p) => p.playerId);
  }

  res.json({ trades });
});

app.post("/api/trades", requireAuth, (req, res) => {
  const { toManagerId, offeringPlayerIds, requestingPlayerIds } = req.body || {};
  if (!toManagerId || !Array.isArray(offeringPlayerIds) || !Array.isArray(requestingPlayerIds)) {
    return res.status(400).json({ error: "Invalid trade proposal" });
  }

  const fromTeamId = getTeamId(req.manager.id);
  const toTeamId = getTeamId(toManagerId);
  if (!fromTeamId || !toTeamId) return res.status(400).json({ error: "Team not found" });

  // Verify ownership
  const fromRoster = new Set(getRosterPlayers(fromTeamId).map((p) => p.id));
  const toRoster = new Set(getRosterPlayers(toTeamId).map((p) => p.id));
  for (const pid of offeringPlayerIds) {
    if (!fromRoster.has(pid)) return res.status(400).json({ error: `You don't own player ${pid}` });
  }
  for (const pid of requestingPlayerIds) {
    if (!toRoster.has(pid)) return res.status(400).json({ error: `Target manager doesn't own player ${pid}` });
  }

  db.exec("BEGIN");
  try {
    const result = db.prepare("INSERT INTO trades (league_id, from_manager_id, to_manager_id, status, created_at) VALUES (1, ?, ?, 'pending', ?)")
      .run(req.manager.id, toManagerId, new Date().toISOString());
    const tradeId = Number(result.lastInsertRowid);
    const ins = db.prepare("INSERT INTO trade_players (trade_id, player_id, direction) VALUES (?, ?, ?)");
    for (const pid of offeringPlayerIds) ins.run(tradeId, pid, "offering");
    for (const pid of requestingPlayerIds) ins.run(tradeId, pid, "requesting");
    db.exec("COMMIT");
    res.json({ ok: true, tradeId });
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
});

app.post("/api/trades/:id/accept", requireAuth, (req, res) => {
  const tradeId = Number(req.params.id);
  const trade = db.prepare("SELECT * FROM trades WHERE id = ? AND status = 'pending'").get(tradeId);
  if (!trade) return res.status(404).json({ error: "Trade not found or not pending" });
  if (trade.to_manager_id !== req.manager.id) return res.status(403).json({ error: "Only the recipient can accept" });

  const players = db.prepare("SELECT player_id, direction FROM trade_players WHERE trade_id = ?").all(tradeId);
  const fromTeamId = getTeamId(trade.from_manager_id);
  const toTeamId = getTeamId(trade.to_manager_id);

  db.exec("BEGIN");
  try {
    for (const { player_id, direction } of players) {
      const oldTeam = direction === "offering" ? fromTeamId : toTeamId;
      const newTeam = direction === "offering" ? toTeamId : fromTeamId;
      db.prepare("UPDATE team_players SET is_active = 0 WHERE team_id = ? AND player_id = ? AND is_active = 1").run(oldTeam, player_id);
      db.prepare("INSERT INTO team_players (team_id, player_id, acquired_via, is_active) VALUES (?, ?, 'trade', 1)").run(newTeam, player_id);
    }
    db.prepare("UPDATE trades SET status = 'accepted', completed_at = ? WHERE id = ?").run(new Date().toISOString(), tradeId);

    // Cancel other pending trades involving these players
    const affectedIds = players.map((p) => p.player_id);
    const pendingTrades = db.prepare(`SELECT DISTINCT t.id FROM trades t JOIN trade_players tp ON tp.trade_id = t.id WHERE t.status = 'pending' AND t.id != ? AND tp.player_id IN (${affectedIds.map(() => "?").join(",")})`)
      .all(tradeId, ...affectedIds);
    for (const pt of pendingTrades) {
      db.prepare("UPDATE trades SET status = 'cancelled', completed_at = ? WHERE id = ?").run(new Date().toISOString(), pt.id);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  res.json({ ok: true });
});

app.post("/api/trades/:id/reject", requireAuth, (req, res) => {
  const tradeId = Number(req.params.id);
  const trade = db.prepare("SELECT * FROM trades WHERE id = ? AND status = 'pending'").get(tradeId);
  if (!trade) return res.status(404).json({ error: "Trade not found or not pending" });
  if (trade.to_manager_id !== req.manager.id) return res.status(403).json({ error: "Only the recipient can reject" });

  db.prepare("UPDATE trades SET status = 'rejected', completed_at = ? WHERE id = ?").run(new Date().toISOString(), tradeId);
  res.json({ ok: true });
});

app.post("/api/trades/:id/cancel", requireAuth, (req, res) => {
  const tradeId = Number(req.params.id);
  const trade = db.prepare("SELECT * FROM trades WHERE id = ? AND status = 'pending'").get(tradeId);
  if (!trade) return res.status(404).json({ error: "Trade not found or not pending" });
  if (trade.from_manager_id !== req.manager.id) return res.status(403).json({ error: "Only the proposer can cancel" });

  db.prepare("UPDATE trades SET status = 'cancelled', completed_at = ? WHERE id = ?").run(new Date().toISOString(), tradeId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Free agent endpoints
// ---------------------------------------------------------------------------

app.get("/api/free-agents/status", requireAuth, (req, res) => {
  const fa = db.prepare("SELECT is_open AS isOpen, current_matchday AS currentMatchday FROM free_agent_state WHERE league_id = 1").get();
  const completed = db.prepare("SELECT matchday_number AS matchdayNumber FROM completed_matchdays WHERE league_id = 1 ORDER BY matchday_number").all();
  res.json({ isOpen: fa?.isOpen === 1, currentMatchday: fa?.currentMatchday || 1, completedMatchdays: completed.map((c) => c.matchdayNumber) });
});

app.get("/api/free-agents/pool", requireAuth, (req, res) => {
  const fa = db.prepare("SELECT is_open FROM free_agent_state WHERE league_id = 1").get();
  if (!fa || !fa.is_open) return res.json({ pool: [] });
  res.json({ pool: generateFreeAgentPool(1) });
});

app.post("/api/free-agents/claim", requireAuth, (req, res) => {
  const { playerId } = req.body || {};
  const teamId = getTeamId(req.manager.id);
  const roster = getRosterPlayers(teamId);
  if (roster.length >= MAX_ROSTER) return res.status(400).json({ error: "Roster is full — release a player first" });

  const pool = generateFreeAgentPool(1);
  const player = pool.find((p) => p.id === playerId);
  if (!player) return res.status(400).json({ error: "Player is not in the free agent pool" });

  const counts = positionCounts(roster);
  if (player.position === "GK" && counts.GK >= MAX_GK) return res.status(400).json({ error: "Cannot add another GK" });

  db.prepare("INSERT INTO team_players (team_id, player_id, acquired_via, is_active) VALUES (?, ?, 'free-agency', 1)").run(teamId, playerId);
  res.json({ ok: true, team: getTeamForManager(req.manager.id) });
});

app.post("/api/free-agents/release", requireAuth, (req, res) => {
  const { playerId } = req.body || {};
  const teamId = getTeamId(req.manager.id);

  const owned = db.prepare("SELECT team_id FROM team_players WHERE team_id = ? AND player_id = ? AND is_active = 1").get(teamId, playerId);
  if (!owned) return res.status(400).json({ error: "Player is not on your roster" });

  db.prepare("UPDATE team_players SET is_active = 0 WHERE team_id = ? AND player_id = ?").run(teamId, playerId);

  // Remove from working lineup if present
  const lineup = db.prepare("SELECT id, captain_player_id FROM lineups WHERE team_id = ? AND round_id = 0").get(teamId);
  if (lineup) {
    db.prepare("DELETE FROM lineup_players WHERE lineup_id = ? AND player_id = ?").run(lineup.id, playerId);
    if (lineup.captain_player_id === playerId) {
      db.prepare("UPDATE lineups SET captain_player_id = NULL WHERE id = ?").run(lineup.id);
    }
  }

  res.json({ ok: true, team: getTeamForManager(req.manager.id) });
});

// ---------------------------------------------------------------------------
// Schedule / rounds endpoints
// ---------------------------------------------------------------------------

app.get("/api/rounds", requireAuth, (req, res) => {
  const rounds = db.prepare("SELECT id, stage FROM rounds ORDER BY id").all();
  const result = rounds.map((r) => {
    const fixtureCount = db.prepare("SELECT COUNT(*) AS count FROM fixtures WHERE round_id = ?").get(r.id).count;
    const firstDate = db.prepare("SELECT MIN(date) AS d FROM fixtures WHERE round_id = ?").get(r.id).d;
    return { ...r, fixtureCount, firstDate };
  });
  res.json({ rounds: result });
});

app.get("/api/rounds/current", requireAuth, (req, res) => {
  const md = getCurrentMatchday();
  res.json(md || { id: null });
});

app.get("/api/rounds/:roundId", requireAuth, (req, res) => {
  res.json(getRoundInfo(Number(req.params.roundId)));
});

app.get("/api/rounds/:roundId/points/:managerId", requireAuth, (req, res) => {
  const roundId = Number(req.params.roundId);
  const managerId = Number(req.params.managerId);
  const teamId = getTeamId(managerId);

  // Check for locked lineup first, fall back to working
  let lineup = db.prepare("SELECT id, formation, captain_player_id AS captainId FROM lineups WHERE team_id = ? AND round_id = ?").get(teamId, roundId);
  if (!lineup) lineup = db.prepare("SELECT id, formation, captain_player_id AS captainId FROM lineups WHERE team_id = ? AND round_id = 0").get(teamId);
  if (!lineup) return res.json({ totalPoints: 0, players: [] });

  const xiRows = db.prepare("SELECT player_id AS playerId FROM lineup_players WHERE lineup_id = ?").all(lineup.id);
  const players = xiRows.map((row) => {
    const pts = db.prepare("SELECT points FROM player_round_points WHERE player_id = ? AND round_id = ?").get(row.playerId, roundId);
    const basePoints = pts ? pts.points : 0;
    const isCaptain = row.playerId === lineup.captainId;
    return { playerId: row.playerId, basePoints, isCaptain, totalPoints: isCaptain ? basePoints * 2 : basePoints };
  });

  const totalPoints = players.reduce((sum, p) => sum + p.totalPoints, 0);
  res.json({ totalPoints, formation: lineup.formation, captainId: lineup.captainId, players });
});

// ---------------------------------------------------------------------------
// Admin / debug endpoints
// ---------------------------------------------------------------------------

app.post("/api/admin/complete-matchday", requireAuth, (req, res) => {
  const { matchday } = req.body || {};
  const md = matchday || 1;
  db.prepare("INSERT OR IGNORE INTO completed_matchdays (league_id, matchday_number, completed_at) VALUES (1, ?, ?)").run(md, new Date().toISOString());
  db.prepare("UPDATE free_agent_state SET current_matchday = ?, is_open = 1, pool_seed = ? WHERE league_id = 1").run(md + 1, Date.now());
  res.json({ ok: true });
});

app.post("/api/admin/refresh-fa-pool", requireAuth, (req, res) => {
  db.prepare("UPDATE free_agent_state SET pool_seed = ? WHERE league_id = 1").run(Date.now());
  res.json({ ok: true, pool: generateFreeAgentPool(1) });
});

app.post("/api/admin/reset-draft", requireAuth, (req, res) => {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM draft_picks WHERE league_id = 1");
    db.exec("DELETE FROM team_players");
    db.exec("DELETE FROM lineup_players");
    db.exec("DELETE FROM lineups");
    db.exec("DELETE FROM trade_players");
    db.exec("DELETE FROM trades WHERE league_id = 1");
    db.exec("DELETE FROM draft_timers WHERE league_id = 1");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  // Restart timer
  db.prepare("INSERT OR REPLACE INTO draft_timers (league_id, current_pick_started_at, timer_duration_ms) VALUES (1, ?, ?)")
    .run(new Date().toISOString(), PICK_TIMER_MS);
  res.json({ ok: true });
});

app.post("/api/admin/refresh-live-data", requireAuth, async (req, res) => {
  const results = { players: "skipped", rounds: "skipped", errors: [] };
  try {
    const playersRes = await fetch("https://play.fifa.com/json/fantasy/players.json");
    if (playersRes.ok) {
      const freshPlayers = await playersRes.json();
      const update = db.prepare(`
        UPDATE players SET total_points = ?, avg_points = ?, form = ?, last_round_points = ?,
          percent_selected = ?, status = ?, match_status = ?
        WHERE id = ?
      `);
      db.exec("BEGIN");
      for (const p of freshPlayers) {
        update.run(p.stats.totalPoints, p.stats.avgPoints, p.stats.form, p.stats.lastRoundPoints,
          p.percentSelected, p.status, p.matchStatus, p.id);
      }
      db.exec("COMMIT");
      results.players = `Updated ${freshPlayers.length} players`;
    }
  } catch (err) { results.errors.push(`Players: ${err.message}`); }

  try {
    const roundsRes = await fetch("https://play.fifa.com/json/fantasy/rounds.json");
    if (roundsRes.ok) {
      const freshRounds = await roundsRes.json();
      const upsertFixture = db.prepare(`
        INSERT OR REPLACE INTO fixtures (id, round_id, stage, date, status, period, venue_name, venue_city,
          home_squad_id, away_squad_id, home_squad_abbr, away_squad_abbr, home_score, away_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.exec("BEGIN");
      let count = 0;
      for (const r of freshRounds) {
        db.prepare("INSERT OR IGNORE INTO rounds (id, stage) VALUES (?, ?)").run(r.id, r.stage || "group");
        for (const f of r.tournaments || []) {
          upsertFixture.run(f.id, r.id, r.stage || "group", f.date, f.status, f.period, f.venueName, f.venueCity,
            f.homeSquadId, f.awaySquadId, f.homeSquadAbbr, f.awaySquadAbbr, f.homeScore, f.awayScore);
          count++;
        }
      }
      db.exec("COMMIT");
      results.rounds = `Updated ${count} fixtures`;
    }
  } catch (err) { results.errors.push(`Rounds: ${err.message}`); }

  res.json(results);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// SPA fallback — serve index.html for non-API routes
if (fs.existsSync(distDir)) {
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () => {
  console.log(`API server listening on http://0.0.0.0:${port}`);
});
