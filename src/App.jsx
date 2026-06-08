import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "./lib/api";
import { playerName } from "./lib/fantasy";
import Draft from "./views/Draft";
import LeagueStandings from "./views/LeagueStandings";
import Login from "./views/Login";
import MyTeam from "./views/MyTeam";
import PlayerDb from "./views/PlayerDb";
import Rules from "./views/Rules";

const menuItems = [
  { id: "my-team", label: "My Team" },
  { id: "league-standings", label: "League Standings" },
  { id: "draft", label: "Draft" },
  { id: "player-db", label: "Player DB" },
  { id: "rules", label: "Rules" },
];

function App() {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem("draftToken");
    return token ? { token, manager: null, league: null } : null;
  });
  const [data, setData] = useState({ players: [], team: null, standings: [], draft: null });
  const [loadState, setLoadState] = useState(session ? "loading" : "login");
  const [loginState, setLoginState] = useState({ loginName: "pedro", password: "demo", error: "" });
  const [activeView, setActiveView] = useState("my-team");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");
  const [sortBy, setSortBy] = useState("price");
  const [formation, setFormation] = useState("4-3-3");
  const [draftError, setDraftError] = useState("");
  const [pickState, setPickState] = useState("idle");

  async function api(path, options = {}, token = session?.token) {
    return apiRequest(path, { ...options, token });
  }

  async function loadAppData(token = session?.token) {
    const [me, playerDb, standings, draft] = await Promise.all([
      api("/api/me", {}, token),
      api("/api/players", {}, token),
      api("/api/standings", {}, token),
      api("/api/draft", {}, token),
    ]);

    setSession((current) => ({ ...current, token, manager: me.manager, league: me.league }));
    setData({
      players: playerDb.players,
      team: me.team,
      standings: standings.standings,
      draft,
    });
    setLoadState("ready");
  }

  useEffect(() => {
    if (!session?.token) return;

    let isMounted = true;

    async function loadData() {
      try {
        await loadAppData(session.token);
      } catch (error) {
        if (isMounted) {
          localStorage.removeItem("draftToken");
          setSession(null);
          setLoginState((current) => ({ ...current, error: error.message || "Session expired." }));
          setLoadState("login");
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [session?.token]);

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
        if (sortBy === "selected") return b.percentSelected - a.percentSelected;
        return b.price - a.price;
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
        body: JSON.stringify({ loginName, password }),
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
    if (session?.token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      }).catch(() => {});
    }

    localStorage.removeItem("draftToken");
    setSession(null);
    setData({ players: [], team: null, standings: [], draft: null });
    setLoadState("login");
  }

  async function handleDraftPick(playerId) {
    setDraftError("");
    setPickState("picking");

    try {
      const result = await api("/api/draft/pick", {
        method: "POST",
        body: JSON.stringify({ playerId }),
      });
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

  if (loadState === "login") {
    return (
      <Login
        loginState={loginState}
        onLoginChange={updateLoginState}
        onSubmit={handleLogin}
        onQuickLogin={(loginName) => loginWith(loginName, "demo")}
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
        <MyTeam team={data.team} formation={formation} onFormationChange={setFormation} />
      )}

      {activeView === "league-standings" && <LeagueStandings standings={data.standings} />}

      {activeView === "draft" && (
        <Draft
          draft={data.draft}
          players={availablePlayers}
          session={session}
          search={search}
          position={position}
          sortBy={sortBy}
          draftError={draftError}
          pickState={pickState}
          onSearchChange={setSearch}
          onPositionChange={setPosition}
          onSortChange={setSortBy}
          onPick={handleDraftPick}
        />
      )}

      {activeView === "player-db" && (
        <PlayerDb
          players={availablePlayers}
          search={search}
          position={position}
          sortBy={sortBy}
          onSearchChange={setSearch}
          onPositionChange={setPosition}
          onSortChange={setSortBy}
        />
      )}

      {activeView === "rules" && <Rules />}
    </main>
  );
}

export default App;
