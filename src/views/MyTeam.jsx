import React from "react";
import { formationSlots, playerName, rosterSlots } from "../lib/fantasy";

function MyTeam({ team, formation, assets, onFormationChange }) {
  return (
    <section className="team-grid">
      <div className="panel team-panel">
        <div className="panel-header">
          <div>
            <h2>My Roster</h2>
            <p>{team?.players?.length || 0} / 15 players</p>
          </div>
        </div>

        <div className="roster">
          {rosterSlots.map((slot, index) => {
            const rosterPlayer = team?.players?.[index];
            return (
              <div className="slot" key={`${slot}-${index}`}>
                <span>{rosterPlayer?.position || ""}</span>
                <strong>{rosterPlayer ? <><Flag player={rosterPlayer} assets={assets} /> {playerName(rosterPlayer)}</> : "Empty"}</strong>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel lineup-panel">
        <div className="panel-header">
          <div>
            <h2>Starting XI</h2>
            <p>{formation}</p>
          </div>
        </div>

        <div className="formation-card">
          <label>Formation</label>
          <select value={formation} onChange={(event) => onFormationChange(event.target.value)}>
            {Object.keys(formationSlots).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="lineup">
          {formationSlots[formation].map((slot, index) => (
            <div className="slot lineup-slot" key={`${formation}-${slot}-${index}`}>
              <span>{slot}</span>
              <strong>Empty</strong>
            </div>
          ))}
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