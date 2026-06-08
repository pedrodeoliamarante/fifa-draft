import React, { useEffect, useState, useRef } from "react";

function Schedule({ api, session, assets, rounds, currentMatchday, managers, onRefresh, liveStatus }) {
  const [selectedRound, setSelectedRound] = useState(null);
  const [roundData, setRoundData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-select current matchday
  useEffect(() => {
    if (selectedRound === null && currentMatchday) {
      setSelectedRound(currentMatchday.id);
    } else if (selectedRound === null && rounds.length > 0) {
      setSelectedRound(rounds[0].id);
    }
  }, [currentMatchday, rounds.length]);

  // Fetch round details when selected
  useEffect(() => {
    if (selectedRound == null) return;
    api(`/api/rounds/${selectedRound}`).then(setRoundData).catch(() => setRoundData(null));
  }, [selectedRound]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
      if (selectedRound) {
        const rd = await api(`/api/rounds/${selectedRound}`);
        setRoundData(rd);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const locked = roundData?.isLocked || false;
  const lockTimeLeft = roundData?.lockTimeLeft || 0;

  return (
    <section className="schedule-view">
      <div className="panel schedule-panel">
        <div className="panel-header">
          <div>
            <h2>Match Schedule</h2>
            <p>Select a round to view fixtures</p>
          </div>
          <button className="btn-refresh" onClick={handleRefresh} disabled={refreshing} type="button">
            {refreshing ? "Refreshing..." : "Refresh Live Data"}
          </button>
        </div>

        {liveStatus && liveStatus.errors?.length > 0 && (
          <div className="refresh-errors">
            {liveStatus.errors.map((err, i) => <p key={i}>{err}</p>)}
          </div>
        )}

        <div className="round-tabs">
          {rounds.map((round) => {
            const isCurrent = currentMatchday && currentMatchday.id === round.id;
            return (
              <button
                key={round.id}
                className={`round-tab${selectedRound === round.id ? " round-tab-active" : ""}${isCurrent ? " round-tab-current" : ""}`}
                onClick={() => setSelectedRound(round.id)}
                type="button"
              >
                <span>MD {round.id}</span>
              </button>
            );
          })}
        </div>

        {roundData && (
          <div className={`lock-banner${locked ? " lock-banner-locked" : ""}`}>
            {locked ? (
              <>
                <strong>XI Locked</strong>
                <span>Round {roundData.id} lineups are locked in</span>
              </>
            ) : lockTimeLeft > 0 ? (
              <>
                <strong>XI Lock In</strong>
                <span className="lock-countdown">{formatCountdown(lockTimeLeft)}</span>
                <span className="lock-kickoff">
                  First kickoff: {new Date(roundData.firstKickoff).toLocaleString()}
                </span>
              </>
            ) : (
              <>
                <strong>Round {roundData.id}</strong>
                <span>Schedule TBD</span>
              </>
            )}
          </div>
        )}

        {roundData && roundData.fixtures?.length > 0 && (
          <div className="fixtures-list">
            {roundData.fixtures.map((fixture) => {
              const date = new Date(fixture.date);
              const hasScore = fixture.home_score !== null;
              return (
                <div className="fixture-row" key={fixture.id}>
                  <span className="fixture-time">
                    {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    {" "}
                    {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="fixture-teams">
                    <strong><SquadFlag squadId={fixture.home_squad_id} assets={assets} /> {fixture.home_squad_abbr}</strong>
                    <span className="fixture-score">
                      {hasScore ? `${fixture.home_score} - ${fixture.away_score}` : "vs"}
                    </span>
                    <strong><SquadFlag squadId={fixture.away_squad_id} assets={assets} /> {fixture.away_squad_abbr}</strong>
                  </div>
                  <span className="fixture-venue">{fixture.venue_city}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {roundData && managers.length > 0 && (
        <div className="panel schedule-lineups-panel">
          <div className="panel-header">
            <div>
              <h2>Lineup Status</h2>
              <p>Round {roundData.id}</p>
            </div>
          </div>
          <div className="lineup-status-list">
            {managers.map((m) => {
              const isMe = session?.manager?.id === m.id;
              return (
                <div className={`lineup-status-row${isMe ? " lineup-status-me" : ""}`} key={m.id}>
                  <strong>{m.logo && <img className="team-logo" src={m.logo} alt="" />}{m.displayName}</strong>
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
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function SquadFlag({ squadId, assets }) {
  const flag = assets?.flags?.[squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default Schedule;
