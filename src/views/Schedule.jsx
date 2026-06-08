import React, { useEffect, useState, useRef } from "react";

function Schedule({ engine, session, assets, onRefresh, liveStatus }) {
  const [lockTimers, setLockTimers] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
  const timerRef = useRef(null);

  const rounds = engine.getRounds().filter((r) => r.tournaments && r.tournaments.length > 0);
  const currentMatchday = engine.getCurrentMatchday();

  // Auto-select current matchday
  useEffect(() => {
    if (selectedRound === null && currentMatchday) {
      setSelectedRound(currentMatchday.id);
    } else if (selectedRound === null && rounds.length > 0) {
      setSelectedRound(rounds[0].id);
    }
  }, [currentMatchday, rounds.length]);

  // Update lock countdown timers every second
  useEffect(() => {
    function tick() {
      const timers = {};
      for (const round of rounds) {
        const remaining = engine.getLockTimeLeft(round.id);
        if (remaining !== null) {
          timers[round.id] = remaining;
        }
      }
      setLockTimers(timers);
    }

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [rounds.length]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  const activeRound = selectedRound ? engine.getMatchday(selectedRound) : null;
  const locked = selectedRound ? engine.isRoundLocked(selectedRound) : false;
  const lockTimeLeft = selectedRound ? lockTimers[selectedRound] : null;

  return (
    <section className="schedule-view">
      {/* Round selector */}
      <div className="panel schedule-panel">
        <div className="panel-header">
          <div>
            <h2>Match Schedule</h2>
            <p>Select a matchday to view fixtures</p>
          </div>
          <button
            className="btn-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            type="button"
          >
            {refreshing ? "Refreshing..." : "Refresh Live Data"}
          </button>
        </div>

        {liveStatus && liveStatus.errors.length > 0 && (
          <div className="refresh-errors">
            {liveStatus.errors.map((err, i) => (
              <p key={i}>{err}</p>
            ))}
          </div>
        )}

        {/* Round tabs */}
        <div className="round-tabs">
          {rounds.map((round) => {
            const isCurrent = currentMatchday && currentMatchday.id === round.id;
            const isLocked = engine.isRoundLocked(round.id);
            return (
              <button
                key={round.id}
                className={`round-tab${selectedRound === round.id ? " round-tab-active" : ""}${isCurrent ? " round-tab-current" : ""}`}
                onClick={() => setSelectedRound(round.id)}
                type="button"
              >
                <span>MD {round.id}</span>
                {isLocked && <span className="lock-badge">Locked</span>}
              </button>
            );
          })}
        </div>

        {/* Lock countdown */}
        {activeRound && (
          <div className={`lock-banner${locked ? " lock-banner-locked" : ""}`}>
            {locked ? (
              <>
                <strong>XI Locked</strong>
                <span>Matchday {activeRound.id} lineups are locked in</span>
              </>
            ) : lockTimeLeft !== null && lockTimeLeft > 0 ? (
              <>
                <strong>XI Lock In</strong>
                <span className="lock-countdown">{formatCountdown(lockTimeLeft)}</span>
                <span className="lock-kickoff">
                  First kickoff: {new Date(activeRound.firstKickoff).toLocaleString()}
                </span>
              </>
            ) : (
              <>
                <strong>Matchday {activeRound.id}</strong>
                <span>Schedule TBD</span>
              </>
            )}
          </div>
        )}

        {/* Fixtures list */}
        {activeRound && activeRound.fixtures.length > 0 && (
          <div className="fixtures-list">
            {activeRound.fixtures.map((fixture) => {
              const date = new Date(fixture.date);
              const hasScore = fixture.homeScore !== null;
              return (
                <div className="fixture-row" key={fixture.id}>
                  <span className="fixture-time">
                    {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    {" "}
                    {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="fixture-teams">
                    <strong><SquadFlag squadId={fixture.homeSquadId} assets={assets} /> {fixture.homeSquadName || fixture.homeSquadAbbr}</strong>
                    <span className="fixture-score">
                      {hasScore ? `${fixture.homeScore} - ${fixture.awayScore}` : "vs"}
                    </span>
                    <strong><SquadFlag squadId={fixture.awaySquadId} assets={assets} /> {fixture.awaySquadName || fixture.awaySquadAbbr}</strong>
                  </div>
                  <span className="fixture-venue">{fixture.venueCity}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manager lineups status for this round */}
      {activeRound && (
        <div className="panel schedule-lineups-panel">
          <div className="panel-header">
            <div>
              <h2>Lineup Status</h2>
              <p>Matchday {activeRound.id}</p>
            </div>
          </div>
          <div className="lineup-status-list">
            {engine.managers.map((m) => {
              const lockedLineup = engine.getLockedLineup(m.id, activeRound.id);
              const currentLineup = engine.getLineup(m.id);
              const xiCount = locked
                ? (lockedLineup?.startingXI?.length || 0)
                : (currentLineup?.startingXI?.length || 0);
              const isReady = xiCount === 11;
              const isMe = session?.manager?.id === m.id;

              return (
                <div className={`lineup-status-row${isMe ? " lineup-status-me" : ""}`} key={m.id}>
                  <strong>{m.displayName}</strong>
                  <span className={`lineup-status-badge${isReady ? " badge-ready" : " badge-pending"}`}>
                    {locked
                      ? (lockedLineup ? `Locked (${xiCount}/11)` : "Not set")
                      : (isReady ? "Ready" : `${xiCount}/11`)
                    }
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function SquadFlag({ squadId, assets }) {
  const flag = assets?.flags?.[squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default Schedule;
