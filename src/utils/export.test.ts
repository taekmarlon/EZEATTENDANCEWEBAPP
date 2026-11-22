import { describe, it, expect } from 'vitest';
import { buildCSVContent, escapeCsvCell } from './export';

describe('export utilities', () => {
  it('neutralizes CSV formula injection prefixes (=, +, -, @, tab, CR)', () => {
    expect(escapeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
    expect(escapeCsvCell('+1+1')).toBe('"\'+1+1"');
    expect(escapeCsvCell('-2+3')).toBe('"\'-2+3"');
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe('"\'@SUM(A1:A2)"');
    expect(escapeCsvCell('\t=1')).toBe('"\'\t=1"');
  });

  it('preserves standard values, numbers, empty cells, and UTF-8 BOM', () => {
    expect(escapeCsvCell('Maria "Mari" Santos')).toBe('"Maria ""Mari"" Santos"');
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(95)).toBe('"95"');

    const csv = buildCSVContent(['Name', 'Score'], [['Maria', 5]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Name","Score"\n"Maria","5"');
  });
});
