import React, { useState, useRef, useCallback } from "react";
import { playerName, positions, sortOptions } from "../lib/fantasy";

const PAGE_SIZE = 40;

function PlayerDb({ players, assets, search, position, country, countryOptions, sortBy, onSearchChange, onPositionChange, onCountryChange, onSortChange }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const observer = useRef(null);

  // Reset visible count when filters change
  const prevKey = useRef("");
  const filterKey = `${search}|${position}|${country}|${sortBy}`;
  if (filterKey !== prevKey.current) {
    prevKey.current = filterKey;
    if (visible !== PAGE_SIZE) setVisible(PAGE_SIZE);
  }

  const lastRef = useCallback((node) => {
    if (observer.current) observer.current.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisible((v) => v + PAGE_SIZE);
      }
    });
    observer.current.observe(node);
  }, []);

  const shown = players.slice(0, visible);

  return (
    <section className="panel player-panel">
      <div className="panel-header">
        <div>
          <h2>Player DB</h2>
          <p>{players.length.toLocaleString()} players</p>
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
        <select value={country} onChange={(event) => onCountryChange(event.target.value)}>
          {(countryOptions || []).map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
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
        {shown.map((player, i) => (
          <article
            className="player-row"
            key={player.id}
            ref={i === shown.length - 1 ? lastRef : undefined}
          >
            <div className="player-main">
              <strong>{playerName(player)}</strong>
              <span>
                {player.position} / <Flag player={player} assets={assets} /> {player.teamAbbr || "TBD"}
              </span>
            </div>
            <div className="player-meta">
              <span>{player.stats?.totalPoints || player.totalPoints || 0} pts</span>
              <span>{player.nextFixture || "—"}</span>
            </div>
          </article>
        ))}
        {visible < players.length && (
          <div className="load-more-sentinel" />
        )}
      </div>
    </section>
  );
}

function Flag({ player, assets }) {
  const flag = assets.flags?.[player.squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default PlayerDb;
