import { DEFAULT_SPORTS, EXCLUDED_SPORTS_PREFIXES, USE_WHITELIST_ONLY, SupportedSport } from './sports';

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

function requireApiKey() {
  if (!ODDS_API_KEY) {
    throw new Error('Missing ODDS_API_KEY');
  }
  return ODDS_API_KEY;
}

export async function fetchAvailableSports(): Promise<SupportedSport[]> {
  const apiKey = requireApiKey();

  const res = await fetch(
    `${ODDS_API_BASE}/sports?apiKey=${apiKey}&all=true`,
    {
      method: 'GET',
      next: { revalidate: 3600 }, // cache 1 hour
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load sports: ${text}`);
  }

  const sports = (await res.json()) as SupportedSport[];

  let filtered = sports.filter(
    (sport) =>
      !EXCLUDED_SPORTS_PREFIXES.some((prefix) => sport.key.startsWith(prefix))
  );

  if (USE_WHITELIST_ONLY) {
    filtered = filtered.filter((sport) => DEFAULT_SPORTS.includes(sport.key));
  }

  return filtered.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export async function fetchOddsForSport(sportKey: string) {
  const apiKey = requireApiKey();

  const params = new URLSearchParams({
    apiKey,
    regions: 'us',
    markets: 'h2h,spreads,totals',
    oddsFormat: 'american',
  });

  const res = await fetch(
    `${ODDS_API_BASE}/sports/${sportKey}/odds?${params.toString()}`,
    {
      method: 'GET',
      next: { revalidate: 300 }, // cache 5 min
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load odds for ${sportKey}: ${text}`);
  }

  return res.json();
}
