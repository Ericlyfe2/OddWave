import type { League, Match, SportId, Team } from './types';
import { makeMarkets } from './catalog';
import { seededRng, range } from './rng';

interface LeagueSeed {
  id: string;
  sportId: SportId;
  name: string;
  country: string;
  featured: boolean;
  teams: string[];
}

const LEAGUE_SEEDS: LeagueSeed[] = [
  { id: 'ghpl', sportId: 'football', name: 'Ghana Premier League', country: 'Ghana', featured: true, teams: ['Accra Lions', 'Kumasi Royals', 'Tamale City', 'Cape Coast Stars', 'Tema United', 'Sekondi Rangers', 'Ho Warriors', 'Sunyani Kings'] },
  { id: 'euro1', sportId: 'football', name: 'Continental Champions Cup', country: 'Europe', featured: true, teams: ['Northgate FC', 'Real Montaña', 'Bavaria Kickers', 'Lyon Étoile', 'Milano Nero', 'Thames United', 'Amsterdam Ajaxa', 'Lisboa Marítimo', 'Istanbul Boğaz', 'Warsaw Orzeł'] },
  { id: 'eng1', sportId: 'football', name: 'Albion Premier Division', country: 'England', featured: true, teams: ['Ravenswood', 'Kingsbridge', 'Eastfield Athletic', 'Port Meridian', 'Silverlake', 'Old Harrow', 'Newcastle Bay', 'Redcliffe Town'] },
  { id: 'cafcl', sportId: 'football', name: 'Africa Champions League', country: 'Africa', featured: false, teams: ['Nairobi Jua', 'Lagos Thunder', 'Cairo Falcons', 'Dakar Waves', 'Kinshasa Leopards', 'Abidjan Élan'] },
  { id: 'usa1', sportId: 'basketball', name: 'Atlantic Hoops Association', country: 'USA', featured: true, teams: ['Brooklyn Bolts', 'Chicago Storm', 'Denver Peaks', 'Miami Cyclones', 'Portland Pioneers', 'Toronto Northmen'] },
  { id: 'eurbb', sportId: 'basketball', name: 'Euro Hoops League', country: 'Europe', featured: false, teams: ['Madrid Aire', 'Athens Olympus', 'Vilnius Wolves', 'Belgrade Bees'] },
  { id: 'atpw', sportId: 'tennis', name: 'Global Open Series', country: 'International', featured: true, teams: ['K. Osei', 'M. Duval', 'R. Silva', 'J. Novotná', 'T. Yamada', 'A. Petrov', 'L. Mensah', 'C. Ferrari'] },
  { id: 'wt20', sportId: 'cricket', name: 'Coastal T20 Blast', country: 'International', featured: false, teams: ['Harbour Heat', 'Delta Strikers', 'Monsoon Kings', 'Savannah Sixers'] },
  { id: 'rugbys', sportId: 'rugby', name: 'Southern Rugby Championship', country: 'International', featured: false, teams: ['Wellington Waka', 'Cape Buffaloes', 'Sydney Surge', 'Auckland Irons'] },
  { id: 'volleyl', sportId: 'volleyball', name: 'Coastal Volley League', country: 'Ghana', featured: false, teams: ['Osu Spikers', 'Elmina Waves', 'Axim Anchors', 'Ada Tides'] },
  { id: 'esl', sportId: 'esports', name: 'Pro Circuit Masters', country: 'Global', featured: true, teams: ['Nova Esports GH', 'Titan Squad', 'Falcon Five', 'Quantum Rift', 'Neon Vipers', 'Apex Legion'] },
];

const TEAM_COLORS = ['#1d64d8', '#0f4092', '#15607a', '#b42318', '#5b3fd4', '#0e7490', '#8a5a00', '#a4247a'];

function teamFrom(name: string, i: number): Team {
  const words = name.split(' ').filter(Boolean);
  const short =
    words.length > 1
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 3).toUpperCase();
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    name,
    short,
    color: TEAM_COLORS[i % TEAM_COLORS.length],
  };
}

export function getLeagues(sportId?: string): League[] {
  return LEAGUE_SEEDS.filter((l) => !sportId || l.sportId === sportId).map((l) => ({
    id: l.id,
    sportId: l.sportId,
    name: l.name,
    country: l.country,
    featured: l.featured,
  }));
}

export function getLeague(id: string): League | undefined {
  return getLeagues().find((l) => l.id === id);
}

