import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { compareSnapshots, normalizeUsername } from './import';
import type { AccountData, ActionRecord, Snapshot } from './types';

interface TrackerDatabase extends DBSchema {
  accounts: { key: string; value: AccountData };
}

const emptyAccount = (account: string): AccountData => ({ account, snapshots: [], protected: [], actions: [], changes: [] });

function validateSnapshot(snapshot: Snapshot): void {
  if (!snapshot || typeof snapshot.id !== 'string' || !snapshot.id || snapshot.id.length > 100 || normalizeUsername(snapshot.account) !== snapshot.account) throw new Error('Análise ou conta inválida.');
  if (!Number.isFinite(snapshot.capturedAt) || snapshot.capturedAt <= 0 || snapshot.capturedAt > Date.now() || !Number.isFinite(snapshot.importedAt) || snapshot.importedAt < snapshot.capturedAt || snapshot.importedAt > Date.now()) throw new Error('A análise contém uma data inválida ou futura.');
  if (!['official-json', 'official-txt', 'elo-json', 'browser'].includes(snapshot.source) || typeof snapshot.complete !== 'boolean' || !/^[a-f0-9]{64}$/.test(snapshot.fingerprint)) throw new Error('A origem, completude ou identidade da análise é inválida.');
  if (snapshot.source === 'browser' && snapshot.complete) throw new Error('Listas coletadas no navegador não têm completude verificada e devem permanecer parciais.');
  if (snapshot.followingCollection) {
    const evidence = snapshot.followingCollection;
    if (snapshot.source !== 'browser' || typeof evidence.complete !== 'boolean' || (evidence.expected !== null && (!Number.isSafeInteger(evidence.expected) || evidence.expected < 0)) || (evidence.complete && evidence.expected !== snapshot.following.length)) throw new Error('A comprovação da lista Seguindo é inválida.');
  }
  for (const list of [snapshot.followers, snapshot.following]) {
    if (!Array.isArray(list) || list.length > 1_000_000) throw new Error('A análise contém uma lista inválida.');
    const seen = new Set<string>();
    for (const profile of list) {
      if (!profile || normalizeUsername(profile.username) !== profile.username || seen.has(profile.username) || (profile.displayName !== undefined && (typeof profile.displayName !== 'string' || profile.displayName.length > 500))) throw new Error('A análise contém nomes inválidos ou duplicados.');
      seen.add(profile.username);
    }
  }
}

export class TrackerStore {
  private constructor(private readonly db: IDBPDatabase<TrackerDatabase>) {}

  static async open(): Promise<TrackerStore> {
    return new TrackerStore(await openDB<TrackerDatabase>('elo-tiktok', 1, {
      upgrade(db) { db.createObjectStore('accounts', { keyPath: 'account' }); },
    }));
  }

  close(): void { this.db.close(); }

  async listAccounts(): Promise<string[]> { return (await this.db.getAllKeys('accounts')).sort(); }

  async getData(account: string): Promise<AccountData> {
    const username = normalizeUsername(account);
    return await this.db.get('accounts', username) ?? emptyAccount(username);
  }

  async saveSnapshot(snapshot: Snapshot): Promise<void> {
    validateSnapshot(snapshot);
    const transaction = this.db.transaction('accounts', 'readwrite');
    const data = await transaction.store.get(snapshot.account) ?? emptyAccount(snapshot.account);
    try {
      if (data.snapshots.some(item => item.id === snapshot.id || item.fingerprint === snapshot.fingerprint)) throw new Error('Este arquivo ou análise já foi importado nesta conta.');
      const latest = data.snapshots.at(-1);
      if (latest && snapshot.capturedAt <= latest.capturedAt) throw new Error('Importe um pacote com data posterior à última análise. Arquivos antigos ou fora de ordem não alteram o histórico.');
      const previous = [...data.snapshots].reverse().find(item => item.complete);
      if (previous) {
        const changes = compareSnapshots(previous, snapshot);
        if (changes) data.changes.push(changes);
      }
      data.snapshots.push(snapshot);
      await transaction.store.put(data);
      await transaction.done;
    } catch (error) {
      try { transaction.abort(); } catch { /* A transação pode já ter sido abortada pelo IndexedDB. */ }
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }

  async setProtected(account: string, username: string, protect: boolean): Promise<void> {
    const owner = normalizeUsername(account);
    const target = normalizeUsername(username);
    if (typeof protect !== 'boolean') throw new Error('Estado de proteção inválido.');
    const transaction = this.db.transaction('accounts', 'readwrite');
    const data = await transaction.store.get(owner) ?? emptyAccount(owner);
    const protectedAccounts = new Set(data.protected);
    if (protect) protectedAccounts.add(target); else protectedAccounts.delete(target);
    data.protected = [...protectedAccounts].sort();
    await Promise.all([transaction.store.put(data), transaction.done]);
  }

  async logAction(record: ActionRecord): Promise<void> {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 100 || normalizeUsername(record.account) !== record.account || normalizeUsername(record.target) !== record.target || !Number.isFinite(record.at) || record.at <= 0 || record.at > Date.now() || !['attempting', 'verified', 'uncertain', 'blocked', 'cancelled'].includes(record.status) || typeof record.message !== 'string' || record.message.length > 2000) throw new Error('Registro de ação inválido.');
    const transaction = this.db.transaction('accounts', 'readwrite');
    const data = await transaction.store.get(record.account) ?? emptyAccount(record.account);
    try {
      const existingIndex = data.actions.findIndex(item => item.id === record.id);
      const existing = data.actions[existingIndex];
      if (existing && (existing.account !== record.account || existing.target !== record.target)) throw new Error('O registro desta operação pertence a outro perfil.');
      if (record.status === 'attempting') {
        if (data.protected.includes(record.target)) throw new Error('Este perfil está protegido.');
        if (data.actions.some(item => item.target === record.target && ['attempting', 'uncertain'].includes(item.status))) throw new Error('Há uma tentativa em andamento ou com resultado incerto para este perfil. Confira manualmente no TikTok; a operação não será repetida.');
      }
      if (existing && existing.status !== 'attempting') throw new Error('Esta operação já foi encerrada e não pode ser reescrita.');
      if (existingIndex >= 0) data.actions[existingIndex] = record; else data.actions.push(record);
      await transaction.store.put(data);
      await transaction.done;
    } catch (error) {
      try { transaction.abort(); } catch { /* A transação pode já ter sido abortada pelo IndexedDB. */ }
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }
}
