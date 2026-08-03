import { describe, expect, it } from 'vitest';
import { convertPagesToTimeRemainingMinutes } from '@/app/library/utils/libraryUtils';

describe('convertPagesToTimeRemainingMinutes', () => {
  it('uses the supplied reading pace', () => {
    expect(convertPagesToTimeRemainingMinutes(10, 30)).toBe(5);
  });

  it('never reports less than one minute', () => {
    expect(convertPagesToTimeRemainingMinutes(0, 30)).toBe(1);
  });
});
