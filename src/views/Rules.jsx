import React from "react";

const ruleSections = [
  {
    title: "League Setup",
    body:
      "The league is built for a private group of 6-12 managers. Each manager controls one team. Player ownership is exclusive, so once a player is drafted by one manager, no other manager can use that player unless he is later traded or released through a future rule.",
  },
  {
    title: "Initial Draft",
    body:
      "Before the tournament starts, managers draft their rosters using a snake draft. The draft order reverses every round: if the first round goes 1 through 12, the next round goes 12 through 1. Each manager drafts 15 players total, including 2 goalkeepers.",
  },
  {
    title: "Weekly Lineups",
    body:
      "Before each round of games starts, every manager locks in a Starting XI. The remaining 4 players are on the bench. Once that round begins, the lineup is locked for that week. Allowed formations are 3-4-3, 3-5-2, 4-4-2, 4-3-3, 4-5-1, 5-3-2, and 5-4-1.",
  },
  {
    title: "Scoring",
    body:
      "Players score using the official FIFA Fantasy scoring rules. A manager's weekly score comes from the players in their locked Starting XI, plus any auto-sub behavior we decide to support. The league table is ranked by total points across the tournament.",
  },
  {
    title: "After Each Week",
    body:
      "After the week's games are finished and scores are settled, managers can adjust their teams before the next round. This is when trade offers can be made and reviewed. Managers can also make a bid for players from the randomized free-agent pool.",
  },
  {
    title: "Trades",
    body:
      "Trades are allowed between managers after a round is complete. A trade offer should clearly show which players are being sent and received. Once both managers accept, the players swap teams and become available for future lineups on their new teams.",
  },
  {
    title: "Free-Agent Pool",
    body:
      "The free-agent pool is a randomized set of available players who were not drafted or are otherwise eligible to be added. Managers can bid for those players after each week. This gives teams a way to improve without making every undrafted player freely available at all times.",
  },
  {
    title: "After the Group Stage",
    body:
      "After the group stage ends, there is another draft using the remaining eligible players. Players already owned by managers stay on those teams and do not get redrafted. The post-group-stage draft is only for players who are still available and relevant for the knockout rounds.",
  },
  {
    title: "Winner",
    body:
      "The winner is the manager with the most total points after the World Cup final. Tiebreakers can be decided later if needed.",
  },
];

function Rules() {
  return (
    <section className="panel rules-panel">
      <div className="panel-header">
        <div>
          <h2>Rules</h2>
          <p>How the draft league works from the first pick through the final.</p>
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
