import { describe, expect, it } from 'vitest';
import { compareSnapshots, makeSnapshot, normalizeUsername, parseOfficialFiles } from './import';
import { exportData } from './export';
import type { AccountData } from './types';

const file = (data: unknown) => [{ name: 'user_data.json', text: JSON.stringify(data) }];
const official = (followers: unknown = [{ UserName: 'fan', Date: '2026-01-01' }], following: unknown = [{ UserName: 'friend' }]) => ({
  Profile: {
    'Profile Information': { ProfileMap: { Username: 'Owner' } },
    'Follower List': { FansList: followers },
    'Following List': { Following: following },
  },
});
const options = { account: 'owner', capturedAt: 1_700_000_000_000, confirmedComplete: true };

describe('nomes de usuário', () => {
  it('normaliza nomes e URLs apenas do domínio correto', () => {
    expect(normalizeUsername(' @OWNER ')).toBe('owner');
    expect(normalizeUsername('https://www.tiktok.com/@Owner/')).toBe('owner');
    for (const value of ['https://tiktok.com.evil/@owner', 'https://user@tiktok.com/@owner', 'https://tiktok.com/@owner?x=1', 'x/y', 'bad name', 'name.', '=cmd', '..']) expect(() => normalizeUsername(value)).toThrow();
  });
});

describe('importação oficial', () => {
  it('identifica a conta pelo perfil, nunca pelo primeiro seguidor', () => {
    const draft = parseOfficialFiles(file(official()));
    expect(draft.account).toBe('owner');
    expect(draft.followers).toEqual([{ username: 'fan' }]);
    expect(draft.following).toEqual([{ username: 'friend' }]);
    expect(draft.warnings.join(' ')).toContain('24–48');
    expect(draft.capturedAt).toBeUndefined();
  });

  it('suporta as categorias e capitalizações documentadas nas amostras', () => {
    const draft = parseOfficialFiles(file({ 'Profile And Settings': {
      'Profile Info': { ProfileMap: { userName: 'owner' } },
      Follower: { FansList: [{ Username: 'first' }] }, Following: { Following: [] },
    } }));
    expect(draft.account).toBe('owner');
    expect(draft.followers).toEqual([{ username: 'first' }]);
    expect(draft.following).toEqual([]);
    const legacy = parseOfficialFiles(file({ Activity: { 'Follower List': { FansList: [] }, 'Following List': { Following: [] } } }));
    expect(legacy.account).toBeNull();
    expect(legacy.followers).toEqual([]);
  });

  it('não transforma seção ausente, registro inválido ou duplicado em lista completa', async () => {
    const missing = parseOfficialFiles(file({ Follower: { FansList: [] } }));
    expect(missing.following).toBeNull();
    await expect(makeSnapshot(missing, options)).rejects.toThrow('completa');
    expect((await makeSnapshot(missing, { ...options, confirmedComplete: false })).complete).toBe(false);
    for (const rows of [[{ UserName: 'ok' }, {}], [{ UserName: 'same' }, { UserName: 'SAME' }], [{ UserName: 'foo', Username: 'bar' }], 'invalid']) {
      const draft = parseOfficialFiles(file(official(rows)));
      expect(draft.followers).toBeNull();
      await expect(makeSnapshot(draft, options)).rejects.toThrow('completa');
    }
  });

  it('bloqueia completude quando uma contagem exata do perfil diverge da lista', async () => {
    for (const fields of [{ 'Follower Count': 2 }, { followingCount: '0' }]) {
      const data = official();
      Object.assign(data.Profile['Profile Information'].ProfileMap, fields);
      const draft = parseOfficialFiles(file(data));
      expect(draft.completionBlocked).toBe(true);
      expect(draft.warnings.join(' ')).toContain('difere da lista');
      await expect(makeSnapshot(draft, options)).rejects.toThrow('completa');
      expect((await makeSnapshot(draft, { ...options, confirmedComplete: false })).complete).toBe(false);
    }
    const matching = official();
    Object.assign(matching.Profile['Profile Information'].ProfileMap, { 'Follower Count': '1', 'Following Count': 1 });
    expect(parseOfficialFiles(file(matching)).completionBlocked).not.toBe(true);
  });

  it('recusa pacotes misturados, seções repetidas e JSON inválido', () => {
    expect(() => parseOfficialFiles([{ name: 'bad.json', text: '{' }])).toThrow('JSON inválido');
    const data = official();
    expect(() => parseOfficialFiles([...file(data), { name: 'other.json', text: JSON.stringify({ Profile: { 'Profile Information': { ProfileMap: { Username: 'another' } } } }) }])).toThrow('contas diferentes');
    expect(() => parseOfficialFiles([...file(data), { name: 'second.json', text: JSON.stringify({ Follower: { FansList: [] } }) }])).toThrow('mais de uma lista');
    expect(() => parseOfficialFiles([...file(data), ...file(data)])).toThrow('mais de uma vez');
  });

  it('lê TXT por rótulos, sem usar datas de seguidores como data do pacote', () => {
    const draft = parseOfficialFiles([
      { name: 'Profile/Profile Info.txt', text: 'Nickname: Eu\nUsername: Owner\n' },
      { name: 'Profile/Follower.txt', text: 'Date: 2025-01-01 03:00:00\nUserName: fan\n\nDate: 2025-02-01\nUsername: friend\n' },
      { name: 'Profile/Following.txt', text: 'Date: 2025-03-01\nUserName: friend\n' },
    ]);
    expect(draft.account).toBe('owner');
    expect(draft.followers?.map(p => p.username)).toEqual(['fan', 'friend']);
    expect(draft.source).toBe('official-txt');
    expect(draft.capturedAt).toBeUndefined();
    for (const text of ['', 'Date: 2025-01-01', 'UserName: fan', 'Date: 2025-01-01\nUserName: fan\nUNKNOWN']) {
      expect(parseOfficialFiles([{ name: 'Follower.txt', text }]).followers).toBeNull();
    }
  });

  it('gera identidade do arquivo independente da data digitada e recusa conta/data inválidas', async () => {
    const draft = parseOfficialFiles(file(official()));
    const first = await makeSnapshot(draft, options);
    const second = await makeSnapshot(draft, { ...options, capturedAt: options.capturedAt + 1000 });
    expect(first.fingerprint).toHaveLength(64);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.importedAt).toBeGreaterThan(first.capturedAt);
    await expect(makeSnapshot(draft, { ...options, account: 'other' })).rejects.toThrow('difere');
    await expect(makeSnapshot(draft, { ...options, capturedAt: Date.now() + 60_000 })).rejects.toThrow('futuro');
  });
});

