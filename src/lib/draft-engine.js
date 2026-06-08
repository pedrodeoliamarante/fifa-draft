import { seededManagers, formationSlots } from "./fantasy";

const STORAGE_KEY = "fifaDraftState";
const TOTAL_ROUNDS = 15;
const MAX_GK = 2;
const MAX_ROSTER = 15;
const FIFA_PLAYERS_URL = "https://play.fifa.com/json/fantasy/players.json";
const FIFA_ROUNDS_URL = "https://play.fifa.com/json/fantasy/rounds.json";

// --- Roster constraint helpers ---

function positionCounts(roster) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of roster) counts[p.position] = (counts[p.position] || 0) + 1;
  return counts;
}

function canAddPosition(roster, position) {
  const counts = positionCounts(roster);
  if (roster.length >= MAX_ROSTER) return false;
  if (position === "GK" && counts.GK >= MAX_GK) return false;
  return true;
}

// Find the best auto-pick: highest-price available player at a position the manager still needs.
function autoPick(availablePlayers, managerRoster) {
  const counts = positionCounts(managerRoster);
  const needed = [];

  // Priority: positions where manager has fewer than the minimum
  if (counts.GK < 2) needed.push("GK");
  if (counts.DEF < 3) needed.push("DEF");
  if (counts.MID < 3) needed.push("MID");
  if (counts.FWD < 2) needed.push("FWD");

  // If all minimums met, any position that isn't capped
  if (needed.length === 0) {
    if (counts.GK < MAX_GK) needed.push("GK");
    needed.push("DEF", "MID", "FWD");
  }

  const candidates = availablePlayers
    .filter((p) => needed.includes(p.position))
    .sort((a, b) => b.price - a.price);

  return candidates[0] || availablePlayers.sort((a, b) => b.price - a.price)[0] || null;
}

// --- Snake draft order ---

function getPickManager(managers, pickNumber) {
  const roundNumber = Math.ceil(pickNumber / managers.length);
  const indexInRound = (pickNumber - 1) % managers.length;
  const orderedIndex = roundNumber % 2 === 1 ? indexInRound : managers.length - 1 - indexInRound;
  return { manager: managers[orderedIndex], roundNumber };
}

// --- Draft Engine ---

