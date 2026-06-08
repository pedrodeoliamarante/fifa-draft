import React, { useEffect, useMemo, useRef, useState } from "react";
import { setEngine, getEngine, apiRequest } from "./lib/api";
import { createDraftEngine } from "./lib/draft-engine";
import { playerName } from "./lib/fantasy";
import Draft from "./views/Draft";
import LeagueStandings from "./views/LeagueStandings";
import Login from "./views/Login";
import MyTeam from "./views/MyTeam";
import PlayerDb from "./views/PlayerDb";
import Rules from "./views/Rules";
import Trades from "./views/Trades";
import FreeAgents from "./views/FreeAgents";

import Schedule from "./views/Schedule";

import playersJson from "../data/fifa-fantasy/players.json";
import squadsJson from "../data/fifa-fantasy/squads.json";
import roundsJson from "../data/fifa-fantasy/rounds.json";

const menuItems = [
  { id: "my-team", label: "My Team" },
  { id: "league-standings", label: "League Standings" },
  { id: "schedule", label: "Schedule" },
  { id: "draft", label: "Draft" },
  { id: "trades", label: "Trades" },
  { id: "free-agents", label: "Free Agents" },
  { id: "player-db", label: "Player DB" },
  { id: "rules", label: "Rules" },
];

// One-time engine initialization
const engine = createDraftEngine(playersJson, squadsJson, roundsJson);
setEngine(engine);
if (typeof window !== "undefined") window.__engine = engine;

const PICK_TIMER_MS = 60 * 60 * 1000; // 1 hour

