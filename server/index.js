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

const initialManagers = [
  { displayName: "Pedro", loginName: "pedro", password: "demo" },
  { displayName: "Manager 2", loginName: "manager2", password: "demo" },
  { displayName: "Manager 3", loginName: "manager3", password: "demo" },
  { displayName: "Manager 4", loginName: "manager4", password: "demo" },
];

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(fifaDir, fileName), "utf8"));
}

function setupSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      login_name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
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

    CREATE UNIQUE INDEX IF NOT EXISTS ux_team_players_active_player
    ON team_players(player_id)
    WHERE is_active = 1;
  `);
}

function seedManagersAndLeague() {
  const insertManager = db.prepare(`
    INSERT OR IGNORE INTO managers (display_name, login_name, password_hash)
    VALUES (?, ?, ?)
  `);
  for (const manager of initialManagers) {
    insertManager.run(manager.displayName, manager.loginName, hashPassword(manager.password));
  }

  db.prepare("INSERT OR IGNORE INTO leagues (id, name, status) VALUES (1, ?, ?)").run(
    "World Cup Draft",
    "setup"
  );

  const managers = db.prepare("SELECT id FROM managers ORDER BY id").all();
  const insertLeagueManager = db.prepare(`
    INSERT OR IGNORE INTO league_managers (league_id, manager_id, draft_position)
    VALUES (1, ?, ?)
  `);
  const insertTeam = db.prepare("INSERT OR IGNORE INTO teams (league_id, manager_id) VALUES (1, ?)");
  managers.forEach((manager, index) => {
    insertLeagueManager.run(manager.id, index + 1);
    insertTeam.run(manager.id);
  });
}

function seedFifaData() {
  const existingPlayers = db.prepare("SELECT COUNT(*) AS count FROM players").get().count;
  if (existingPlayers > 0) return;

  const squads = readJson("squads.json");
  const players = readJson("players.json");
  const rounds = readJson("rounds.json");

  const insertSquad = db.prepare(`
    INSERT INTO squads (id, name, abbreviation, group_name, is_eliminated)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertPlayer = db.prepare(`
    INSERT INTO players (
      id, first_name, last_name, known_name, squad_id, position, price, status,
      match_status, percent_selected, total_points, avg_points, form,
      last_round_points, one_to_watch, next_fixture_id, fifa_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFixture = db.prepare(`
    INSERT INTO fixtures (
      id, round_id, stage, date, status, period, venue_name, venue_city,
      home_squad_id, away_squad_id, home_squad_abbr, away_squad_abbr,
      home_score, away_score
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const squad of squads) {
      insertSquad.run(squad.id, squad.name, squad.abbr, squad.group, squad.isEliminated ? 1 : 0);
    }

    for (const player of players) {
      insertPlayer.run(
        player.id,
        player.firstName,
        player.lastName,
        player.knownName,
        player.squadId,
        player.position,
        player.price,
        player.status,
        player.matchStatus,
        player.percentSelected,
        player.stats.totalPoints,
        player.stats.avgPoints,
        player.stats.form,
        player.stats.lastRoundPoints,
        player.oneToWatch ? 1 : 0,
        player.stats.nextFixtureFromScheduledRound,
        player.fifaId
      );
    }

    for (const round of rounds) {
      for (const fixture of round.tournaments || []) {
        insertFixture.run(
          fixture.id,
          round.id,
          round.stage,
          fixture.date,
          fixture.status,
          fixture.period,
          fixture.venueName,
          fixture.venueCity,
          fixture.homeSquadId,
          fixture.awaySquadId,
          fixture.homeSquadAbbr,
          fixture.awaySquadAbbr,
          fixture.homeScore,
          fixture.awayScore
        );
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function playerSelectSql(whereClause = "") {
  return `
    SELECT
      p.id,
      p.first_name AS firstName,
      p.last_name AS lastName,
      p.known_name AS knownName,
      COALESCE(p.known_name, TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))) AS name,
      p.squad_id AS squadId,
      p.position,
      p.price,
      p.status,
      p.match_status AS matchStatus,
      p.percent_selected AS percentSelected,
      p.total_points AS totalPoints,
      p.avg_points AS avgPoints,
      p.form,
      p.last_round_points AS lastRoundPoints,
      p.one_to_watch AS oneToWatch,
      p.next_fixture_id AS nextFixtureId,
      p.fifa_id AS fifaId,
      s.name AS team,
      s.abbreviation AS teamAbbr,
      s.group_name AS groupName,
      f.date AS nextFixtureDate,
      f.venue_name AS nextFixtureVenue,
      f.venue_city AS nextFixtureCity,
      CASE
        WHEN f.id IS NULL THEN NULL
        ELSE f.home_squad_abbr || ' v ' || f.away_squad_abbr
      END AS nextFixture
    FROM players p
    JOIN squads s ON s.id = p.squad_id
    LEFT JOIN fixtures f ON f.id = p.next_fixture_id
    ${whereClause}
  `;
}

function getSessionManager(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  return db
    .prepare(
      `
      SELECT m.id, m.display_name AS displayName, m.login_name AS loginName
      FROM sessions ss
      JOIN managers m ON m.id = ss.manager_id
      WHERE ss.token = ?
    `
    )
    .get(token);
}

function requireAuth(req, res, next) {
  const manager = getSessionManager(req);
  if (!manager) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  req.manager = manager;
  next();
}

function getLeagueForManager(managerId) {
  return db
    .prepare(
      `
      SELECT l.id, l.name, l.status, lm.draft_position AS draftPosition
      FROM leagues l
      JOIN league_managers lm ON lm.league_id = l.id
      WHERE lm.manager_id = ?
      ORDER BY l.id
      LIMIT 1
    `
    )
    .get(managerId);
}

function getTeamForManager(managerId) {
  const team = db
    .prepare("SELECT id, league_id AS leagueId, manager_id AS managerId FROM teams WHERE manager_id = ? LIMIT 1")
    .get(managerId);

  if (!team) return null;

  const players = db.prepare(playerSelectSql("JOIN team_players tp ON tp.player_id = p.id WHERE tp.team_id = ?")).all(team.id);
  return { ...team, players };
}

function getLeagueManagers(leagueId = 1) {
  return db
    .prepare(
      `
      SELECT m.id, m.display_name AS displayName, m.login_name AS loginName, lm.draft_position AS draftPosition
      FROM league_managers lm
      JOIN managers m ON m.id = lm.manager_id
      WHERE lm.league_id = ?
      ORDER BY lm.draft_position
    `
    )
    .all(leagueId);
}

function getDraftManagerForPick(managers, pickNumber) {
  const roundNumber = Math.ceil(pickNumber / managers.length);
  const indexInRound = (pickNumber - 1) % managers.length;
  const orderedIndex = roundNumber % 2 === 1 ? indexInRound : managers.length - 1 - indexInRound;
  return { manager: managers[orderedIndex], roundNumber };
}

function getDraftState(leagueId = 1) {
  const managers = getLeagueManagers(leagueId);
  const totalRounds = 15;
  const totalPicks = managers.length * totalRounds;
  const picks = db
    .prepare(
      `
      SELECT
        dp.id,
        dp.pick_number AS pickNumber,
        dp.round_number AS roundNumber,
        dp.manager_id AS managerId,
        m.display_name AS managerName,
        dp.player_id AS playerId,
        COALESCE(p.known_name, TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))) AS playerName,
        p.position,
        s.abbreviation AS teamAbbr
      FROM draft_picks dp
      JOIN managers m ON m.id = dp.manager_id
      LEFT JOIN players p ON p.id = dp.player_id
      LEFT JOIN squads s ON s.id = p.squad_id
      WHERE dp.league_id = ?
      ORDER BY dp.pick_number
    `
    )
    .all(leagueId);

  const nextPickNumber = picks.length + 1;
  const isComplete = nextPickNumber > totalPicks;
  const current = isComplete ? null : getDraftManagerForPick(managers, nextPickNumber);

  return {
    managers,
    picks,
    totalRounds,
    totalPicks,
    nextPickNumber,
    isComplete,
    currentPick: current
      ? {
          pickNumber: nextPickNumber,
          roundNumber: current.roundNumber,
          manager: current.manager,
        }
      : null,
  };
}

setupSchema();
seedManagersAndLeague();
seedFifaData();

const app = express();
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json());

app.post("/api/login", (req, res) => {
  const { loginName, password } = req.body || {};
  const manager = db
    .prepare(
      `
      SELECT id, display_name AS displayName, login_name AS loginName, password_hash AS passwordHash
      FROM managers
      WHERE login_name = ?
    `
    )
    .get(loginName || "");

  if (!manager || manager.passwordHash !== hashPassword(password || "")) {
    res.status(401).json({ error: "Invalid login" });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, manager_id, created_at) VALUES (?, ?, ?)").run(
    token,
    manager.id,
    new Date().toISOString()
  );

  res.json({
    token,
    manager: { id: manager.id, displayName: manager.displayName, loginName: manager.loginName },
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

app.get("/api/players", requireAuth, (req, res) => {
  const players = db
    .prepare(
      `${playerSelectSql(`
        LEFT JOIN team_players owned ON owned.player_id = p.id AND owned.is_active = 1
        WHERE p.status = 'playing' AND owned.player_id IS NULL
      `)} ORDER BY p.price DESC, p.percent_selected DESC, name ASC`
    )
    .all();
  res.json({ players });
});

app.get("/api/my-team", requireAuth, (req, res) => {
  res.json({ team: getTeamForManager(req.manager.id) });
});

app.get("/api/standings", requireAuth, (req, res) => {
  const standings = db
    .prepare(
      `
      SELECT
        m.id AS managerId,
        m.display_name AS displayName,
        COALESCE(SUM(p.total_points), 0) AS totalPoints
      FROM managers m
      JOIN league_managers lm ON lm.manager_id = m.id
      JOIN teams t ON t.manager_id = m.id AND t.league_id = lm.league_id
      LEFT JOIN team_players tp ON tp.team_id = t.id
      LEFT JOIN players p ON p.id = tp.player_id
      WHERE lm.league_id = 1
      GROUP BY m.id
      ORDER BY totalPoints DESC, m.display_name ASC
    `
    )
    .all();
  res.json({ standings });
});

app.get("/api/draft", requireAuth, (req, res) => {
  res.json(getDraftState(1));
});

app.post("/api/draft/pick", requireAuth, (req, res) => {
  const playerId = Number(req.body?.playerId);
  if (!Number.isInteger(playerId)) {
    res.status(400).json({ error: "Invalid player" });
    return;
  }

  const draft = getDraftState(1);
  if (draft.isComplete) {
    res.status(400).json({ error: "Draft is complete" });
    return;
  }

  if (draft.currentPick.manager.id !== req.manager.id) {
    res.status(403).json({ error: `It is ${draft.currentPick.manager.displayName}'s turn.` });
    return;
  }

  const player = db.prepare("SELECT id, status FROM players WHERE id = ?").get(playerId);
  if (!player || player.status !== "playing") {
    res.status(400).json({ error: "Player is not available" });
    return;
  }

  const alreadyOwned = db
    .prepare("SELECT team_id AS teamId FROM team_players WHERE player_id = ? AND is_active = 1")
    .get(playerId);
  if (alreadyOwned) {
    res.status(409).json({ error: "Player has already been drafted" });
    return;
  }

  const team = db
    .prepare("SELECT id FROM teams WHERE league_id = 1 AND manager_id = ?")
    .get(req.manager.id);
  if (!team) {
    res.status(400).json({ error: "No team found for manager" });
    return;
  }

  const rosterCount = db
    .prepare("SELECT COUNT(*) AS count FROM team_players WHERE team_id = ? AND is_active = 1")
    .get(team.id).count;
  if (rosterCount >= 15) {
    res.status(400).json({ error: "Roster is already full" });
    return;
  }

  db.exec("BEGIN");
  try {
    db.prepare(
      `
      INSERT INTO draft_picks (league_id, pick_number, round_number, manager_id, player_id)
      VALUES (1, ?, ?, ?, ?)
    `
    ).run(draft.currentPick.pickNumber, draft.currentPick.roundNumber, req.manager.id, playerId);

    db.prepare(
      `
      INSERT INTO team_players (team_id, player_id, acquired_via, is_active)
      VALUES (?, ?, 'draft', 1)
    `
    ).run(team.id, playerId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    if (String(error.message).includes("UNIQUE")) {
      res.status(409).json({ error: "Pick could not be saved because that player or pick is already taken." });
      return;
    }
    throw error;
  }

  res.json({
    ok: true,
    draft: getDraftState(1),
    team: getTeamForManager(req.manager.id),
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${port}`);
});
