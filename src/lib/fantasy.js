export const positions = ["ALL", "GK", "DEF", "MID", "FWD"];

export const sortOptions = [
  { value: "price", label: "Price" },
  { value: "selected", label: "Selected %" },
  { value: "name", label: "Name" },
];

export const rosterSlots = [
  "GK",
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
  "FWD",
  "BENCH",
  "BENCH",
  "BENCH",
];

export const formationSlots = {
  "3-4-3": ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
  "3-5-2": ["GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD"],
  "4-4-2": ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"],
  "4-3-3": ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"],
  "4-5-1": ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD"],
  "5-3-2": ["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"],
  "5-4-1": ["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD"],
};

export const seededManagers = [
  { loginName: "pedro", label: "Pedro" },
  { loginName: "manager2", label: "Manager 2" },
  { loginName: "manager3", label: "Manager 3" },
  { loginName: "manager4", label: "Manager 4" },
];

export function playerName(player) {
  return player.name || player.knownName || [player.firstName, player.lastName].filter(Boolean).join(" ");
}
