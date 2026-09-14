// Pure shared policy: legacy wall-clock values mean Beijing time, never host TZ.
const beijingOffsetMs = 8 * 60 * 60 * 1000;
export function contestTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value.trim());
  if (!match) return NaN;
  const [, year, month, day, hour = '00', minute = '00', second = '00', fraction = '', zone = '+08:00'] = match;
  const date = new Date(0);
  date.setUTCFullYear(+year, +month - 1, +day);
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +second > 59) return NaN;
  if (zone !== 'Z' && (+zone.slice(1,3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1,3) === 14 && +zone.slice(4) !== 0))) return NaN;
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zone}`);
}

export function normalizeContestTime(value: unknown): string {
  const timestamp = contestTimestamp(value);
  if (!Number.isFinite(timestamp)) throw new Error('请输入有效的北京时间');
  return new Date(timestamp + beijingOffsetMs).toISOString().replace(/Z$/, '+08:00').replace('.000', '');
}

export function beijingInput(value: string): string {
  if (!value) return '';
  try { return normalizeContestTime(value).replace(/\+08:00$/, ''); } catch { return ''; }
}

export function contestPhase(config: { voteStart: string; voteEnd: string }, now = Date.now()): 'pending' | 'active' | 'ended' {
  const start = contestTimestamp(config.voteStart), end = contestTimestamp(config.voteEnd);
  if (!Number.isFinite(now) || !Number.isFinite(start) || (config.voteEnd && (!Number.isFinite(end) || end <= start))) return 'pending';
  if (now < start) return 'pending';
  // End is exclusive: exactly at the deadline no more votes are accepted.
  if (config.voteEnd && now >= end) return 'ended';
  return 'active';
}
