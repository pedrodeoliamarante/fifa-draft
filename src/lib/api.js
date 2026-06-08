export async function apiRequest(path, { token, ...options } = {}) {
  const apiBase = import.meta.env.VITE_API_URL || "";
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }

  return response.json();
}