export function buildMatchesForDay(now = Date.now()): Match[] {
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const matches: Match[] = [];

  for (const seed of LEAGUE_SEEDS) {
    const rng = seededRng(`${seed.id}:${dayKey}`);
    const count = seed.featured ? 8 : 4;
    const pool = [...seed.teams];
    range(Math.floor(count / 2)).forEach(() => {
      if (pool.length < 2) return;
      const hi = Math.floor(rng() * pool.length);
      const homeName = pool.splice(hi, 1)[0];
      const ai = Math.floor(rng() * pool.length);
      const awayName = pool.splice(ai, 1)[0];
      const strengthH = seededRng(homeName + dayKey)();
      const strengthA = seededRng(awayName + dayKey)();

      for (let k = 0; k < 2; k++) {
        const slot = rng();
        let kickoff: number;
        let status: Match['status'];
        let minute: number | undefined;
        let period: string | undefined;

        if (k === 0 && slot < 0.34) {
          status = 'live';
          minute = Math.floor(rng() * (seed.sportId === 'football' ? 82 : 55)) + 4;
          kickoff = now - minute * 60_000;
          period = inProgressPeriod(seed.sportId, minute);
        } else if (k === 0 && slot < 0.42) {
          status = 'live';
          minute = Math.floor(rng() * 12) + 2;
          kickoff = now - minute * 60_000;
          period = inProgressPeriod(seed.sportId, minute);
        } else if (slot < 0.16) {
          status = 'finished';
          kickoff = now - (10 + rng() * 26) * 3600_000;
        } else if (k === 1 && slot < 0.75) {
          status = 'upcoming';
          kickoff = now + (1.5 + rng() * 30) * 3600_000;
        } else {
          status = 'upcoming';
          kickoff = now + (0.35 + rng() * 6) * 3600_000;
        }

        const home = teamFrom(homeName, hi);
        const away = teamFrom(awayName, ai);
        const phBase = 0.28 + strengthH * 0.38;
        const pd = seed.sportId === 'football' || seed.sportId === 'cricket' ? 0.24 : 0.02;
        const ph = Math.min(0.72, Math.max(0.14, phBase));
        const score =
          status === 'finished' || status === 'live'
            ? {
                home:
                  seed.sportId === 'basketball'
                    ? 68 + Math.round(strengthH * 45)
                    : seed.sportId === 'cricket'
                      ? 140 + Math.round(strengthH * 120)
                      : Math.round(strengthH * 3),
                away:
                  seed.sportId === 'basketball'
                    ? 68 + Math.round(strengthA * 45)
                    : seed.sportId === 'cricket'
                      ? 140 + Math.round(strengthA * 120)
                      : Math.round(strengthA * 3),
              }
            : undefined;

        const matchId = `${seed.id}:${home.id}-vs-${away.id}`;
        matches.push({
          id: matchId,
          sportId: seed.sportId,
          leagueId: seed.id,
          leagueName: seed.name,
          country: seed.country,
          home,
          away,
          kickoff,
          status,
          minute,
          period,
          score,
          featured: seed.featured && rng() > 0.5,
          markets: makeMarkets(seed.sportId, ph, pd, 2.5, seededRng(matchId)),
        });
      }
    });
  }

  return matches;
}

function inProgressPeriod(sportId: SportId, minute: number): string {
  switch (sportId) {
    case 'football':
      return minute <= 45 ? '1st Half' : '2nd Half';
    case 'basketball':
      return `Q${Math.min(4, Math.ceil(minute / 14))}`;
    case 'tennis':
      return minute % 3 === 0 ? 'Set 2' : 'Set 1';
    case 'volleyball':
      return `Set ${Math.min(5, Math.ceil(minute / 15))}`;
    default:
      return 'In Play';
  }
}

export const VIRTUAL_LEAGUE_ID = 'vfl';

const VIRTUAL_TEAMS = [
  'Metro Falcons', 'Harbour City', 'Golden Ridge', 'Storm Valley',
  'Iron Coast', 'Solar Park', 'Rapid Bay', 'Summit Rovers',
];

export function buildVirtualMatches(now = Date.now()): Match[] {
  const rng = seededRng(`vfl:${Math.floor(now / (30 * 60_000))}`);
  const pool = [...VIRTUAL_TEAMS];
  const matches: Match[] = [];

  range(4).forEach(() => {
    if (pool.length < 2) return;
    const hi = Math.floor(rng() * pool.length);
    const homeName = pool.splice(hi, 1)[0];
    const ai = Math.floor(rng() * pool.length);
    const awayName = pool.splice(ai, 1)[0];
    const strengthH = rng();
    const strengthA = rng();
    const home = teamFrom(homeName, hi);
    const away = teamFrom(awayName, ai);

    // Staggered round slots: two already in play, rest start every ~6 minutes.
    const offsetMin = [-12, -6, 6, 12][matches.length] ?? 18;
    const kickoff = now + offsetMin * 60_000;
    const elapsed = Math.floor((now - kickoff) / 60_000);
    const status: Match['status'] = elapsed >= 90 ? 'finished' : elapsed > 0 ? 'live' : 'upcoming';

    matches.push({
      id: `vfl:${home.id}-vs-${away.id}`,
      sportId: 'football',
      leagueId: VIRTUAL_LEAGUE_ID,
      leagueName: 'Virtual Football League',
      country: 'Virtual',
      home,
      away,
      kickoff,
      status,
      minute: status === 'live' ? elapsed : undefined,
      period: status === 'live' ? inProgressPeriod('football', elapsed) : undefined,
      score:
        status === 'upcoming'
          ? undefined
          : { home: Math.round(strengthH * 3 * (elapsed / 90)), away: Math.round(strengthA * 3 * (elapsed / 90)) },
      featured: false,
      virtual: true,
      markets: makeMarkets('football', Math.min(0.72, Math.max(0.14, 0.28 + strengthH * 0.38)), 0.24, 2.5, seededRng(`${home.id}${away.id}${offsetMin}`)),
    });
  });

  return matches;
}
