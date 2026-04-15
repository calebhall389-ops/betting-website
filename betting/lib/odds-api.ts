export type SupportedSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights?: boolean;
};

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

function requireApiKey() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  return apiKey;
}

export async function fetchAvailableSports(): Promise<SupportedSport[]> {
  const apiKey = requireApiKey();

  const res = await fetch(
    `${ODDS_API_BASE}/sports?apiKey=${apiKey}&all=true`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load sports: ${text}`);
  }

  const sports = (await res.json()) as SupportedSport[];

  return sports.sort((a, b) => {
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
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load odds for ${sportKey}: ${text}`);
  }

  return await res.json();
}
