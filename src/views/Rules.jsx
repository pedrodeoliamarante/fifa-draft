import React from "react";

const ruleSections = [
  {
    title: "League Setup",
    body:
      "The league has 8 managers, each controlling one team. Player ownership is exclusive. Once a player is drafted, no other manager can use that player unless they are traded or released back to the free-agent pool.",
  },
  {
    title: "Initial Draft",
    body:
      "Before the tournament starts, managers draft their rosters using a snake draft. The draft order reverses every round: if the first round goes 1 through 8, the next round goes 8 through 1. This means the last picker in a round picks again first in the next round (back-to-back picks). Each manager drafts 15 players total, including exactly 2 goalkeepers. Only 1 player per country is allowed on each roster. Managers have 1 hour to make each pick. If the timer expires, the system auto-picks the highest-value available player at a position the manager still needs.",
  },
  {
    title: "Lineups",
    body:
      "Before each round of games kicks off, every manager must set a Starting XI and choose a captain. The captain earns double points. The remaining 4 players sit on the bench. Once the first fixture of the round of games kicks off, all lineups are locked. Allowed formations are 3-4-3, 3-5-2, 4-4-2, 4-3-3, 4-5-1, 5-3-2, and 5-4-1.",
  },
  {
    title: "Scoring",
    body:
      "Players score using the official FIFA Fantasy scoring rules. A manager's round of games score comes from the players in their locked Starting XI, with the captain's points doubled. The league table is ranked by total points across the tournament.",
  },
  {
    title: "After Each Round",
    body:
      "After the round of games's games are finished and scores are settled, managers can adjust their Starting XI and captain before the next round of games. This is also when trade offers can be made and reviewed.",
  },
  {
    title: "Trades",
    body:
      "Trades are allowed between managers after a round of games is complete. You propose a trade by selecting which of your players you want to send and which of their players you want in return. The other manager can accept or reject. Once accepted, the players swap teams and are available for future lineups.",
  },
  {
    title: "Free-Agent Pool",
    body:
      "The free-agent pool is a randomized set of undrafted players that opens after the first round of games. Managers can claim a free agent to fill a gap in their roster. If your roster is full, you must release a player first before claiming a new one.",
  },
  {
    title: "After the Group Stage",
    body:
      "After the group stage ends, there is another draft using the remaining eligible players. Players already owned by managers stay on those teams and do not get redrafted. The post-group-stage draft is only for players who are still available and relevant for the knockout rounds.",
  },
  {
    title: "Winner",
    body:
      "The winner is the manager with the most total points after the World Cup final.",
  },
];

function Rules() {
  return (
    <section className="panel rules-panel">
      <div className="panel-header">
        <div>
          <h2>Rules</h2>
        </div>
      </div>

      <div className="rules-story">
        {ruleSections.map((section) => (
          <article className="rule-section" key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default Rules;
