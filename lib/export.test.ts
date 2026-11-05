import { describe, expect, it } from 'vitest';
import { csvField, exportCsv, exportData, toCsv } from './export';
import type { AccountData } from './types';

describe('exportação local', () => {
  it('escapa delimitadores, aspas e fórmulas de planilha', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    for (const value of ['=SUM(1)', '+CMD', '-1', '@SUM', '  =CMD', '\tCMD', '\nCMD']) expect(csvField(value)).toContain("'");
    expect(toCsv(['a', 'b'], [['ok', true]])).toBe('a,b\r\nok,true\r\n');
  });

  it('inclui ambas as listas sem duplicar mútuos e mantém o schema JSON', () => {
    const data: AccountData = { account: 'owner', snapshots: [{
      id: 'id', account: 'owner', capturedAt: 1000, importedAt: 2000, source: 'official-json', complete: true,
      fingerprint: 'a'.repeat(64), followers: [{ username: 'fan', displayName: '=CMD' }, { username: 'mutual' }], following: [{ username: 'mutual' }, { username: 'out' }],
    }], protected: ['fan'], actions: [], changes: [] };
    const csv = exportCsv(data);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(4);
    expect(csv).toContain("'=CMD");
    expect(csv).toContain('https://www.tiktok.com/@fan,true,false,true');
    expect(JSON.parse(exportData(data))).toMatchObject({ schema: 'elo-tiktok/1', account: 'owner', protected: ['fan'] });
  });
});
