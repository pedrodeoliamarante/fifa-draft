import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "./lib/api";
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

const menuItems = [
  { id: "rules", label: "Rules" },
  { id: "draft", label: "Draft" },
  { id: "my-team", label: "My Team" },
  { id: "trades", label: "Trades" },
  { id: "free-agents", label: "Free Agents" },
  { id: "league-standings", label: "League Standings" },
  { id: "schedule", label: "Schedule" },
  { id: "player-db", label: "Player DB" },
];

const isDebug = import.meta.env.VITE_MODE !== "prod";
const PICK_TIMER_MS = 60 * 60 * 1000;

function App() {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("draftToken");
    return token ? { token, manager: null, league: null } : null;
  });
  const [data, setData] = useState({ players: [], team: null, standings: [], draft: null });
  const [assets, setAssets] = useState({ flags: {}, players: {} });
  const [loadState, setLoadState] = useState(session ? "loading" : "login");
  const [loginState, setLoginState] = useState({ loginName: isDebug ? "pedro" : "", password: isDebug ? "demo" : "", error: "" });
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
  // Schedule/standings data fetched from API
  const [rounds, setRounds] = useState([]);
  const [currentMatchday, setCurrentMatchday] = useState(null);
  const [trades, setTrades] = useState([]);
  const [managers, setManagers] = useState([]);
  const [rosters, setRosters] = useState({});
  const [faStatus, setFaStatus] = useState({ isOpen: false, currentMatchday: 1, completedMatchdays: [] });
  const [faPool, setFaPool] = useState([]);
  const [leagueSettings, setLeagueSettings] = useState({ tradesOpen: false, freeAgencyOpen: false });
  const timerRef = useRef(null);
  const pollRef = useRef(null);

  function api(path, options = {}, token = session?.token) {
    return apiRequest(path, { ...options, token });
  }

  async function refreshData(token = session?.token) {
    try {
      const [me, playerDb, standings, draft, lineupData, roundsData, currentMd, settings] = await Promise.all([
        api("/api/me", {}, token),
        api("/api/players", {}, token),
        api("/api/standings", {}, token),
        api("/api/draft", {}, token),
        api("/api/lineup", {}, token),
        api("/api/rounds", {}, token),
        api("/api/rounds/current", {}, token),
        api("/api/league/settings", {}, token),
      ]);

      setSession((current) => ({ ...current, token, manager: me.manager, league: me.league }));
      setData({ players: playerDb.players, team: me.team, standings: standings.standings, draft });
      setLineup(lineupData);
      setRounds(roundsData.rounds || []);
      setCurrentMatchday(currentMd?.id ? currentMd : null);
      setManagers(draft.managers || []);
      setLeagueSettings(settings);
      setLoadState("ready");
    } catch (error) {
      localStorage.removeItem("draftToken");
      setSession(null);
      setLoginState((current) => ({ ...current, error: error.message || "Session expired." }));
      setLoadState("login");
    }
  }

  // Load player photo/flag assets
  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ? "" : "";
    fetch(`${base}/assets/player-assets.json`)
      .then((r) => (r.ok ? r.json() : { flags: {}, players: {} }))
      .then((m) => setAssets({ flags: m.flags || {}, players: m.players || {} }))
      .catch(() => setAssets({ flags: {}, players: {} }));
  }, []);

  // On mount, if we have a token, load data
  useEffect(() => {
    if (!session?.token) return;
    refreshData(session.token);
  }, [session?.token]);

  // Draft timer — client-side countdown, server handles auto-pick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const draft = data.draft;
    if (!draft || draft.isComplete || draft.draftStatus !== "active") {
      setTimeLeft(null);
      return;
    }

    const timerStart = draft.timerStart || Date.now();

    function tick() {
      const elapsed = Date.now() - timerStart;
      const remaining = PICK_TIMER_MS - elapsed;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setTimeLeft(0);
        // Server auto-picks — just re-fetch draft state after a moment
        setTimeout(() => {
          if (session?.token) refreshData(session.token);
        }, 2000);
      } else {
        setTimeLeft(remaining);
      }
    }

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [data.draft?.currentPick?.pickNumber, data.draft?.isComplete]);

  // Poll for draft updates every 10 seconds (to see other players' picks)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (loadState !== "ready") return;

    pollRef.current = setInterval(() => {
      if (session?.token) {
        api("/api/draft").then((draft) => {
          setData((current) => {
            if (draft.nextPickNumber !== current.draft?.nextPickNumber) {
              // Draft state changed — do a full refresh
              refreshData(session.token);
            }
            return { ...current, draft };
          });
        }).catch(() => {});
      }
    }, 10000);

    return () => clearInterval(pollRef.current);
  }, [loadState, session?.token]);

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
        return (b.totalPoints || 0) - (a.totalPoints || 0);
      });
  }, [data.players, position, search, sortBy]);

  function updateLoginState(next) {
    setLoginState((current) => ({ ...current, ...next }));
  }

  async function loginWith(loginName, password) {
    setLoginState((current) => ({ ...current, error: "" }));
    try {
      const body = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({ loginName, password: password || "demo" }),
      });
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
    await loginWith(loginState.loginName, loginState.password);
  }

  async function handleLogout() {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("draftToken");
    setSession(null);
    setData({ players: [], team: null, standings: [], draft: null });
    setLoadState("login");
  }

  async function handleDraftPick(playerId) {
    setDraftError("");
    setPickState("picking");
    try {
      const result = await api("/api/draft/pick", { method: "POST", body: JSON.stringify({ playerId }) });
      const [playerDb, standings] = await Promise.all([api("/api/players"), api("/api/standings")]);
      setData((current) => ({
        ...current,
        players: playerDb.players,
        standings: standings.standings,
        draft: result.draft,
        team: result.team,
      }));
    } catch (error) {
      setDraftError(error.message || "Could not make pick");
    } finally {
      setPickState("idle");
    }
  }

  async function handleResetDraft() {
    await api("/api/admin/reset-draft", { method: "POST" });
    await refreshData(session.token);
  }

  async function handleToggleXI(playerId) {
    setLineupError("");
    try {
      const updated = await api("/api/lineup/toggle", { method: "POST", body: JSON.stringify({ playerId }) });
      setLineup(updated);
    } catch (error) {
      setLineupError(error.message);
    }
  }

  async function handleSetCaptain(playerId) {
    setLineupError("");
    try {
      const updated = await api("/api/lineup/captain", { method: "POST", body: JSON.stringify({ playerId }) });
      setLineup(updated);
    } catch (error) {
      setLineupError(error.message);
    }
  }

  // Lazy-load trades data when trades tab is opened
  async function loadTrades() {
    try {
      const [tradesData, ...rosterResults] = await Promise.all([
        api("/api/trades"),
        ...managers.map((m) => api(`/api/teams/${m.id}`)),
      ]);
      setTrades(tradesData.trades || []);
      const rMap = {};
      managers.forEach((m, i) => { rMap[m.id] = rosterResults[i]?.team?.players || []; });
      setRosters(rMap);
    } catch {}
  }

  // Lazy-load FA data when free agents tab is opened
  async function loadFreeAgents() {
    try {
      const [status, pool] = await Promise.all([
        api("/api/free-agents/status"),
        api("/api/free-agents/pool"),
      ]);
      setFaStatus(status);
      setFaPool(pool.pool || []);
    } catch {}
  }

  if (loadState === "login") {
    return (
      <Login
        loginState={loginState}
        onLoginChange={updateLoginState}
        onSubmit={handleLogin}
        onQuickLogin={isDebug ? (loginName) => loginWith(loginName, "demo") : null}
      />
    );
  }

  if (loadState === "loading") {
    return (
      <main className="shell">
        <section className="panel loading-panel">
          <h1>Loading FIFA Draft</h1>
          <p>Connecting to server...</p>
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
          <span>{session?.manager?.logo && <img className="team-logo" src={session.manager.logo} alt="" />}{session?.manager?.displayName}</span>
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
            onClick={() => {
              setActiveView(item.id);
              if (item.id === "trades") loadTrades();
              if (item.id === "free-agents") loadFreeAgents();
            }}
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
            currentMatchday={currentMatchday}
            isLocked={false}
            lockTimeLeft={null}
            onFormationChange={setFormation}
            onToggleXI={handleToggleXI}
            onSetCaptain={handleSetCaptain}
            onRelease={async (playerId) => {
              await api("/api/free-agents/release", { method: "POST", body: JSON.stringify({ playerId }) });
              await refreshData(session.token);
            }}
          />
        </>
      )}

      {activeView === "league-standings" && (
        <LeagueStandings
          standings={data.standings}
          assets={assets}
          api={api}
          currentMatchday={currentMatchday}
        />
      )}

      {activeView === "schedule" && (
        <Schedule
          api={api}
          session={session}
          assets={assets}
          rounds={rounds}
          currentMatchday={currentMatchday}
          managers={managers}
          onRefresh={async () => {
            const result = await api("/api/admin/refresh-live-data", { method: "POST" });
            setLiveStatus(result);
            await refreshData(session.token);
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
          draftedSquads={data.draft?.managerSquads?.[session?.manager?.id] || []}
          onSearchChange={setSearch}
          onPositionChange={setPosition}
          onSortChange={setSortBy}
          onPick={handleDraftPick}
          onResetDraft={session?.manager?.isAdmin ? handleResetDraft : null}
          onStartDraft={session?.manager?.isAdmin ? async () => {
            await api("/api/admin/draft/start", { method: "POST" });
            await refreshData(session.token);
          } : null}
          onPauseDraft={session?.manager?.isAdmin ? async () => {
            await api("/api/admin/draft/pause", { method: "POST" });
            await refreshData(session.token);
          } : null}
          onResumeDraft={session?.manager?.isAdmin ? async () => {
            await api("/api/admin/draft/resume", { method: "POST" });
            await refreshData(session.token);
          } : null}
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
        <>
          {!leagueSettings.tradesOpen && (
            <section className="panel">
              <div className="panel-header"><div><h2>Trades</h2><p>Trades are currently locked</p></div>
                {session?.manager?.isAdmin && (
                  <button className="btn-small btn-start" onClick={async () => {
                    const r = await api("/api/admin/trades/toggle", { method: "POST" });
                    setLeagueSettings((s) => ({ ...s, tradesOpen: r.tradesOpen }));
                  }} type="button">Open Trades</button>
                )}
              </div>
            </section>
          )}
          {leagueSettings.tradesOpen && (
            <>
              {session?.manager?.isAdmin && (
                <div style={{ marginBottom: 12 }}>
                  <button className="btn-small btn-danger" onClick={async () => {
                    const r = await api("/api/admin/trades/toggle", { method: "POST" });
                    setLeagueSettings((s) => ({ ...s, tradesOpen: r.tradesOpen }));
                  }} type="button">Close Trades</button>
                </div>
              )}
              <Trades
                session={session}
                trades={trades}
                managers={managers}
                rosters={rosters}
                onPropose={async (toId, offering, requesting) => {
                  await api("/api/trades", { method: "POST", body: JSON.stringify({ toManagerId: toId, offeringPlayerIds: offering, requestingPlayerIds: requesting }) });
                  await loadTrades();
                }}
                onAccept={async (tradeId) => {
                  await api(`/api/trades/${tradeId}/accept`, { method: "POST" });
                  await loadTrades();
                  await refreshData(session.token);
                }}
                onReject={async (tradeId) => {
                  await api(`/api/trades/${tradeId}/reject`, { method: "POST" });
                  await loadTrades();
                }}
                onCancel={async (tradeId) => {
                  await api(`/api/trades/${tradeId}/cancel`, { method: "POST" });
                  await loadTrades();
                }}
              />
            </>
          )}
        </>
      )}

      {activeView === "free-agents" && (
        <>
          {!leagueSettings.freeAgencyOpen && (
            <section className="panel">
              <div className="panel-header"><div><h2>Free Agents</h2><p>Free agency is currently locked</p></div>
                {session?.manager?.isAdmin && (
                  <button className="btn-small btn-start" onClick={async () => {
                    const r = await api("/api/admin/free-agency/toggle", { method: "POST" });
                    setLeagueSettings((s) => ({ ...s, freeAgencyOpen: r.freeAgencyOpen }));
                  }} type="button">Open Free Agency</button>
                )}
              </div>
            </section>
          )}
          {leagueSettings.freeAgencyOpen && (
            <>
              {session?.manager?.isAdmin && (
                <div style={{ marginBottom: 12 }}>
                  <button className="btn-small btn-danger" onClick={async () => {
                    const r = await api("/api/admin/free-agency/toggle", { method: "POST" });
                    setLeagueSettings((s) => ({ ...s, freeAgencyOpen: r.freeAgencyOpen }));
                  }} type="button">Close Free Agency</button>
                </div>
              )}
              <FreeAgents
                session={session}
                pool={faPool}
                myRoster={data.team?.players || []}
                assets={assets}
                isOpen={true}
                matchday={faStatus}
                onClaim={async (playerId) => {
                  await api("/api/free-agents/claim", { method: "POST", body: JSON.stringify({ playerId }) });
                  await loadFreeAgents();
                  await refreshData(session.token);
                }}
                onRelease={async (playerId) => {
                  await api("/api/free-agents/release", { method: "POST", body: JSON.stringify({ playerId }) });
                  await loadFreeAgents();
                  await refreshData(session.token);
                }}
                onRefresh={session?.manager?.isAdmin ? async () => {
                  await api("/api/admin/refresh-fa-pool", { method: "POST" });
                  await loadFreeAgents();
                } : null}
                onCompleteMatchday={session?.manager?.isAdmin ? async (md) => {
                  await api("/api/admin/complete-matchday", { method: "POST", body: JSON.stringify({ matchday: md }) });
                  await loadFreeAgents();
                } : null}
              />
            </>
          )}
        </>
      )}

      {activeView === "rules" && <Rules />}
    </main>
  );
}

export default App;
