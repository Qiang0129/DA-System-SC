import { describe, expect, it } from 'vitest';
import {
  formatLocalClock,
  formatLocalDate,
  formatLocalDateTime,
  utcTimestamp,
} from './time';

describe('UTC 时间显示工具', () => {
  const options = { locale: 'en-GB', timeZone: 'Asia/Shanghai' };

  it('按指定本地时区格式化 UTC 时间', () => {
    const value = '2026-08-04T10:20:30Z';

    expect(formatLocalDateTime(value, options)).toBe('04/08/2026, 18:20:30');
    expect(formatLocalDate(value, options)).toBe('04/08/2026');
    expect(formatLocalClock(value, options)).toBe('18:20:30');
  });

  it('排序使用 UTC 时间戳，不能依赖展示文本', () => {
    expect(utcTimestamp('2026-08-04T10:20:30Z')).toBeLessThan(utcTimestamp('2026-08-04T10:21:30Z')!);
  });

  it('拒绝没有时区的旧格式和无效值', () => {
    expect(formatLocalDateTime('2026-08-04 10:20:30', options)).toBe('—');
    expect(formatLocalDateTime('invalid', options)).toBe('—');
    expect(utcTimestamp(null)).toBeNull();
  });
});
