const API_KEY = process.env.SPORTSGAMEODDS_API_KEY!;
const BASE_URL =
  process.env.SPORTSGAMEODDS_BASE_URL ||
  'https://api.sportsgameodds.com/v2';

if (!API_KEY) {
  throw new Error('Missing SPORTSGAMEODDS_API_KEY');
}

async function fetchFromSGO(endpoint: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'x-api-key': API_KEY,
    },
    next: { revalidate: 60 }, // Cache for 60 seconds
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SportsGameOdds API error: ${text}`);
  }

  return res.json();
}

export async function fetchSports() {
  return fetchFromSGO('/sports');
}

export async function fetchOdds(sport: string) {
  return fetchFromSGO(`/events?league=${sport}`);
}

export async function fetchEventOdds(eventId: string) {
  return fetchFromSGO(`/events/${eventId}/odds`);
}
