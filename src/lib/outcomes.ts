export interface MatchOutcomeInput {
  score?: { home: number; away: number };
}

export function outcomeResult(match: MatchOutcomeInput, marketKey: string, code: string): 'won' | 'lost' | 'void' {
  const s = match.score ?? { home: 0, away: 0 };
  switch (marketKey) {
    case '1x2':
      if (s.home > s.away) return code === '1' ? 'won' : 'lost';
      if (s.home < s.away) return code === '2' ? 'won' : 'lost';
      return code === 'X' ? 'won' : 'lost';
    case 'moneyline': {
      if (code === '1') return s.home >= s.away ? 'won' : 'lost';
      return s.away >= s.home ? 'won' : 'lost';
    }
    case 'dc':
      if (code === '1X') return s.home >= s.away ? 'won' : 'lost';
      if (code === 'X2') return s.away >= s.home ? 'won' : 'lost';
      return s.home > s.away || s.away > s.home ? 'won' : 'lost';
    case 'ou':
      if (code.startsWith('over')) return s.home + s.away > 2.5 ? 'won' : s.home + s.away === 2.5 ? 'void' : 'lost';
      return s.home + s.away < 2.5 ? 'won' : s.home + s.away === 2.5 ? 'void' : 'lost';
    case 'btts':
      if (code === 'btts_yes') return s.home > 0 && s.away > 0 ? 'won' : 'lost';
      return s.home === 0 || s.away === 0 ? 'won' : 'lost';
    case 'hcp': {
      if (code === 'hcp_1') return s.home - 1 > s.away ? 'won' : s.home - 1 === s.away ? 'void' : 'lost';
      if (code === 'hcp_2') return s.away + 1 > s.home ? 'won' : s.away + 1 === s.home ? 'void' : 'lost';
      return 'void';
    }
    case 'setwinner':
      return code === '2-0' ? 'won' : 'lost';
    default:
      return 'void';
  }
}