describe('comparações e roundtrip elo', () => {
  it('compara somente listas completas da mesma conta em ordem temporal e registra detecção', async () => {
    const draft = parseOfficialFiles(file(official()));
    const previous = await makeSnapshot(draft, options);
    const current = await makeSnapshot(parseOfficialFiles(file(official([], [{ UserName: 'new' }]))), { ...options, capturedAt: options.capturedAt + 1000 });
    const changes = compareSnapshots(previous, current);
    expect(changes?.followersLost).toEqual(['fan']);
    expect(changes?.followingAdded).toEqual(['new']);
    expect(changes?.detectedAt).toBe(current.importedAt);
    expect(compareSnapshots({ ...previous, complete: false }, current)).toBeNull();
    expect(compareSnapshots(previous, { ...current, complete: false })).toBeNull();
    expect(compareSnapshots(previous, { ...current, account: 'other' })).toBeNull();
    expect(compareSnapshots(current, previous)).toBeNull();
  });

  it('reimporta a análise mais recente e exige confirmação humana de completude', async () => {
    const snapshot = await makeSnapshot(parseOfficialFiles(file(official())), options);
    const data: AccountData = { account: 'owner', snapshots: [snapshot], protected: ['fan'], actions: [], changes: [] };
    const draft = parseOfficialFiles([{ name: 'elo.json', text: exportData(data) }]);
    expect(draft.source).toBe('elo-json');
    expect(draft.followers).toEqual(snapshot.followers);
    expect(draft.capturedAt).toBe(snapshot.capturedAt);
    expect((await makeSnapshot(draft, { ...options, confirmedComplete: false })).complete).toBe(false);
    expect((await makeSnapshot(draft, options)).complete).toBe(true);
    data.snapshots[0] = { ...snapshot, complete: false };
    const partial = parseOfficialFiles([{ name: 'elo.json', text: exportData(data) }]);
    await expect(makeSnapshot(partial, options)).rejects.toThrow('completa');
  });
});
