import React from "react";

function LeagueStandings({ standings }) {
  return (
    <section className="panel empty-view">
      <h2>League Standings</h2>
      <div className="standings-list">
        {standings.map((row, index) => (
          <div className="standing-row" key={row.managerId}>
            <span>{index + 1}</span>
            <strong>{row.displayName}</strong>
            <span>{row.totalPoints} pts</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default LeagueStandings;
