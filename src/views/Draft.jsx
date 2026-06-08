import React from "react";
import { playerName, positions, sortOptions } from "../lib/fantasy";

function Draft({
  draft,
  players,
  session,
  search,
  position,
  sortBy,
  draftError,
  pickState,
  onSearchChange,
  onPositionChange,
  onSortChange,
  onPick,
}) {
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
        </div>

        <div className="draft-turn">
          {draft?.isComplete ? (
            <strong>All rosters are full.</strong>
          ) : (
            <>
              <span>On the clock</span>
              <strong>{draft?.currentPick?.manager?.displayName}</strong>
            </>
          )}
        </div>

        <div className="standings-list">
          {(draft?.managers || []).map((manager) => (
            <div
              className={draft?.currentPick?.manager?.id === manager.id ? "standing-row active-turn" : "standing-row"}
              key={manager.id}
            >
              <span>{manager.draftPosition}</span>
              <strong>{manager.displayName}</strong>
              <span></span>
            </div>
          ))}
        </div>
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
            return (
              <article className="player-row draft-player-row" key={player.id}>
                <div className="player-main">
                  <strong>{playerName(player)}</strong>
                  <span>
                    {player.position} / {player.teamAbbr || "TBD"}
                  </span>
                </div>
                <div className="player-meta draft-player-meta">
                  <span>${player.price}m</span>
                  <span>{player.percentSelected}%</span>
                  <button disabled={!isMyTurn || pickState === "picking"} onClick={() => onPick(player.id)} type="button">
                    Pick
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

export default Draft;
