import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSnapshot } from './import';
import { TrackerStore } from './store';
import type { ActionRecord, Snapshot } from './types';

let store: TrackerStore;
const baseDate = 1_700_000_000_000;
const snapshot = (step: number, followers = ['fan'], complete = true, account = 'owner'): Promise<Snapshot> => makeSnapshot({
  account, followers: followers.map(username => ({ username })), following: [{ username: 'friend' }], warnings: [], source: 'official-json',
}, { account, capturedAt: baseDate + step * 1000, confirmedComplete: complete });
const action = (overrides: Partial<ActionRecord> = {}): ActionRecord => ({ id: crypto.randomUUID(), account: 'owner', target: 'friend', at: Date.now(), status: 'attempting', message: 'Tentativa', ...overrides });

beforeEach(async () => {
  Object.assign(globalThis, { indexedDB: new IDBFactory() });
  store = await TrackerStore.open();
});
afterEach(() => store.close());

describe('histórico local por conta', () => {
  it('guarda prova de leitura de seguindo sem tornar ambas as listas completas', async () => {
    const live: Snapshot = { ...await snapshot(1, [], false), source: 'browser', followingCollection: { complete: true, expected: 1 } };
    await store.saveSnapshot(live);
    expect((await store.getData('owner')).snapshots[0]?.followingCollection?.complete).toBe(true);
    expect((await store.getData('owner')).changes).toEqual([]);
    await expect(store.saveSnapshot({ ...live, followingCollection: { complete: true, expected: 2 } })).rejects.toThrow('comprovação');
  });
  it('isola dados e proteções por conta e persiste ao reabrir', async () => {
    await store.saveSnapshot(await snapshot(1));
    await store.setProtected('@owner', '@Friend', true);
    await store.setProtected('other', 'otherfriend', true);
    expect(await store.listAccounts()).toEqual(['other', 'owner']);
    expect((await store.getData('OWNER')).protected).toEqual(['friend']);
    expect((await store.getData('other')).snapshots).toEqual([]);
    store.close();
    store = await TrackerStore.open();
    expect((await store.getData('owner')).snapshots).toHaveLength(1);
    await store.setProtected('owner', 'friend', false);
    expect((await store.getData('owner')).protected).toEqual([]);
  });

  it('recusa duplicados, datas iguais/antigas/futuras sem modificar histórico', async () => {
    const first = await snapshot(2);
    await store.saveSnapshot(first);
    await expect(store.saveSnapshot({ ...first, id: 'changed', capturedAt: first.capturedAt + 1000 })).rejects.toThrow('já foi importado');
    await expect(store.saveSnapshot(await snapshot(1, ['older']))).rejects.toThrow('posterior');
    await expect(store.saveSnapshot(await snapshot(2, ['same_date']))).rejects.toThrow('posterior');
    await expect(store.saveSnapshot({ ...await snapshot(3), capturedAt: Date.now() + 100_000 })).rejects.toThrow('futura');
    expect((await store.getData('owner')).snapshots).toHaveLength(1);
  });

  it('compara completos, ignorando parciais como base ou conclusão de perda', async () => {
    await store.saveSnapshot(await snapshot(1, ['fan', 'lost']));
    await store.saveSnapshot(await snapshot(2, [], false));
    expect((await store.getData('owner')).changes).toHaveLength(0);
    await store.saveSnapshot(await snapshot(3, ['fan', 'new']));
    const data = await store.getData('owner');
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0]?.previousId).toBe(data.snapshots[0]?.id);
    expect(data.changes[0]?.followersLost).toEqual(['lost']);
    expect(data.changes[0]?.followersGained).toEqual(['new']);
    expect(data.changes[0]?.detectedAt).toBe(data.snapshots[2]?.importedAt);
  });

  it('rejeita nomes duplicados ou inválidos mesmo fora do parser', async () => {
    const first = await snapshot(1);
    await expect(store.saveSnapshot({ ...first, followers: [{ username: 'fan' }, { username: 'fan' }] })).rejects.toThrow('duplicados');
    await expect(store.saveSnapshot({ ...first, account: 'OWNER' })).rejects.toThrow('inválida');
    await expect(store.saveSnapshot({ ...first, source: 'browser' })).rejects.toThrow('parciais');
    expect((await store.getData('owner')).snapshots).toEqual([]);
  });
});

describe('registro durável de ações', () => {
  it('bloqueia protegido, tentativa repetida e resultado incerto', async () => {
    await store.setProtected('owner', 'friend', true);
    await expect(store.logAction(action())).rejects.toThrow('protegido');
    await store.setProtected('owner', 'friend', false);
    const record = action();
    await store.logAction(record);
    await expect(store.logAction(action())).rejects.toThrow('resultado incerto');
    await store.logAction({ ...record, status: 'uncertain', message: 'Não foi possível verificar' });
    await expect(store.logAction(action())).rejects.toThrow('resultado incerto');
    expect((await store.getData('owner')).actions).toHaveLength(1);
    expect((await store.getData('owner')).actions[0]?.status).toBe('uncertain');
  });

  it('serializa tentativas concorrentes e não sobrescreve uma operação encerrada', async () => {
    const one = action();
    const two = action();
    const results = await Promise.allSettled([store.logAction(one), store.logAction(two)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const winner = (await store.getData('owner')).actions[0]!;
    await store.logAction({ ...winner, status: 'verified', message: 'Verificado na página' });
    await expect(store.logAction({ ...winner, status: 'uncertain' })).rejects.toThrow('encerrada');
    await store.logAction(action());
    expect((await store.getData('owner')).actions).toHaveLength(2);
  });
});
