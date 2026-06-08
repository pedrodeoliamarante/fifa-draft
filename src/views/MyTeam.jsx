import React from "react";
import { formationSlots, playerName } from "../lib/fantasy";

function MyTeam({ team, formation, assets, lineup, onFormationChange, onToggleXI, onSetCaptain }) {
  const players = team?.players || [];
  const startingSet = new Set(lineup?.startingXI || []);
  const captainId = lineup?.captainId;

  const posOrder = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const starters = players
    .filter((p) => startingSet.has(p.id))
    .sort((a, b) => posOrder[a.position] - posOrder[b.position]);
  const bench = players
    .filter((p) => !startingSet.has(p.id))
    .sort((a, b) => posOrder[a.position] - posOrder[b.position]);

  const slots = formationSlots[formation] || [];
  const needed = {};
  for (const s of slots) needed[s] = (needed[s] || 0) + 1;
  const have = {};
  for (const p of starters) have[p.position] = (have[p.position] || 0) + 1;

  return (
    <section className="team-grid">
      <div className="panel team-panel">
        <div className="panel-header">
          <div>
            <h2>Starting XI</h2>
            <p>{starters.length} / 11 selected</p>
          </div>
        </div>

        <div className="formation-card">
          <label>Formation</label>
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

        {starters.length > 0 ? (
          <div className="lineup">
            {starters.map((player) => (
              <div
                className={`slot lineup-slot filled ${captainId === player.id ? "captain-slot" : ""}`}
                key={player.id}
              >
                <div className="slot-left">
                  <span>{player.position}</span>
                  <strong>
                    <Flag player={player} assets={assets} /> {playerName(player)}
                  </strong>
                </div>
                <div className="slot-actions">
                  <button
                    className={`btn-captain ${captainId === player.id ? "active" : ""}`}
                    onClick={() => onSetCaptain(player.id)}
                    title="Set as captain"
                    type="button"
                  >
                    C
                  </button>
                  <button
                    className="btn-remove"
                    onClick={() => onToggleXI(player.id)}
                    title="Remove from XI"
                    type="button"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-message">Select players from your roster below to build your Starting XI.</p>
        )}
      </div>

      <div className="panel team-panel">
        <div className="panel-header">
          <div>
            <h2>Full Roster</h2>
            <p>{players.length} / 15 players</p>
          </div>
        </div>

        <div className="roster">
          {players.length === 0 ? (
            <p className="empty-message">Draft players first to build your roster.</p>
          ) : (
            [...players]
              .sort((a, b) => posOrder[a.position] - posOrder[b.position])
              .map((player) => {
                const inXI = startingSet.has(player.id);
                return (
                  <div
                    className={`slot roster-slot ${inXI ? "in-xi" : ""}`}
                    key={player.id}
                  >
                    <div className="slot-left">
                      <span>{player.position}</span>
                      <strong>
                        <Flag player={player} assets={assets} /> {playerName(player)}
                        {captainId === player.id && <span className="captain-badge">C</span>}
                      </strong>
                    </div>
                    <div className="slot-actions">
                      <span className="player-price">${player.price}m</span>
                      <button
                        className={inXI ? "btn-bench" : "btn-start"}
                        onClick={() => onToggleXI(player.id)}
                        type="button"
                      >
                        {inXI ? "Bench" : "Start"}
                      </button>
                    </div>
                  </div>
                );
              })
          )}
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

export default MyTeam;
