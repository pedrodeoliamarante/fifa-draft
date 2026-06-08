import React, { useState } from "react";
import { playerName } from "../lib/fantasy";

function FreeAgents({ session, pool, myRoster, isOpen, matchday, onClaim, onRelease, onRefresh, onCompleteMatchday }) {
  const [error, setError] = useState("");
  const [releaseMode, setReleaseMode] = useState(false);
  const rosterFull = myRoster.length >= 15;

  if (!isOpen) {
    return (
      <section className="fa-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Free Agent Pool</h2>
              <p>Opens after matchday 1 is complete</p>
            </div>
          </div>
          <div className="fa-locked">
            <p>The free agent pool is not yet available. It opens after the first matchday results are in.</p>
            {onCompleteMatchday && (
              <button className="btn-small btn-start" onClick={() => onCompleteMatchday(matchday.current)} type="button">
                Simulate: Complete Matchday {matchday.current}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  function handleClaim(playerId) {
    setError("");
    try {
      onClaim(playerId);
    } catch (e) {
      setError(e.message);
    }
  }

  function handleRelease(playerId) {
    setError("");
    try {
      onRelease(playerId);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="fa-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Free Agent Pool</h2>
            <p>{pool.length} players available</p>
          </div>
          {onRefresh && (
            <div className="slot-actions">
              <button className="btn-small btn-start" onClick={onRefresh} type="button">
                Refresh Pool
              </button>
            </div>
          )}
        </div>

        {error && <p className="fa-error">{error}</p>}

        {rosterFull && !releaseMode && (
          <div className="fa-notice">
            <p>Your roster is full (15/15). Release a player to claim a free agent.</p>
            <button className="btn-small btn-danger" onClick={() => setReleaseMode(true)} type="button">
              Release a Player
            </button>
          </div>
        )}

        <div className="fa-list">
          {pool.map((player) => (
            <article className="player-row" key={player.id}>
              <div className="player-main">
                <strong>{playerName(player)}</strong>
                <span>{player.position} / {player.teamAbbr || "TBD"}</span>
              </div>
              <div className="player-meta fa-meta">
                <span>${player.price}m</span>
                <button
                  disabled={rosterFull}
                  onClick={() => handleClaim(player.id)}
                  type="button"
                >
                  Claim
                </button>
              </div>
            </article>
          ))}
          {pool.length === 0 && <p className="fa-empty">No free agents available</p>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>My Roster</h2>
            <p>{myRoster.length}/15 players</p>
          </div>
          {!releaseMode && myRoster.length > 0 && (
            <button className="btn-small btn-danger" onClick={() => setReleaseMode(!releaseMode)} type="button">
              Release Mode
            </button>
          )}
          {releaseMode && (
            <button className="btn-small btn-start" onClick={() => setReleaseMode(false)} type="button">
              Done
            </button>
          )}
        </div>

        <div className="fa-list">
          {myRoster.map((player) => (
            <article className="player-row" key={player.id}>
              <div className="player-main">
                <strong>{playerName(player)}</strong>
                <span>{player.position} / {player.teamAbbr || "TBD"}</span>
              </div>
              <div className="player-meta fa-meta">
                <span>${player.price}m</span>
                {releaseMode && (
                  <button className="btn-release" onClick={() => handleRelease(player.id)} type="button">
                    Release
                  </button>
                )}
              </div>
            </article>
          ))}
          {myRoster.length === 0 && <p className="fa-empty">No players on roster</p>}
        </div>
      </div>
    </section>
  );
}

export default FreeAgents;
