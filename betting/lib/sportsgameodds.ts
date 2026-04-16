const API_KEY = process.env.SPORTSGAMEODDS_API_KEY!;
const BASE_URL =
  process.env.SPORTSGAMEODDS_BASE_URL || 'https://api.sportsgameodds.com/v2';

if (!API_KEY) {
  throw new Error('Missing SPORTSGAMEODDS_API_KEY');
}

type FetchOptions = {
  searchParams?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(path: string, options?: FetchOptions) {
  const url = new URL(`${BASE_URL}${path}`);

  if (options?.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function fetchFromSportsGameOdds(
  path: string,
  options?: FetchOptions
) {
  const url = buildUrl(path, options);

  const res = await fetch(url, {
    headers: {
      'x-api-key': API_KEY,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`SportsGameOdds API error (${res.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON returned from SportsGameOdds: ${text}`);
  }
}

export async function fetchLeagueEvents(leagueID: string) {
  return fetchFromSportsGameOdds('/events', {
    searchParams: {
      leagueID,
      oddsAvailable: true,
    },
  });
}
