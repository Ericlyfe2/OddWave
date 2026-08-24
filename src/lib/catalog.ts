import type { Market, MarketKey, Sport, SportId } from './types';

export const SPORTS: Sport[] = [
  { id: 'football', name: 'Football', enabled: true },
  { id: 'basketball', name: 'Basketball', enabled: true },
  { id: 'tennis', name: 'Tennis', enabled: true },
  { id: 'cricket', name: 'Cricket', enabled: true },
  { id: 'rugby', name: 'Rugby', enabled: true },
  { id: 'volleyball', name: 'Volleyball', enabled: true },
  { id: 'esports', name: 'Esports', enabled: true },
];

export function sportName(id: string): string {
  return SPORTS.find((s) => s.id === id)?.name ?? id;
}

interface MarketDef {
  key: MarketKey;
  name: string;
  group: string;
  builderAllowed: boolean;
  outcomes: Array<{ code: string; label: string; prob: number }>;
}

function build1x2(ph: number, pd: number): Array<{ code: string; label: string; prob: number }> {
  return [
    { code: '1', label: '1', prob: ph },
    { code: 'X', label: 'X', prob: pd },
    { code: '2', label: '2', prob: Math.max(0.02, 1 - ph - pd) },
  ];
}

export function makeMarkets(sportId: SportId, ph: number, pd: number, totalLine = 2.5, rngOdds: () => number = Math.random): Market[] {
  const margin = 1.065;
  let defs: MarketDef[];

  if (sportId === 'football') {
    defs = [
      { key: '1x2', name: 'Match Result', group: 'Main', builderAllowed: true, outcomes: build1x2(ph, pd) },
      {
        key: 'dc',
        name: 'Double Chance',
        group: 'Main',
        builderAllowed: false,
        outcomes: [
          { code: '1X', label: '1X', prob: Math.min(0.96, ph + pd) },
          { code: '12', label: '12', prob: Math.min(0.95, ph + (1 - ph - pd)) },
          { code: 'X2', label: 'X2', prob: Math.min(0.96, pd + (1 - ph - pd)) },
        ],
      },
      {
        key: 'ou',
        name: `Total Goals ${totalLine}`,
        group: 'Goals',
        builderAllowed: true,
        outcomes: [
          { code: `over_${totalLine}`, label: `Over ${totalLine}`, prob: 0.52 + (rngOdds() - 0.5) * 0.2 },
          { code: `under_${totalLine}`, label: `Under ${totalLine}`, prob: 0.44 + (rngOdds() - 0.5) * 0.2 },
        ],
      },
      {
        key: 'btts',
        name: 'Both Teams To Score',
        group: 'Goals',
        builderAllowed: true,
        outcomes: [
          { code: 'btts_yes', label: 'Yes', prob: 0.55 },
          { code: 'btts_no', label: 'No', prob: 0.42 },
        ],
      },
      {
        key: 'hcp',
        name: 'Handicap (-1)',
        group: 'Specials',
        builderAllowed: false,
        outcomes: [
          { code: 'hcp_1', label: 'Home -1', prob: ph * 0.62 },
          { code: 'hcp_X', label: 'Draw -1', prob: 0.18 },
          { code: 'hcp_2', label: 'Away +1', prob: Math.min(0.9, (1 - ph) * 0.85) },
        ],
      },
    ];
  } else if (sportId === 'basketball' || sportId === 'rugby') {
    defs = [
      { key: 'moneyline', name: 'Money Line 2-Way', group: 'Main', builderAllowed: true, outcomes: [{ code: '1', label: '1', prob: ph }, { code: '2', label: '2', prob: 1 - ph }] },
      { key: 'hcp', name: 'Handicap', group: 'Main', builderAllowed: false, outcomes: [{ code: 'hcp_1', label: 'Home', prob: ph * 0.72 }, { code: 'hcp_2', label: 'Away', prob: (1 - ph) * 0.82 }] },
      { key: 'ou', name: 'Total Points', group: 'Total', builderAllowed: true, outcomes: [{ code: 'over_line', label: 'Over', prob: 0.5 }, { code: 'under_line', label: 'Under', prob: 0.47 }] },
    ];
  } else if (sportId === 'tennis' || sportId === 'esports' || sportId === 'volleyball') {
    defs = [
      { key: 'moneyline', name: 'Match Winner', group: 'Main', builderAllowed: true, outcomes: [{ code: '1', label: '1', prob: ph }, { code: '2', label: '2', prob: 1 - ph }] },
      ...(sportId === 'tennis'
        ? [{ key: 'setwinner' as MarketKey, name: 'Set Betting', group: 'Sets', builderAllowed: false, outcomes: [{ code: '2-0', label: '2-0', prob: ph * 0.6 }, { code: '2-1', label: '2-1', prob: ph * 0.3 }, { code: '0-2', label: '0-2', prob: (1 - ph) * 0.6 }, { code: '1-2', label: '1-2', prob: (1 - ph) * 0.3 }] }]
        : []),
      ...(sportId === 'tennis'
        ? [{ key: 'totalgames' as MarketKey, name: 'Total Games O/U 21.5', group: 'Games', builderAllowed: true, outcomes: [{ code: 'over_g', label: 'Over', prob: 0.5 }, { code: 'under_g', label: 'Under', prob: 0.46 }] }]
        : []),
    ];
  } else if (sportId === 'cricket') {
    defs = [
      { key: 'moneyline', name: 'Match Winner', group: 'Main', builderAllowed: true, outcomes: [{ code: '1', label: '1', prob: ph }, { code: '2', label: '2', prob: 1 - ph }] },
      { key: 'totalsr', name: 'Total Runs O/U 320.5', group: 'Runs', builderAllowed: false, outcomes: [{ code: 'over_r', label: 'Over', prob: 0.51 }, { code: 'under_r', label: 'Under', prob: 0.45 }] },
    ];
  } else {
    defs = [
      { key: 'moneyline', name: 'Match Winner', group: 'Main', builderAllowed: true, outcomes: [{ code: '1', label: '1', prob: ph }, { code: '2', label: '2', prob: 1 - ph }] },
    ];
  }

  return defs.map((d) => ({
    key: d.key,
    name: d.name,
    group: d.group,
    builderAllowed: d.builderAllowed,
    suspended: false,
    outcomes: d.outcomes.map((o) => ({
      id: `${d.key}:${o.code}`,
      marketKey: d.key,
      label: o.label,
      code: o.code,
      odds: Math.max(1.01, Math.round((margin / Math.max(0.02, o.prob)) * 100) / 100),
      updatedAt: Date.now(),
    })),
  }));
}
