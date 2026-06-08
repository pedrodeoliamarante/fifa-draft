import React, { useState } from "react";
import { playerName } from "../lib/fantasy";

function Trades({ session, trades, managers, rosters, onPropose, onAccept, onReject, onCancel }) {
  const [toManagerId, setToManagerId] = useState("");
  const [offering, setOffering] = useState([]);
  const [requesting, setRequesting] = useState([]);
  const [error, setError] = useState("");

  const myId = session?.manager?.id;
  const myRoster = rosters[myId] || [];
  const otherManagers = managers.filter((m) => m.id !== myId);
  const targetRoster = toManagerId ? rosters[Number(toManagerId)] || [] : [];

  const pendingForMe = trades.filter((t) => t.toManagerId === myId && t.status === "pending");
  const pendingFromMe = trades.filter((t) => t.fromManagerId === myId && t.status === "pending");
  const completed = trades.filter((t) => t.status === "accepted" || t.status === "rejected" || t.status === "cancelled");

  function toggleOffering(playerId) {
    setOffering((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }

  function toggleRequesting(playerId) {
    setRequesting((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  }

  function handleSubmit() {
    setError("");
    if (!toManagerId) { setError("Select a manager to trade with"); return; }
    if (offering.length === 0 && requesting.length === 0) { setError("Select at least one player"); return; }
    try {
      onPropose(Number(toManagerId), offering, requesting);
      setOffering([]);
      setRequesting([]);
      setToManagerId("");
    } catch (e) {
      setError(e.message);
    }
  }

  function managerName(id) {
    const m = managers.find((mg) => mg.id === id);
    if (!m) return "Unknown";
    return <>{m.logo && <img className="team-logo" src={m.logo} alt="" />}{m.displayName}</>;
  }

  function playerLabel(playerId, allRosters) {
    for (const roster of Object.values(allRosters)) {
      const p = roster.find((pl) => pl.id === playerId);
      if (p) return `${playerName(p)} (${p.position})`;
    }
    return `Player #${playerId}`;
  }

  return (
    <section className="trades-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Propose Trade</h2>
            <p>Select players to offer and request</p>
          </div>
        </div>

        <div className="trade-form">
          <div className="trade-field">
            <label>Trade with</label>
            <select value={toManagerId} onChange={(e) => { setToManagerId(e.target.value); setRequesting([]); }}>
              <option value="">Select manager...</option>
              {otherManagers.map((m) => (
                <option key={m.id} value={m.id}>{m.displayName}</option>
              ))}
            </select>
          </div>

          <div className="trade-columns">
            <div className="trade-column">
              <h3>You offer</h3>
              <div className="trade-player-list">
                {myRoster.map((p) => (
                  <label key={p.id} className={`trade-player-option ${offering.includes(p.id) ? "selected" : ""}`}>
                    <input type="checkbox" checked={offering.includes(p.id)} onChange={() => toggleOffering(p.id)} />
                    <span>{playerName(p)}</span>
                    <span className="trade-pos">{p.position}</span>
                  </label>
                ))}
                {myRoster.length === 0 && <p className="trade-empty">No players on roster</p>}
              </div>
            </div>

            <div className="trade-column">
              <h3>You request</h3>
              <div className="trade-player-list">
                {targetRoster.map((p) => (
                  <label key={p.id} className={`trade-player-option ${requesting.includes(p.id) ? "selected" : ""}`}>
                    <input type="checkbox" checked={requesting.includes(p.id)} onChange={() => toggleRequesting(p.id)} />
                    <span>{playerName(p)}</span>
                    <span className="trade-pos">{p.position}</span>
                  </label>
                ))}
                {!toManagerId && <p className="trade-empty">Select a manager first</p>}
                {toManagerId && targetRoster.length === 0 && <p className="trade-empty">No players on their roster</p>}
              </div>
            </div>
          </div>

          {error && <p className="trade-error">{error}</p>}
          <button className="trade-submit" onClick={handleSubmit} type="button">Send Trade Offer</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Incoming Offers</h2>
            <p>{pendingForMe.length} pending</p>
          </div>
        </div>
        <div className="trade-offers-list">
          {pendingForMe.length === 0 && <p className="trade-empty">No pending offers</p>}
          {pendingForMe.map((trade) => (
            <div className="trade-card" key={trade.id}>
              <div className="trade-card-header">
                <strong>{managerName(trade.fromManagerId)}</strong> wants to trade
              </div>
              <div className="trade-card-body">
                <div>
                  <span className="trade-label">They offer:</span>
                  {trade.offeringPlayerIds.map((pid) => (
                    <span key={pid} className="trade-chip">{playerLabel(pid, rosters)}</span>
                  ))}
                  {trade.offeringPlayerIds.length === 0 && <span className="trade-chip empty">Nothing</span>}
                </div>
                <div>
                  <span className="trade-label">They want:</span>
                  {trade.requestingPlayerIds.map((pid) => (
                    <span key={pid} className="trade-chip">{playerLabel(pid, rosters)}</span>
                  ))}
                  {trade.requestingPlayerIds.length === 0 && <span className="trade-chip empty">Nothing</span>}
                </div>
              </div>
              <div className="trade-card-actions">
                <button className="trade-accept" onClick={() => onAccept(trade.id)} type="button">Accept</button>
                <button className="trade-reject" onClick={() => onReject(trade.id)} type="button">Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Sent Offers</h2>
            <p>{pendingFromMe.length} pending</p>
          </div>
        </div>
        <div className="trade-offers-list">
          {pendingFromMe.length === 0 && <p className="trade-empty">No pending offers</p>}
          {pendingFromMe.map((trade) => (
            <div className="trade-card" key={trade.id}>
              <div className="trade-card-header">
                To <strong>{managerName(trade.toManagerId)}</strong>
              </div>
              <div className="trade-card-body">
                <div>
                  <span className="trade-label">Offering:</span>
                  {trade.offeringPlayerIds.map((pid) => (
                    <span key={pid} className="trade-chip">{playerLabel(pid, rosters)}</span>
                  ))}
                </div>
                <div>
                  <span className="trade-label">Requesting:</span>
                  {trade.requestingPlayerIds.map((pid) => (
                    <span key={pid} className="trade-chip">{playerLabel(pid, rosters)}</span>
                  ))}
                </div>
              </div>
              <div className="trade-card-actions">
                <button className="trade-reject" onClick={() => onCancel(trade.id)} type="button">Cancel</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {completed.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Trade History</h2>
            </div>
          </div>
          <div className="trade-offers-list">
            {completed.slice(-10).reverse().map((trade) => (
              <div className={`trade-card trade-${trade.status}`} key={trade.id}>
                <div className="trade-card-header">
                  <strong>{managerName(trade.fromManagerId)}</strong> &rarr; <strong>{managerName(trade.toManagerId)}</strong>
                  <span className="trade-status">{trade.status}</span>
                </div>
                <div className="trade-card-body">
                  <div>
                    <span className="trade-label">Offered:</span>
                    {trade.offeringPlayerIds.map((pid) => (
                      <span key={pid} className="trade-chip">{playerLabel(pid, rosters)}</span>
                    ))}
                  </div>
                  <div>
                    <span className="trade-label">Requested:</span>
                    {trade.requestingPlayerIds.map((pid) => (
                      <span key={pid} className="trade-chip">{playerLabel(pid, rosters)}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default Trades;
