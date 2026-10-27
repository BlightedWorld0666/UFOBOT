// Riot Account-V1 lookup only. No automatic VALORANT rank, ownership,
// or player-stat verification is provided by this endpoint.
const ROUTING_REGIONS = new Set(['americas', 'europe', 'asia']);

export async function lookupRiotAccount({
  riotId,
  region = 'americas',
  apiKey,
  request = fetch,
  timeoutMs = 8000
}) {
  if (!ROUTING_REGIONS.has(region) || typeof riotId !== 'string' ||
      !/^[^#\r\n]{3,16}#[^#\r\n]{3,5}$/.test(riotId)) {
    return { status: 'invalid_input' };
  }
  if (!apiKey) return { status: 'not_configured' };

  const [gameName, tagLine] = riotId.split('#');
  const endpoint = 'https://' + region +
    '.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' +
    encodeURIComponent(gameName) + '/' + encodeURIComponent(tagLine);

  try {
    const response = await request(endpoint, {
      headers: { 'X-Riot-Token': apiKey },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.status === 404) return { status: 'not_found' };
    if (response.status === 401) return { status: 'key_expired_or_invalid' };
    if (response.status === 403) return { status: 'access_denied' };
    if (response.status === 429) return { status: 'rate_limited' };
    if (response.status >= 500) return { status: 'service_unavailable' };
    if (!response.ok) return { status: 'lookup_error' };

    const account = await response.json();
    if (!account || typeof account.gameName !== 'string' ||
        typeof account.tagLine !== 'string' ||
        account.gameName.length === 0 || account.tagLine.length === 0) {
      return { status: 'invalid_response' };
    }
    return {
      status: 'found',
      id: account.gameName + '#' + account.tagLine,
      puuid: typeof account.puuid === 'string' ? account.puuid : null
    };
  } catch {
    // Never echo raw response bodies, request headers, Riot IDs or secrets.
    return { status: 'network_error' };
  }
}