export function createDraftEngine(allPlayers, squads, rounds = []) {
  const squadsById = Object.fromEntries(squads.map((s) => [s.id, s]));

  function enrichPlayerList(playerList) {
    return playerList
      .filter((p) => p.status === "playing")
      .map((p) => {
        const squad = squadsById[p.squadId] || {};
        return {
          ...p,
          name: p.knownName || [p.firstName, p.lastName].filter(Boolean).join(" "),
          team: squad.name || "",
          teamAbbr: squad.abbr || "",
          groupName: squad.group || "",
        };
      });
  }

  // Mutable — gets replaced on live data refresh
  let enrichedPlayers = enrichPlayerList(allPlayers);
  let matchdayRounds = [...rounds];

  const managers = seededManagers.map((m, i) => ({
    id: i + 1,
    displayName: m.label,
    loginName: m.loginName,
    draftPosition: i + 1,
  }));

  const totalPicks = managers.length * TOTAL_ROUNDS;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { picks: [], timerStart: null };
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getDraftedPlayerIds(state) {
    return new Set(state.picks.map((p) => p.playerId));
  }

  function getManagerRoster(state, managerId) {
    return state.picks
      .filter((p) => p.managerId === managerId)
      .map((p) => enrichedPlayers.find((ep) => ep.id === p.playerId))
      .filter(Boolean);
  }

  function getAvailablePlayers(state) {
    const drafted = getDraftedPlayerIds(state);
    return enrichedPlayers.filter((p) => !drafted.has(p.id));
  }

  function getDraftView(state) {
    const nextPickNumber = state.picks.length + 1;
    const isComplete = nextPickNumber > totalPicks;
    const current = isComplete ? null : getPickManager(managers, nextPickNumber);

    return {
      managers,
      picks: state.picks,
      totalRounds: TOTAL_ROUNDS,
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
      timerStart: state.timerStart,
    };
  }

  function makePick(managerId, playerId) {
    const state = loadState();
    const draft = getDraftView(state);

    if (draft.isComplete) throw new Error("Draft is complete");
    if (draft.currentPick.manager.id !== managerId) {
      throw new Error(`It is ${draft.currentPick.manager.displayName}'s turn.`);
    }

    const drafted = getDraftedPlayerIds(state);
    if (drafted.has(playerId)) throw new Error("Player has already been drafted");

    const player = enrichedPlayers.find((p) => p.id === playerId);
    if (!player) throw new Error("Player is not available");

    const roster = getManagerRoster(state, managerId);
    if (roster.length >= MAX_ROSTER) throw new Error("Roster is already full");
    if (!canAddPosition(roster, player.position)) {
      throw new Error(`Cannot add another ${player.position} to your roster`);
    }

    state.picks.push({
      pickNumber: draft.currentPick.pickNumber,
      roundNumber: draft.currentPick.roundNumber,
      managerId,
      playerId,
      playerName: player.name,
      position: player.position,
      teamAbbr: player.teamAbbr,
    });
    state.timerStart = Date.now();
    saveState(state);

    return { draft: getDraftView(state), team: getManagerRoster(state, managerId) };
  }

  function doAutoPick() {
    const state = loadState();
    const draft = getDraftView(state);
    if (draft.isComplete) return null;

    const managerId = draft.currentPick.manager.id;
    const roster = getManagerRoster(state, managerId);
    const available = getAvailablePlayers(state);
    const pick = autoPick(available, roster);
    if (!pick) return null;

    return makePick(managerId, pick.id);
  }

  // --- Public API matching what App.jsx expects ---

  function login(loginName) {
    const manager = managers.find((m) => m.loginName === loginName);
    if (!manager) throw new Error("Invalid login");
    const state = loadState();

    // Start timer if this is a fresh draft
    if (state.picks.length === 0 && !state.timerStart) {
      state.timerStart = Date.now();
      saveState(state);
    }

    return {
      token: `local-${manager.id}`,
      manager,
      league: { id: 1, name: "World Cup Draft", status: "drafting", draftPosition: manager.draftPosition },
      team: { id: manager.id, leagueId: 1, managerId: manager.id, players: getManagerRoster(state, manager.id) },
    };
  }

  function getMe(managerId) {
    const state = loadState();
    const manager = managers.find((m) => m.id === managerId);
    return {
      manager,
      league: { id: 1, name: "World Cup Draft", status: "drafting", draftPosition: manager.draftPosition },
      team: { id: managerId, leagueId: 1, managerId, players: getManagerRoster(state, managerId) },
    };
  }

  function getPlayers() {
    const state = loadState();
    const available = getAvailablePlayers(state);
    return { players: available.sort((a, b) => b.price - a.price || b.percentSelected - a.percentSelected) };
  }

  function getDraft() {
    const state = loadState();
    return getDraftView(state);
  }

  function getStandings() {
    const state = loadState();
    return {
      standings: managers.map((m) => {
        const roster = getManagerRoster(state, m.id);
        const totalPoints = roster.reduce((sum, p) => sum + (p.stats?.totalPoints || 0), 0);
        return { managerId: m.id, displayName: m.displayName, totalPoints, roster };
      }).sort((a, b) => b.totalPoints - a.totalPoints),
    };
  }

  function pick(managerId, playerId) {
    return makePick(managerId, playerId);
  }

  // --- Lineup & Captain ---

  function getLineup(managerId) {
    const state = loadState();
    const key = `lineup_${managerId}`;
    return state[key] || { startingXI: [], captainId: null, formation: "4-3-3" };
  }

  function setLineup(managerId, formation, startingXI, captainId) {
    const state = loadState();
    const roster = getManagerRoster(state, managerId);
    const rosterIds = new Set(roster.map((p) => p.id));

    // Validate all starting XI players are on the roster
    for (const pid of startingXI) {
      if (!rosterIds.has(pid)) throw new Error("Player is not on your roster");
    }
    if (startingXI.length !== 11) throw new Error("Starting XI must have exactly 11 players");

    // Validate formation fits
    const slots = formationSlots[formation];
    if (!slots) throw new Error("Invalid formation");

    const xiPlayers = startingXI.map((pid) => roster.find((p) => p.id === pid));
    const needed = {};
    for (const s of slots) needed[s] = (needed[s] || 0) + 1;
    const have = {};
    for (const p of xiPlayers) have[p.position] = (have[p.position] || 0) + 1;

    for (const pos of Object.keys(needed)) {
      if ((have[pos] || 0) !== needed[pos]) {
        throw new Error(`Formation ${formation} requires ${needed[pos]} ${pos} but you have ${have[pos] || 0}`);
      }
    }

    // Validate captain is in starting XI
    if (captainId && !startingXI.includes(captainId)) {
      throw new Error("Captain must be in your starting XI");
    }

    const key = `lineup_${managerId}`;
    state[key] = { startingXI, captainId, formation };
    saveState(state);
    return state[key];
  }

  function setCaptain(managerId, captainId) {
    const state = loadState();
    const key = `lineup_${managerId}`;
    const lineup = state[key] || { startingXI: [], captainId: null, formation: "4-3-3" };

    if (lineup.startingXI.length > 0 && !lineup.startingXI.includes(captainId)) {
      throw new Error("Captain must be in your starting XI");
    }

    lineup.captainId = captainId;
    state[key] = lineup;
    saveState(state);
    return lineup;
  }

  function toggleStartingXI(managerId, playerId, formation) {
    const state = loadState();
    const key = `lineup_${managerId}`;
    const lineup = state[key] || { startingXI: [], captainId: null, formation };
    const roster = getManagerRoster(state, managerId);
    const player = roster.find((p) => p.id === playerId);
    if (!player) throw new Error("Player is not on your roster");

    const idx = lineup.startingXI.indexOf(playerId);
    if (idx >= 0) {
      // Remove from XI
      lineup.startingXI.splice(idx, 1);
      if (lineup.captainId === playerId) lineup.captainId = null;
    } else {
      // Add to XI — check formation constraints
      if (lineup.startingXI.length >= 11) throw new Error("Starting XI is full (11 players)");

        const slots = formationSlots[formation];
      if (!slots) throw new Error("Invalid formation");

      const xiPlayers = lineup.startingXI.map((pid) => roster.find((p) => p.id === pid)).filter(Boolean);
      const needed = {};
      for (const s of slots) needed[s] = (needed[s] || 0) + 1;
      const have = {};
      for (const p of xiPlayers) have[p.position] = (have[p.position] || 0) + 1;

      const currentCount = have[player.position] || 0;
      const maxCount = needed[player.position] || 0;
      if (currentCount >= maxCount) {
        throw new Error(`Cannot add more ${player.position} players in ${formation}`);
      }

      lineup.startingXI.push(playerId);
    }

    lineup.formation = formation;
    state[key] = lineup;
    saveState(state);
    return lineup;
  }

  // --- Trades ---

  function getTrades() {
    const state = loadState();
    return state.trades || [];
  }

  function proposeTrade(fromManagerId, toManagerId, offeringPlayerIds, requestingPlayerIds) {
    if (fromManagerId === toManagerId) throw new Error("Cannot trade with yourself");
    if (offeringPlayerIds.length === 0 && requestingPlayerIds.length === 0) {
      throw new Error("Trade must include at least one player");
    }

    const state = loadState();
    const fromRoster = getManagerRoster(state, fromManagerId);
    const toRoster = getManagerRoster(state, toManagerId);

    const fromIds = new Set(fromRoster.map((p) => p.id));
    const toIds = new Set(toRoster.map((p) => p.id));

    for (const pid of offeringPlayerIds) {
      if (!fromIds.has(pid)) throw new Error("You don't own one of the offered players");
    }
    for (const pid of requestingPlayerIds) {
      if (!toIds.has(pid)) throw new Error("The other manager doesn't own one of the requested players");
    }

    const trade = {
      id: Date.now(),
      fromManagerId,
      toManagerId,
      offeringPlayerIds,
      requestingPlayerIds,
      status: "pending",
      createdAt: Date.now(),
    };

    if (!state.trades) state.trades = [];
    state.trades.push(trade);
    saveState(state);
    return trade;
  }

  function respondToTrade(tradeId, managerId, accept) {
    const state = loadState();
    const trades = state.trades || [];
    const trade = trades.find((t) => t.id === tradeId);
    if (!trade) throw new Error("Trade not found");
    if (trade.status !== "pending") throw new Error("Trade is no longer pending");
    if (trade.toManagerId !== managerId) throw new Error("Only the receiving manager can respond");

    if (!accept) {
      trade.status = "rejected";
      saveState(state);
      return trade;
    }

    // Validate both sides still own the players
    const fromRoster = getManagerRoster(state, trade.fromManagerId);
    const toRoster = getManagerRoster(state, trade.toManagerId);
    const fromIds = new Set(fromRoster.map((p) => p.id));
    const toIds = new Set(toRoster.map((p) => p.id));

    for (const pid of trade.offeringPlayerIds) {
      if (!fromIds.has(pid)) throw new Error("Proposer no longer owns an offered player");
    }
    for (const pid of trade.requestingPlayerIds) {
      if (!toIds.has(pid)) throw new Error("You no longer own a requested player");
    }

    // Execute the swap — move picks ownership
    for (const p of state.picks) {
      if (trade.offeringPlayerIds.includes(p.playerId) && p.managerId === trade.fromManagerId) {
        p.managerId = trade.toManagerId;
      }
      if (trade.requestingPlayerIds.includes(p.playerId) && p.managerId === trade.toManagerId) {
        p.managerId = trade.fromManagerId;
      }
    }

    trade.status = "accepted";
    trade.completedAt = Date.now();
    saveState(state);
    return trade;
  }

  function cancelTrade(tradeId, managerId) {
    const state = loadState();
    const trades = state.trades || [];
    const trade = trades.find((t) => t.id === tradeId);
    if (!trade) throw new Error("Trade not found");
    if (trade.status !== "pending") throw new Error("Trade is no longer pending");
    if (trade.fromManagerId !== managerId) throw new Error("Only the proposer can cancel");

    trade.status = "cancelled";
    saveState(state);
    return trade;
  }

  // --- Matchday / Schedule ---

  function getRounds() {
    return matchdayRounds;
  }

  function getMatchday(roundId) {
    const round = matchdayRounds.find((r) => r.id === roundId);
    if (!round) return null;
    const fixtures = (round.tournaments || []).sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstKickoff = fixtures.length > 0 ? new Date(fixtures[0].date).getTime() : null;
    return { ...round, fixtures, firstKickoff };
  }

  function getCurrentMatchday() {
    const now = Date.now();
    // Find the round whose first kickoff is soonest in the future, or the most recent active one
    let upcoming = null;
    let active = null;

    for (const round of matchdayRounds) {
      const fixtures = (round.tournaments || []).sort((a, b) => new Date(a.date) - new Date(b.date));
      if (fixtures.length === 0) continue;
      const firstKickoff = new Date(fixtures[0].date).getTime();
      const lastKickoff = new Date(fixtures[fixtures.length - 1].date).getTime();

      if (now < firstKickoff) {
        // Future round — pick the nearest one
        if (!upcoming || firstKickoff < new Date(upcoming.fixtures[0].date).getTime()) {
          upcoming = { ...round, fixtures, firstKickoff };
        }
      } else if (now <= lastKickoff + 3 * 60 * 60 * 1000) {
        // Active round (within ~3h of last fixture start)
        active = { ...round, fixtures, firstKickoff };
      }
    }

    return active || upcoming || null;
  }

  // --- XI Lock ---

  function isRoundLocked(roundId) {
    const md = getMatchday(roundId);
    if (!md || !md.firstKickoff) return false;
    return Date.now() >= md.firstKickoff;
  }

  function getLockTimeLeft(roundId) {
    const md = getMatchday(roundId);
    if (!md || !md.firstKickoff) return null;
    const remaining = md.firstKickoff - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  function lockLineup(managerId, roundId) {
    const state = loadState();
    const key = `lockedLineup_${managerId}_r${roundId}`;
    if (state[key]) return state[key]; // Already locked

    const lineupKey = `lineup_${managerId}`;
    const currentLineup = state[lineupKey] || { startingXI: [], captainId: null, formation: "4-3-3" };
    state[key] = { ...currentLineup, lockedAt: Date.now() };
    saveState(state);
    return state[key];
  }

  function getLockedLineup(managerId, roundId) {
    const state = loadState();
    const key = `lockedLineup_${managerId}_r${roundId}`;
    return state[key] || null;
  }

  function autoLockAllLineups(roundId) {
    if (!isRoundLocked(roundId)) return;
    for (const m of managers) {
      lockLineup(m.id, roundId);
    }
  }

  // --- Points calculation per round ---

  function getRoundPoints(managerId, roundId) {
    const locked = getLockedLineup(managerId, roundId);
    if (!locked) return { startingXI: 0, total: 0, players: [] };

    const state = loadState();
    const roster = getManagerRoster(state, managerId);
    const rosterById = Object.fromEntries(roster.map((p) => [p.id, p]));

    let total = 0;
    const players = locked.startingXI.map((pid) => {
      const player = rosterById[pid];
      if (!player) return null;
      const roundPts = player.stats?.roundPoints?.[roundId - 1] || 0;
      const isCaptain = locked.captainId === pid;
      const pts = isCaptain ? roundPts * 2 : roundPts;
      total += pts;
      return { ...player, roundPoints: roundPts, effectivePoints: pts, isCaptain };
    }).filter(Boolean);

    return { total, players };
  }

  // --- Live data refresh ---

  async function refreshLiveData() {
    const results = { players: false, rounds: false, errors: [] };

    try {
      const res = await fetch(FIFA_PLAYERS_URL);
      if (res.ok) {
        const freshPlayers = await res.json();
        enrichedPlayers = enrichPlayerList(freshPlayers);
        results.players = true;
      } else {
        results.errors.push(`Players fetch failed: ${res.status}`);
      }
    } catch (err) {
      results.errors.push(`Players fetch error: ${err.message}`);
    }

    try {
      const res = await fetch(FIFA_ROUNDS_URL);
      if (res.ok) {
        matchdayRounds = await res.json();
        results.rounds = true;
      } else {
        results.errors.push(`Rounds fetch failed: ${res.status}`);
      }
    } catch (err) {
      results.errors.push(`Rounds fetch error: ${err.message}`);
    }

    return results;
  }

  function resetDraft() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getTimerStart() {
    return loadState().timerStart;
  }

  return {
    login,
    getMe,
    getPlayers,
    getDraft,
    getStandings,
    pick,
    doAutoPick,
    resetDraft,
    getTimerStart,
    getLineup,
    setLineup,
    setCaptain,
    toggleStartingXI,
    getTrades,
    proposeTrade,
    respondToTrade,
    cancelTrade,
    getRounds,
    getMatchday,
    getCurrentMatchday,
    isRoundLocked,
    getLockTimeLeft,
    lockLineup,
    getLockedLineup,
    autoLockAllLineups,
    getRoundPoints,
    refreshLiveData,
    managers,
  };
}
