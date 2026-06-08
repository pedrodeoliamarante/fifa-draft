import React, { useState } from "react";
import { formationSlots, playerName } from "../lib/fantasy";

function LeagueStandings({ standings, assets }) {
  const [expandedManager, setExpandedManager] = useState(null);
  const defaultFormation = "4-3-3";

  function toggleManager(managerId) {
    setExpandedManager((current) => (current === managerId ? null : managerId));
  }

  function buildLineup(roster) {
    const slots = formationSlots[defaultFormation];
    const positionNeeds = {};
    for (const pos of slots) {
      positionNeeds[pos] = (positionNeeds[pos] || 0) + 1;
    }

    const starting = [];
    const used = new Set();

    // Fill each position slot from the roster
    for (const pos of Object.keys(positionNeeds)) {
      const need = positionNeeds[pos];
      const candidates = roster.filter((p) => p.position === pos && !used.has(p.id));
      const picked = candidates.slice(0, need);
      for (const p of picked) {
        starting.push(p);
        used.add(p.id);
      }
    }

    const bench = roster.filter((p) => !used.has(p.id));
    return { starting, bench };
  }

  return (
    <section className="panel empty-view">
      <h2>League Standings</h2>
      <div className="standings-list">
        {standings.map((row, index) => {
          const isExpanded = expandedManager === row.managerId;
          const { starting, bench } = isExpanded ? buildLineup(row.roster || []) : { starting: [], bench: [] };

          return (
            <div key={row.managerId}>
              <div
                className={`standing-row standing-row-clickable${isExpanded ? " standing-row-expanded" : ""}`}
                onClick={() => toggleManager(row.managerId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggleManager(row.managerId)}
              >
                <span>{index + 1}</span>
                <strong>{row.displayName}</strong>
                <span>{row.totalPoints} pts</span>
              </div>

              {isExpanded && (
                <div className="standing-roster">
                  {row.roster?.length === 0 ? (
                    <p className="standing-roster-empty">No players drafted yet</p>
                  ) : (
                    <>
                      <div className="standing-roster-section">
                        <h3>Starting XI <span>{defaultFormation}</span></h3>
                        <div className="standing-roster-list">
                          {starting.map((player) => (
                            <div className="standing-player" key={player.id}>
                              <span className="standing-player-pos">{player.position}</span>
                              <strong>
                                <Flag player={player} assets={assets} />
                                {playerName(player)}
                              </strong>
                              <span className="standing-player-pts">{player.stats?.totalPoints || 0} pts</span>
                            </div>
                          ))}
                          {starting.length === 0 && <p className="standing-roster-empty">Not enough players</p>}
                        </div>
                      </div>

                      <div className="standing-roster-section">
                        <h3>Bench</h3>
                        <div className="standing-roster-list">
                          {bench.map((player) => (
                            <div className="standing-player standing-player-bench" key={player.id}>
                              <span className="standing-player-pos">{player.position}</span>
                              <strong>
                                <Flag player={player} assets={assets} />
                                {playerName(player)}
                              </strong>
                              <span className="standing-player-pts">{player.stats?.totalPoints || 0} pts</span>
                            </div>
                          ))}
                          {bench.length === 0 && <p className="standing-roster-empty">No bench players</p>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Flag({ player, assets }) {
  const flag = assets?.flags?.[player.squadId]?.path;
  if (!flag) return null;
  return <img className="flag-icon" src={flag} alt="" />;
}

export default LeagueStandings;
