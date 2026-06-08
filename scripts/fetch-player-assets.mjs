import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const playersPath = path.join(root, "data/fifa-fantasy/players.json");
const squadsPath = path.join(root, "data/fifa-fantasy/squads.json");
const assetsDir = path.join(root, "public/assets");
const flagsDir = path.join(assetsDir, "flags");
const playersDir = path.join(assetsDir, "players");
const manifestPath = path.join(assetsDir, "player-assets.json");

const squadIso = {
  ALG: "dz",
  ARG: "ar",
  AUS: "au",
  AUT: "at",
  BEL: "be",
  BIH: "ba",
  BRA: "br",
  CAN: "ca",
  CIV: "ci",
  COD: "cd",
  COL: "co",
  CPV: "cv",
  CRO: "hr",
  CZE: "cz",
  CUW: "cw",
  ECU: "ec",
  EGY: "eg",
  ENG: "gb-eng",
  ESP: "es",
  FRA: "fr",
  GER: "de",
  GHA: "gh",
  HAI: "ht",
  IRN: "ir",
  IRQ: "iq",
  JPN: "jp",
  JOR: "jo",
  KOR: "kr",
  KSA: "sa",
  MAR: "ma",
  MEX: "mx",
  NED: "nl",
  NOR: "no",
  NZL: "nz",
  PAN: "pa",
  PAR: "py",
  POR: "pt",
  QAT: "qa",
  RSA: "za",
  SCO: "gb-sct",
  SEN: "sn",
  SUI: "ch",
  SWE: "se",
  TUN: "tn",
  TUR: "tr",
  URU: "uy",
  USA: "us",
  UZB: "uz",
};

function playerName(player) {
  return player.knownName || [player.firstName, player.lastName].filter(Boolean).join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url, filePath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "fifa-draft-private-app/0.1 (private friends draft)",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);
}

async function findWikimediaThumbnail(player, squad) {
  const name = playerName(player);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `${name} footballer ${squad.name}`,
    gsrlimit: "1",
    prop: "pageimages|description",
    piprop: "thumbnail",
    pithumbsize: "256",
    origin: "*",
  });

  const url = `https://en.wikipedia.org/w/api.php?${params}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "fifa-draft-private-app/0.1" },
  });
  if (!response.ok) return null;

  const data = await response.json();
  const page = data.query?.pages ? Object.values(data.query.pages)[0] : null;
  if (!page?.thumbnail?.source) return null;

  const description = String(page.description || "").toLowerCase();
  const title = String(page.title || "").toLowerCase();
  const lastName = String(player.lastName || player.knownName || "").toLowerCase();
  const looksLikePlayer = description.includes("football") || title.includes(lastName);

  if (!looksLikePlayer) return null;
  return {
    url: page.thumbnail.source,
    source: `https://en.wikipedia.org/?curid=${page.pageid}`,
    title: page.title,
  };
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const players = JSON.parse(await fs.readFile(playersPath, "utf8"));
  const squads = JSON.parse(await fs.readFile(squadsPath, "utf8"));
  const squadById = Object.fromEntries(squads.map((squad) => [squad.id, squad]));

  await fs.mkdir(flagsDir, { recursive: true });
  await fs.mkdir(playersDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    flags: {},
    players: {},
  };

  for (const squad of squads) {
    const iso = squadIso[squad.abbr];
    if (!iso) continue;

    const fileName = `${squad.id}.svg`;
    const flagUrl = `https://flagcdn.com/${iso}.svg`;
    await download(flagUrl, path.join(flagsDir, fileName));
    manifest.flags[squad.id] = {
      squadId: squad.id,
      team: squad.name,
      abbr: squad.abbr,
      path: `/assets/flags/${fileName}`,
      source: "https://flagcdn.com",
    };
  }

  let photoCount = 0;
  for (const player of players) {
    if (photoCount >= limit) break;
    const squad = squadById[player.squadId];
    if (!squad || player.status !== "playing") continue;

    const photo = await findWikimediaThumbnail(player, squad);
    if (!photo) {
      manifest.players[player.id] = {
        playerId: player.id,
        path: null,
        source: null,
      };
      continue;
    }

    const ext = photo.url.includes(".png") ? "png" : "jpg";
    const fileName = `${player.id}.${ext}`;
    try {
      await download(photo.url, path.join(playersDir, fileName));
      manifest.players[player.id] = {
        playerId: player.id,
        path: `/assets/players/${fileName}`,
        source: photo.source,
        title: photo.title,
      };
      photoCount += 1;
    } catch (error) {
      manifest.players[player.id] = {
        playerId: player.id,
        path: null,
        source: photo.source,
        error: error.message,
      };
    }

    await sleep(300);
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Downloaded ${Object.keys(manifest.flags).length} flags and ${photoCount} player photos.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
