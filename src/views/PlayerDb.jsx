import React from "react";
import { playerName, positions, sortOptions } from "../lib/fantasy";

function PlayerDb({ players, search, position, sortBy, onSearchChange, onPositionChange, onSortChange }) {
  return (
    <section className="panel player-panel">
      <div className="panel-header">
        <div>
          <h2>Available Players</h2>
          <p>{players.length.toLocaleString()} players available</p>
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

      <div className="player-list">
        {players.slice(0, 120).map((player) => (
          <article className="player-row" key={player.id}>
            <div className="player-main">
              <strong>{playerName(player)}</strong>
              <span>
                {player.position} · {player.teamAbbr || "TBD"}
              </span>
            </div>
            <div className="player-meta">
              <span>${player.price}m</span>
              <span>{player.percentSelected}%</span>
              <span>{player.nextFixture || "No fixture"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default PlayerDb;
