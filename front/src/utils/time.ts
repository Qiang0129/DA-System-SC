const ISO_WITH_TIMEZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

type LocalDateTimeOptions = {
  locale?: string | string[];
  timeZone?: string;
};

function parseUtcDate(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || !ISO_WITH_TIMEZONE.test(normalized)) {
    return null;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function utcTimestamp(value: string | null | undefined) {
  return parseUtcDate(value)?.getTime() ?? null;
}

export function formatLocalDateTime(
  value: string | null | undefined,
  options: LocalDateTimeOptions = {},
) {
  const date = parseUtcDate(value);
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function formatLocalDate(value: string | null | undefined, options: LocalDateTimeOptions = {}) {
  const date = parseUtcDate(value);
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatLocalClock(value: string | null | undefined, options: LocalDateTimeOptions = {}) {
  const date = parseUtcDate(value);
  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(options.locale, {
    timeZone: options.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function formatLocalDateTimeOr(
  value: string | null | undefined,
  fallback: string,
  options: LocalDateTimeOptions = {},
) {
  const formatted = formatLocalDateTime(value, options);
  return formatted === '—' ? fallback : formatted;
}

export function utcDateTimeAttribute(value: string | null | undefined) {
  return parseUtcDate(value) ? value ?? undefined : undefined;
}
