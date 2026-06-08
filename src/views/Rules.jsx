import React from "react";

const rules = [
  ["League Size", "6-12 managers"],
  ["Draft", "Snake draft"],
  ["Roster", "15 players, including 2 goalkeepers"],
  ["Ownership", "Exclusive player ownership"],
  ["Scoring", "Official FIFA Fantasy scoring"],
  ["Lineups", "Starting XI required each round"],
  ["Formations", "3-4-3, 3-5-2, 4-4-2, 4-3-3, 4-5-1, 5-3-2, 5-4-1"],
  ["Bench", "4 players"],
  ["Auto Subs", "Enabled"],
  ["Transfers", "1 wildcard after the group stage"],
  ["Trades", "Allowed"],
  ["Winner", "Most points after the final"],
];

function Rules() {
  return (
    <section className="panel rules-panel">
      <div className="panel-header">
        <div>
          <h2>Rules</h2>
        </div>
      </div>

      <div className="rules-list">
        {rules.map(([label, value]) => (
          <div className="rule-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Rules;
