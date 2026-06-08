import React, { useEffect, useState, useRef } from "react";
import { formationSlots, playerName } from "../lib/fantasy";

function MyTeam({ team, formation, assets, lineup, currentMatchday, isLocked, lockTimeLeft: initialLockTimeLeft, onFormationChange, onToggleXI, onSetCaptain }) {
  const [lockTimeLeft, setLockTimeLeft] = useState(initialLockTimeLeft);
  const timerRef = useRef(null);

  useEffect(() => {
    setLockTimeLeft(initialLockTimeLeft);
    if (timerRef.current) clearInterval(timerRef.current);

    if (initialLockTimeLeft == null || initialLockTimeLeft <= 0 || isLocked) return;

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = initialLockTimeLeft - elapsed;
      setLockTimeLeft(remaining > 0 ? remaining : 0);
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [initialLockTimeLeft, isLocked]);
  const players = team?.players || [];
  const startingSet = new Set(lineup?.startingXI || []);
  const captainId = lineup?.captainId;

  const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const sorted = [...players].sort((a, b) => posOrder[a.position] - posOrder[b.position]);
  const starters = sorted.filter((p) => startingSet.has(p.id));
  const bench = sorted.filter((p) => !startingSet.has(p.id));

  const slots = formationSlots[formation] || [];
  const needed = {};
  for (const s of slots) needed[s] = (needed[s] || 0) + 1;
  const have = {};
  for (const p of starters) have[p.position] = (have[p.position] || 0) + 1;

  if (players.length === 0) {
    return (
      <section className="panel team-panel">
        <div className="panel-header">
          <div>
            <h2>My Team</h2>
            <p>0 / 15 players</p>
          </div>
        </div>
        <p className="empty-message">Draft players first to build your roster.</p>
      </section>
    );
  }

  return (
    <section className="panel team-panel">
      <div className="panel-header">
        <div>
          <h2>My Team</h2>
          <p>{starters.length}/11 starting &middot; {players.length} players</p>
        </div>
      </div>

      {currentMatchday && (
        <div className={`lock-banner${isLocked ? " lock-banner-locked" : ""}`}>
          {isLocked ? (
            <>
              <strong>XI Locked</strong>
              <span>Matchday {currentMatchday.id} lineups are locked</span>
            </>
          ) : lockTimeLeft != null && lockTimeLeft > 0 ? (
            <>
              <strong>XI Lock In</strong>
              <span className="lock-countdown">{formatCountdown(lockTimeLeft)}</span>
            </>
          ) : null}
        </div>
      )}

      <div className="formation-bar">
        <select value={formation} onChange={(event) => onFormationChange(event.target.value)}>
          {Object.keys(formationSlots).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <div className="formation-slots">
          {Object.entries(needed).map(([pos, count]) => (
            <span
              key={pos}
              className={`formation-badge ${(have[pos] || 0) === count ? "complete" : ""}`}
            >
              {pos} {have[pos] || 0}/{count}
            </span>
          ))}
        </div>
      </div>

      <div className="roster-list">
        {starters.length > 0 && (
          <>
            <div className="roster-section-label">Starting XI</div>
            {starters.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                assets={assets}
                inXI={true}
                isCaptain={captainId === player.id}
                disabled={isLocked}
                onToggle={() => onToggleXI(player.id)}
                onCaptain={() => onSetCaptain(player.id)}
              />
            ))}
          </>
        )}

        {bench.length > 0 && (
          <>
            <div className="roster-section-label">Bench</div>
            {bench.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                assets={assets}
                inXI={false}
                isCaptain={captainId === player.id}
                disabled={isLocked}
                onToggle={() => onToggleXI(player.id)}
                onCaptain={() => onSetCaptain(player.id)}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function PlayerRow({ player, assets, inXI, isCaptain, disabled, onToggle, onCaptain }) {
  return (
    <div className={`player-card ${inXI ? "in-xi" : ""} ${isCaptain ? "is-captain" : ""}`}>
      <div className="player-card-info">
        <span className="player-card-pos">{player.position}</span>
        <div className="player-card-name">
          <strong>
            <Flag player={player} assets={assets} /> {playerName(player)}
          </strong>
          <span className="player-card-meta">
            {player.teamAbbr || "TBD"} &middot; {player.stats?.totalPoints || 0} pts
          </span>
        </div>
      </div>
      <div className="player-card-actions">
        {inXI && (
          <button
            className={`btn-captain ${isCaptain ? "active" : ""}`}
            onClick={onCaptain}
            disabled={disabled}
            title="Set as captain"
            type="button"
          >
            C
          </button>
        )}
        <button
          className={inXI ? "btn-bench" : "btn-start"}
          onClick={onToggle}
          disabled={disabled}
          type="button"
        >
          {inXI ? "Bench" : "Start"}
        </button>
      </div>
    </div>
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

function Flag({ player, assets }) {
  const flag = assets.flags?.[player.squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default MyTeam;
