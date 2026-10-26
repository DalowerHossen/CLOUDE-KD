// path: lib/admin/health-score.ts
// One number from 0 to 100 for the admin home, built from the signals of the health report. Every deduction has a cap so
// that no single signal can hide the others, and the reasons are returned so the page can say why the score is not 100.
export interface HealthSignals {
  databaseOk: boolean;
  alertsCritical: number;
  alertsHigh: number;
  incidentsOpen: number;
  siemFailing: number;
}

export interface HealthScore {
  score: number;
  level: 'good' | 'watch' | 'poor';
  reasons: string[];
}

export function healthScore(s: HealthSignals): HealthScore {
  const reasons: string[] = [];
  let score = 100;
  const take = (points: number, reason: string): void => {
    score -= points;
    reasons.push(reason);
  };
  if (!s.databaseOk) take(50, 'The database does not answer.');
  if (s.alertsCritical > 0)
    take(Math.min(30, s.alertsCritical * 10), `${s.alertsCritical} critical alert(s) open.`);
  if (s.alertsHigh > 0) take(Math.min(15, s.alertsHigh * 5), `${s.alertsHigh} high alert(s) open.`);
  if (s.incidentsOpen > 0)
    take(Math.min(20, s.incidentsOpen * 10), `${s.incidentsOpen} incident(s) open.`);
  if (s.siemFailing > 0)
    take(Math.min(10, s.siemFailing * 5), `${s.siemFailing} log destination(s) failing.`);
  const clamped = Math.max(0, Math.min(100, score));
  return {
    score: clamped,
    level: clamped >= 90 ? 'good' : clamped >= 60 ? 'watch' : 'poor',
    reasons,
  };
}
