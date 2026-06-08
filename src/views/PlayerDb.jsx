import React from "react";
import { playerName, positions, sortOptions } from "../lib/fantasy";

function PlayerDb({ players, assets, search, position, sortBy, onSearchChange, onPositionChange, onSortChange }) {
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
                {player.position} / <Flag player={player} assets={assets} /> {player.teamAbbr || "TBD"}
              </span>
            </div>
            <div className="player-meta">
              <span>{player.stats?.totalPoints || 0} pts</span>
              <span>{player.nextFixture || "—"}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlayerPhoto({ player, assets }) {
  const photo = assets.players?.[player.id]?.path;
  if (photo) return <img className="player-photo" src={photo} alt={playerName(player)} />;
  return <div className="player-photo player-photo-fallback">{playerName(player).slice(0, 1)}</div>;
}

function Flag({ player, assets }) {
  const flag = assets.flags?.[player.squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default PlayerDb;