// Local draft engine adapter — replaces the server API with in-browser localStorage-based engine.

let _engine = null;

export function setEngine(engine) {
  _engine = engine;
}

export function getEngine() {
  return _engine;
}

export async function apiRequest(path, { token, method, body } = {}) {
  if (!_engine) throw new Error("Engine not initialized");

  const managerId = token ? Number(token.replace("local-", "")) : null;
  const parsed = body ? JSON.parse(body) : {};

  if (path === "/api/login") {
    return _engine.login(parsed.loginName);
  }

  if (path === "/api/logout") {
    return { ok: true };
  }

  if (path === "/api/me") {
    return _engine.getMe(managerId);
  }

  if (path === "/api/players") {
    return _engine.getPlayers();
  }

  if (path === "/api/standings") {
    return _engine.getStandings();
  }

  if (path === "/api/draft") {
    return _engine.getDraft();
  }

  if (path === "/api/draft/pick" && method === "POST") {
    return _engine.pick(managerId, Number(parsed.playerId));
  }

  throw new Error(`Unknown local API route: ${path}`);
}
