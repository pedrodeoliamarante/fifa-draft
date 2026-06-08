import React from "react";
import { playerName, positions, sortOptions } from "../lib/fantasy";

function formatTime(ms) {
  if (ms == null || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function Draft({
  draft,
  players,
  assets,
  session,
  search,
  position,
  sortBy,
  draftError,
  pickState,
  timeLeft,
  draftedSquads,
  onSearchChange,
  onPositionChange,
  onSortChange,
  onPick,
  onResetDraft,
  onAutoDraft,
}) {
  const blockedSquads = new Set(draftedSquads || []);

  return (
    <section className="draft-grid">
      <div className="panel draft-panel">
        <div className="panel-header">
          <div>
            <h2>Snake Draft</h2>
            {draft?.isComplete ? (
              <p>Draft complete</p>
            ) : (
              <p>
                Pick {draft?.currentPick?.pickNumber} / Round {draft?.currentPick?.roundNumber}
              </p>
            )}
          </div>
          <div className="slot-actions">
            {onAutoDraft && !draft?.isComplete && (
              <button className="btn-small btn-start" onClick={onAutoDraft} type="button">
                Auto-Draft All
              </button>
            )}
            {onResetDraft && (
              <button className="btn-small btn-danger" onClick={onResetDraft} type="button">
                Reset Draft
              </button>
            )}
          </div>
        </div>

        <div className="draft-turn">
          {draft?.isComplete ? (
            <strong>All rosters are full.</strong>
          ) : (
            <>
              <span>On the clock</span>
              <strong>{draft?.currentPick?.manager?.displayName}</strong>
              {timeLeft != null && (
                <span className="draft-timer">{formatTime(timeLeft)}</span>
              )}
            </>
          )}
        </div>

        <div className="standings-list">
          {(draft?.managers || []).map((manager) => {
            const squads = draft?.managerSquads?.[manager.id] || [];
            return (
              <div
                className={draft?.currentPick?.manager?.id === manager.id ? "standing-row active-turn" : "standing-row"}
                key={manager.id}
              >
                <span>{manager.draftPosition}</span>
                <strong>{manager.displayName}</strong>
                <span className="manager-flags">
                  {squads.map((squadId) => {
                    const flag = assets.flags?.[squadId]?.path;
                    return flag ? <img key={squadId} className="flag-icon-sm" src={flag} alt="" /> : null;
                  })}
                </span>
              </div>
            );
          })}
        </div>

        {(draft?.picks || []).length > 0 && (
          <div className="draft-log">
            <h3>Pick History</h3>
            <div className="draft-picks-list">
              {[...draft.picks].reverse().map((pick) => (
                <div className="draft-pick-entry" key={pick.pickNumber}>
                  <span className="pick-number">#{pick.pickNumber}</span>
                  <strong>{pick.playerName}</strong>
                  <span>{pick.position} &middot; {pick.teamAbbr}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="panel player-panel">
        <div className="panel-header">
          <div>
            <h2>Available Players</h2>
            <p>{players.length.toLocaleString()} undrafted players</p>
          </div>
        </div>

        <div className="filters">
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search player or team" />
          <select value={position} onChange={(event) => onPositionChange(event.target.value)}>
            {positions.map((item) => (
              <option key={item} value={item}>
                {item === "ALL" ? "All positions" : item}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(event) => onSortChange(event.target.value)}>
            {sortOptions.map((item) => (
              <option key={item.value} value={item.value}>
                Sort: {item.label}
              </option>
            ))}
          </select>
        </div>

        {draftError && <p className="draft-error">{draftError}</p>}

        <div className="player-list">
          {players.slice(0, 120).map((player) => {
            const isMyTurn = draft?.currentPick?.manager?.id === session?.manager?.id;
            const countryBlocked = blockedSquads.has(player.squadId);
            return (
              <article className={`player-row draft-player-row${countryBlocked ? " country-blocked" : ""}`} key={player.id}>
                <div className="player-main">
                  <strong>{playerName(player)}</strong>
                  <span>
                    {player.position} / <Flag player={player} assets={assets} /> {player.teamAbbr || "TBD"}
                  </span>
                </div>
                <div className="player-meta draft-player-meta">
                  <button disabled={!isMyTurn || pickState === "picking" || countryBlocked} onClick={() => onPick(player.id)} type="button">
                    {countryBlocked ? "Taken" : "Pick"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Flag({ player, assets }) {
  const flag = assets.flags?.[player.squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default Draft;
