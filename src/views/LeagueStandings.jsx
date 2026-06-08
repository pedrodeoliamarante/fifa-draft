import React, { useState, useEffect } from "react";
import { formationSlots, playerName } from "../lib/fantasy";

function LeagueStandings({ standings, assets, api, currentMatchday }) {
  const [expandedManager, setExpandedManager] = useState(null);
  const [roundPoints, setRoundPoints] = useState({});
  const defaultFormation = "4-3-3";

  const activeRoundId = currentMatchday?.id || null;

  // Fetch round points for expanded manager
  useEffect(() => {
    if (!expandedManager || !activeRoundId || !api) return;
    if (roundPoints[expandedManager]) return;

    api(`/api/rounds/${activeRoundId}/points/${expandedManager}`)
      .then((data) => setRoundPoints((prev) => ({ ...prev, [expandedManager]: data })))
      .catch(() => {});
  }, [expandedManager, activeRoundId]);

  function toggleManager(managerId) {
    setExpandedManager((current) => (current === managerId ? null : managerId));
  }

  function buildLineup(roster) {
    const slots = formationSlots[defaultFormation];
    const positionNeeds = {};
    for (const pos of slots) positionNeeds[pos] = (positionNeeds[pos] || 0) + 1;

    const starting = [];
    const used = new Set();
    for (const pos of Object.keys(positionNeeds)) {
      const need = positionNeeds[pos];
      const candidates = roster.filter((p) => p.position === pos && !used.has(p.id));
      for (const p of candidates.slice(0, need)) { starting.push(p); used.add(p.id); }
    }
    return { starting, bench: roster.filter((p) => !used.has(p.id)) };
  }

  return (
    <section className="panel empty-view">
      <h2>League Standings</h2>

      <div className="standings-list">
        {standings.map((row, index) => {
          const isExpanded = expandedManager === row.managerId;
          const rPts = roundPoints[row.managerId];

          let displayStarting = [];
          let displayBench = [];
          if (isExpanded) {
            if (rPts && rPts.players?.length > 0) {
              displayStarting = rPts.players;
              const startingIds = new Set(displayStarting.map((p) => p.playerId));
              displayBench = (row.roster || []).filter((p) => !startingIds.has(p.id));
            } else {
              const lineup = buildLineup(row.roster || []);
              displayStarting = lineup.starting;
              displayBench = lineup.bench;
            }
          }

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
                <strong>{row.logo && <img className="team-logo" src={row.logo} alt="" />}{row.displayName}</strong>
                <div className="standing-points">
                  {rPts && <span className="standing-round-pts">+{rPts.totalPoints}</span>}
                  <span>{row.totalPoints} pts</span>
                </div>
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
                          {displayStarting.map((player) => (
                            <div className="standing-player" key={player.id || player.playerId}>
                              <span className="standing-player-pos">{player.position}</span>
                              <strong>
                                <Flag player={player} assets={assets} />
                                {playerName(player)}
                                {player.isCaptain && <span className="captain-badge">C</span>}
                              </strong>
                              <span className="standing-player-pts">
                                {player.totalPoints != null ? `${player.totalPoints} pts` : `${player.totalPoints || 0} pts`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="standing-roster-section">
                        <h3>Bench</h3>
                        <div className="standing-roster-list">
                          {displayBench.map((player) => (
                            <div className="standing-player standing-player-bench" key={player.id}>
                              <span className="standing-player-pos">{player.position}</span>
                              <strong>
                                <Flag player={player} assets={assets} />
                                {playerName(player)}
                              </strong>
                              <span className="standing-player-pts">{player.totalPoints || 0} pts</span>
                            </div>
                          ))}
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