function App() {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("draftToken");
    return token ? { token, manager: null, league: null } : null;
  });
  const [data, setData] = useState({ players: [], team: null, standings: [], draft: null });
  const [assets, setAssets] = useState({ flags: {}, players: {} });
  const [loadState, setLoadState] = useState(session ? "loading" : "login");
  const [loginState, setLoginState] = useState({ loginName: "pedro", password: "demo", error: "" });
  const [activeView, setActiveView] = useState("draft");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");
  const [sortBy, setSortBy] = useState("points");
  const [formation, setFormation] = useState("4-3-3");
  const [draftError, setDraftError] = useState("");
  const [pickState, setPickState] = useState("idle");
  const [timeLeft, setTimeLeft] = useState(null);
  const [lineup, setLineup] = useState({ startingXI: [], captainId: null, formation: "4-3-3" });
  const [lineupError, setLineupError] = useState("");
  const [liveStatus, setLiveStatus] = useState(null);
  const timerRef = useRef(null);
  const refreshRef = useRef(null);

  async function api(path, options = {}, token = session?.token) {
    return apiRequest(path, { ...options, token });
  }

  function refreshData(token = session?.token) {
    const managerId = Number(token.replace("local-", ""));
    const me = engine.getMe(managerId);
    const playerDb = engine.getPlayers();
    const standings = engine.getStandings();
    const draft = engine.getDraft();

    setSession((current) => ({ ...current, token, manager: me.manager, league: me.league }));
    setData({
      players: playerDb.players,
      team: me.team,
      standings: standings.standings,
      draft,
    });
    setLineup(engine.getLineup(managerId));
    setLoadState("ready");
  }

  // Load player photo/flag assets
  useEffect(() => {
    fetch("/assets/player-assets.json")
      .then((response) => (response.ok ? response.json() : { flags: {}, players: {} }))
      .then((manifest) => setAssets({ flags: manifest.flags || {}, players: manifest.players || {} }))
      .catch(() => setAssets({ flags: {}, players: {} }));
  }, []);

  // On mount, if we have a token, load data immediately
  useEffect(() => {
    if (!session?.token) return;
    try {
      refreshData(session.token);
    } catch {
      localStorage.removeItem("draftToken");
      setSession(null);
      setLoadState("login");
    }
  }, [session?.token]);

  // Draft timer — counts down from 1 hour, auto-picks on expiry
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const draft = data.draft;
    if (!draft || draft.isComplete) {
      setTimeLeft(null);
      return;
    }

    const timerStart = draft.timerStart || Date.now();

    function tick() {
      const elapsed = Date.now() - timerStart;
      const remaining = PICK_TIMER_MS - elapsed;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        // Auto-pick
        engine.doAutoPick();
        if (session?.token) refreshData(session.token);
      } else {
        setTimeLeft(remaining);
      }
    }

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [data.draft?.currentPick?.pickNumber, data.draft?.isComplete]);

  // Live data refresh — every 5 minutes, auto-lock lineups on kickoff
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current);
    if (loadState !== "ready") return;

    async function doRefresh() {
      const result = await engine.refreshLiveData();
      setLiveStatus(result);

      // Auto-lock lineups if current matchday has kicked off
      const md = engine.getCurrentMatchday();
      if (md && engine.isRoundLocked(md.id)) {
        engine.autoLockAllLineups(md.id);
      }

      if (session?.token) refreshData(session.token);
    }

    refreshRef.current = setInterval(doRefresh, 5 * 60 * 1000);
    return () => clearInterval(refreshRef.current);
  }, [loadState]);

  const availablePlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return data.players
      .filter((player) => position === "ALL" || player.position === position)
      .filter((player) => {
        if (!query) return true;
        return `${playerName(player)} ${player.team || ""} ${player.teamAbbr || ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (sortBy === "name") return playerName(a).localeCompare(playerName(b));
        if (sortBy === "price") return b.price - a.price;
        return (b.stats?.totalPoints || 0) - (a.stats?.totalPoints || 0);
      });
  }, [data.players, position, search, sortBy]);

  function updateLoginState(next) {
    setLoginState((current) => ({ ...current, ...next }));
  }

  async function loginWith(loginName) {
    setLoginState((current) => ({ ...current, error: "" }));

    try {
      const body = engine.login(loginName);
      localStorage.setItem("draftToken", body.token);
      setSession({ token: body.token, manager: body.manager, league: body.league });
      setData((current) => ({ ...current, team: body.team }));
      setLoadState("loading");
    } catch (error) {
      setLoginState((current) => ({ ...current, error: error.message || "Login failed" }));
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    await loginWith(loginState.loginName);
  }

  function handleLogout() {
    localStorage.removeItem("draftToken");
    setSession(null);
    setData({ players: [], team: null, standings: [], draft: null });
    setLoadState("login");
  }

  function handleDraftPick(playerId) {
    setDraftError("");
    setPickState("picking");

    try {
      const result = engine.pick(session.manager.id, playerId);
      const playerDb = engine.getPlayers();
      const standings = engine.getStandings();
      setData((current) => ({
        ...current,
        players: playerDb.players,
        standings: standings.standings,
        draft: result.draft,
        team: { ...current.team, players: result.team },
      }));
    } catch (error) {
      setDraftError(error.message || "Could not make pick");
    } finally {
      setPickState("idle");
    }
  }

  function handleAutoDraft() {
    for (let i = 0; i < 90; i++) {
      if (!engine.doAutoPick()) break;
    }
    if (session?.token) refreshData(session.token);
  }

  function handleResetDraft() {
    engine.resetDraft();
    if (session?.token) refreshData(session.token);
  }

  function handleAutoDraft() {
    for (let i = 0; i < 90; i++) {
      if (!engine.doAutoPick()) break;
    }
    if (session?.token) refreshData(session.token);
  }

  function handleToggleXI(playerId) {
    setLineupError("");
    try {
      const updated = engine.toggleStartingXI(session.manager.id, playerId, formation);
      setLineup(updated);
    } catch (error) {
      setLineupError(error.message);
    }
  }

  function handleSetCaptain(playerId) {
    setLineupError("");
    try {
      const updated = engine.setCaptain(session.manager.id, playerId);
      setLineup(updated);
    } catch (error) {
      setLineupError(error.message);
    }
  }

  if (loadState === "login") {
    return (
      <Login
        loginState={loginState}
        onLoginChange={updateLoginState}
        onSubmit={handleLogin}
        onQuickLogin={(loginName) => loginWith(loginName)}
      />
    );
  }

  if (loadState === "loading") {
    return (
      <main className="shell">
        <section className="panel loading-panel">
          <h1>Loading FIFA Draft</h1>
          <p>Reading manager, team, league, and player data.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">World Cup Fantasy Draft</p>
          <h1>{menuItems.find((item) => item.id === activeView)?.label}</h1>
        </div>
        <div className="manager-bar">
          <span>{session?.manager?.displayName}</span>
          <button onClick={handleLogout} type="button">
            Log Out
          </button>
        </div>
      </header>

      <nav className="main-menu" aria-label="Main menu">
        {menuItems.map((item) => (
          <button
            className={activeView === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setActiveView(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      {activeView === "my-team" && (
        <>
          {lineupError && <p className="draft-error">{lineupError}</p>}
          <MyTeam
            team={data.team}
            formation={formation}
            assets={assets}
            lineup={lineup}
            currentMatchday={engine.getCurrentMatchday()}
            isLocked={(() => { const md = engine.getCurrentMatchday(); return md ? engine.isRoundLocked(md.id) : false; })()}
            lockTimeLeft={(() => { const md = engine.getCurrentMatchday(); return md ? engine.getLockTimeLeft(md.id) : null; })()}
            onFormationChange={setFormation}
            onToggleXI={handleToggleXI}
            onSetCaptain={handleSetCaptain}
            onRelease={(playerId) => {
              engine.releasePlayer(session.manager.id, playerId);
              refreshData(session.token);
            }}
          />
        </>
      )}

      {activeView === "league-standings" && (
        <LeagueStandings
          standings={data.standings}
          assets={assets}
          engine={engine}
          currentMatchday={engine.getCurrentMatchday()}
        />
      )}

      {activeView === "schedule" && (
        <Schedule
          engine={engine}
          session={session}
          assets={assets}
          onRefresh={async () => {
            const result = await engine.refreshLiveData();
            setLiveStatus(result);
            const md = engine.getCurrentMatchday();
            if (md && engine.isRoundLocked(md.id)) {
              engine.autoLockAllLineups(md.id);
            }
            if (session?.token) refreshData(session.token);
            return result;
          }}
          liveStatus={liveStatus}
        />
      )}

      {activeView === "draft" && (
        <Draft
          draft={data.draft}
          players={availablePlayers}
          assets={assets}
          session={session}
          search={search}
          position={position}
          sortBy={sortBy}
          draftError={draftError}
          pickState={pickState}
          timeLeft={timeLeft}
          draftedSquads={session?.manager?.id ? engine.getMyDraftedSquads(session.manager.id) : []}
          onSearchChange={setSearch}
          onPositionChange={setPosition}
          onSortChange={setSortBy}
          onPick={handleDraftPick}
          onResetDraft={handleResetDraft}
          onAutoDraft={handleAutoDraft}
        />
      )}

      {activeView === "player-db" && (
        <PlayerDb
          players={availablePlayers}
          assets={assets}
          search={search}
          position={position}
          sortBy={sortBy}
          onSearchChange={setSearch}
          onPositionChange={setPosition}
          onSortChange={setSortBy}
        />
      )}

      {activeView === "trades" && (
        <Trades
          session={session}
          trades={engine.getTrades()}
          managers={engine.managers}
          rosters={Object.fromEntries(engine.managers.map((m) => [m.id, engine.getMe(m.id).team.players]))}
          onPropose={(toId, offering, requesting) => {
            engine.proposeTrade(session.manager.id, toId, offering, requesting);
            refreshData(session.token);
          }}
          onAccept={(tradeId) => {
            engine.respondToTrade(tradeId, session.manager.id, true);
            refreshData(session.token);
          }}
          onReject={(tradeId) => {
            engine.respondToTrade(tradeId, session.manager.id, false);
            refreshData(session.token);
          }}
          onCancel={(tradeId) => {
            engine.cancelTrade(tradeId, session.manager.id);
            refreshData(session.token);
          }}
        />
      )}

      {activeView === "free-agents" && (
        <FreeAgents
          session={session}
          pool={engine.isFreeAgencyOpen() ? engine.getFreeAgentPool() : []}
          myRoster={engine.getMe(session.manager.id).team.players}
          isOpen={engine.isFreeAgencyOpen()}
          matchday={engine.getFreeAgencyMatchday()}
          onClaim={(playerId) => {
            engine.claimFreeAgent(session.manager.id, playerId);
            refreshData(session.token);
          }}
          onRelease={(playerId) => {
            engine.releasePlayer(session.manager.id, playerId);
            refreshData(session.token);
          }}
          onRefresh={() => {
            engine.refreshFreeAgentPool();
            refreshData(session.token);
          }}
          onCompleteMatchday={(md) => {
            engine.completeMatchdayForFA(md);
            refreshData(session.token);
          }}
        />
      )}

      {activeView === "rules" && <Rules />}
    </main>
  );
}

export default App;
