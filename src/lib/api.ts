const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

function getApiBaseUrl() {
  if (!configuredBaseUrl) return "";

  try {
    const apiUrl = new URL(configuredBaseUrl, window.location.origin);
    const apiUsesLoopback = localHosts.has(apiUrl.hostname);
    // A loopback URL points to the visitor's own device. Route these requests
    // through the same-origin proxy instead of sending them to that address.
    if (apiUsesLoopback) return "";
  } catch {
    // Keep relative base paths, such as /api, as configured.
  }

  return configuredBaseUrl.replace(/\/+$/, "");
}

export const API_BASE_URL = getApiBaseUrl();
