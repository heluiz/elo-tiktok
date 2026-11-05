import { diffSnapshots } from './diff';
import type { ChangeSet, ImportDraft, Profile, Snapshot } from './types';

const MAX_INPUT = 100 * 1024 * 1024;
const DELAY_NOTICE = 'O TikTok informa que os dados das últimas 24–48 horas podem não aparecer no pacote. A data registrada será a de detecção, não a data exata da mudança.';
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeUsername(value: string): string {
  if (typeof value !== 'string') throw new Error('Nome de usuário inválido.');
  let username = value.trim();
  if (/^https?:\/\//i.test(username)) {
    const url = new URL(username);
    if (url.protocol !== 'https:' || !['tiktok.com', 'www.tiktok.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/@[^/]+\/?$/.test(url.pathname)) {
      throw new Error('Use um nome de usuário ou um endereço de perfil do TikTok.');
    }
    username = url.pathname.slice(2).replace(/\/$/, '');
  } else username = username.replace(/^@/, '');
  username = username.toLowerCase();
  if (!/^[a-z0-9._]{1,24}$/.test(username) || !/[a-z0-9_]/.test(username) || username.endsWith('.')) {
    throw new Error(`Nome de usuário inválido: ${String(value).slice(0, 60)}`);
  }
  return username;
}

function profiles(value: unknown): Profile[] {
  if (!Array.isArray(value)) throw new Error('a lista não é um array');
  if (value.length > 1_000_000) throw new Error('lista grande demais');
  const seen = new Set<string>();
  return value.map((row, index) => {
    if (!object(row)) throw new Error(`registro ${index + 1} inválido`);
    const candidates = ['UserName', 'Username', 'username', 'userName'].filter(key => Object.hasOwn(row, key)).map(key => row[key]);
    if (!candidates.length || candidates.some(item => typeof item !== 'string')) throw new Error(`registro ${index + 1} sem nome de usuário válido`);
    const username = normalizeUsername(candidates[0] as string);
    if (candidates.some(item => normalizeUsername(item as string) !== username)) throw new Error(`registro ${index + 1} com nomes conflitantes`);
    if (seen.has(username)) throw new Error(`nome duplicado: @${username}`);
    seen.add(username);
    if (row.displayName !== undefined && (typeof row.displayName !== 'string' || row.displayName.length > 500)) throw new Error(`nome de exibição inválido: @${username}`);
    return { username, ...(typeof row.displayName === 'string' ? { displayName: row.displayName } : {}) };
  });
}

function profileAccount(value: unknown): string | null {
  if (!object(value)) return null;
  const values = ['Username', 'UserName', 'userName', 'username'].filter(key => Object.hasOwn(value, key)).map(key => value[key]);
  if (!values.length) return null;
  if (values.some(item => typeof item !== 'string')) throw new Error('O perfil do pacote contém nome de conta inválido.');
  const username = normalizeUsername(values[0] as string);
  if (values.some(item => normalizeUsername(item as string) !== username)) throw new Error('O perfil do pacote contém contas conflitantes.');
  return username;
}

export function parseOfficialFiles(files: { name: string; text: string }[]): ImportDraft {
  if (!files.length) throw new Error('Selecione os arquivos JSON ou TXT extraídos do pacote do TikTok.');
  if (files.length > 500 || files.reduce((sum, file) => sum + file.text.length, 0) > MAX_INPUT) throw new Error('Importação acima do limite de 100 MB ou 500 arquivos.');
  const names = new Set<string>();
  const draft: ImportDraft = { account: null, followers: null, following: null, source: 'official-json', warnings: [] };
  const found = new Set<'followers' | 'following'>();
  let recognized = false;
  let elo = false;
  const expectedCounts: Record<'followers' | 'following', number[]> = { followers: [], following: [] };
  const profileInfo = (value: ObjectValue) => {
    account(profileAccount(value));
    for (const [kind, keys] of [['followers', ['Follower Count', 'followerCount']], ['following', ['Following Count', 'followingCount']]] as const) {
      for (const key of keys) {
        const raw = value[key];
        const count = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
        if (Number.isSafeInteger(count) && count >= 0) expectedCounts[kind].push(count);
      }
    }
  };
  const account = (value: string | null) => {
    if (!value) return;
    if (draft.account && draft.account !== value) throw new Error('Os arquivos pertencem a contas diferentes. Importe uma conta de cada vez.');
    draft.account = value;
    recognized = true;
  };
  const list = (kind: 'followers' | 'following', value: unknown) => {
    if (found.has(kind)) throw new Error(`Há mais de uma lista de ${kind === 'followers' ? 'seguidores' : 'seguindo'}. Selecione um único pacote.`);
    found.add(kind);
    recognized = true;
    try { draft[kind] = profiles(value); }
    catch (error) { draft.warnings.push(`Lista de ${kind === 'followers' ? 'seguidores' : 'seguindo'} inválida: ${(error as Error).message}. Ela não poderá ser marcada como completa.`); }
  };
  for (const file of files) {
    if (typeof file.name !== 'string' || typeof file.text !== 'string') throw new Error('Arquivo inválido.');
    const name = file.name.replace(/\\/g, '/').toLowerCase();
    const text = file.text.replace(/^\uFEFF/, '');
    if (names.has(name)) throw new Error('O mesmo arquivo foi selecionado mais de uma vez.');
    names.add(name);
    if (name.endsWith('.json')) {
      let data: unknown;
      try { data = JSON.parse(text); } catch { throw new Error(`JSON inválido em ${file.name}.`); }
      if (!object(data)) throw new Error(`Formato JSON não reconhecido em ${file.name}.`);
      if (data.schema === 'elo-tiktok/1') {
        if (files.length !== 1) throw new Error('Importe uma exportação elo por vez.');
        if (!Array.isArray(data.snapshots) || !data.snapshots.length || typeof data.account !== 'string') throw new Error('Exportação elo sem análise ou conta válida.');
        const snapshots = data.snapshots;
        if (snapshots.some(s => !object(s) || !Number.isFinite(s.capturedAt) || typeof s.account !== 'string' || normalizeUsername(s.account) !== normalizeUsername(data.account as string))) throw new Error('Exportação elo com análises inválidas ou de outra conta.');
        const latest = [...snapshots].sort((a, b) => Number(b.capturedAt) - Number(a.capturedAt))[0] as ObjectValue;
        account(normalizeUsername(data.account));
        list('followers', latest.followers);
        list('following', latest.following);
        draft.capturedAt = latest.capturedAt as number;
        draft.completionBlocked = latest.complete !== true;
        if (draft.completionBlocked) draft.warnings.push('A análise exportada era parcial. Ela continuará parcial após a importação.');
        draft.warnings.push('A exportação elo importa somente a análise mais recente. Confirme novamente a conta, a data e a completude; proteções, histórico e ações não são restaurados.');
        elo = true;
        continue;
      }
      const categories: ObjectValue[] = [data];
      for (const key of ['Profile', 'Profile And Settings', 'Activity']) if (object(data[key])) categories.push(data[key] as ObjectValue);
      for (const category of categories) {
        for (const [kind, keys, child] of [
          ['followers', ['Follower List', 'Follower'], 'FansList'],
          ['following', ['Following List', 'Following'], 'Following'],
        ] as const) {
          for (const key of keys) if (Object.hasOwn(category, key)) {
            const section = category[key];
            list(kind, object(section) ? section[child] : undefined);
          }
        }
        for (const key of ['Profile Information', 'Profile Info']) {
          if (!object(category[key])) continue;
          const section = category[key] as ObjectValue;
          profileInfo(object(section.ProfileMap) ? section.ProfileMap : section);
        }
      }
    } else if (name.endsWith('.txt')) {
      const base = name.slice(name.lastIndexOf('/') + 1);
      const kind = /^(follower|follower list|followers)\.txt$/.test(base) ? 'followers' : /^(following|following list)\.txt$/.test(base) ? 'following' : null;
      if (kind) {
        // shortcut: TXT aceita apenas rótulos conhecidos em inglês; novos formatos precisam de uma amostra verificada.
        const rows: ObjectValue[] = [];
        let invalid = false;
        let dates = 0;
        for (const line of text.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
          const match = /^(?:UserName|Username):\s*(.*)$/i.exec(line);
          if (match) rows.push({ username: match[1] });
          else if (/^Date:\s*\S.*$/i.test(line)) dates++;
          else invalid = true;
        }
        list(kind, invalid || !rows.length || dates !== rows.length ? undefined : rows);
      } else if (/^profile (info|information)\.txt$/.test(base)) {
        const matches = [...text.matchAll(/^(?:UserName|Username):\s*(.*?)\s*$/gim)];
        for (const match of matches) account(normalizeUsername(match[1] ?? ''));
        const fields: ObjectValue = {};
        for (const match of text.matchAll(/^(Follower Count|Following Count):\s*(.*?)\s*$/gim)) fields[match[1]?.toLowerCase().startsWith('follower') ? 'Follower Count' : 'Following Count'] = match[2];
        profileInfo(fields);
      }
      draft.source = 'official-txt';
    }
  }
  if (!recognized) throw new Error('Não encontrei listas ou informações de perfil em um formato conhecido. Use os arquivos JSON ou TXT oficiais extraídos.');
  for (const kind of ['followers', 'following'] as const) {
    const list = draft[kind];
    if (list && expectedCounts[kind].some(count => count !== list.length)) {
      draft.completionBlocked = true;
      draft.warnings.push(`A contagem de ${kind === 'followers' ? 'seguidores' : 'seguindo'} informada no perfil difere da lista (${list.length} registros). Esta análise continuará parcial.`);
    }
  }
  if (!draft.followers) draft.warnings.push('A lista de seguidores está ausente ou inválida; não conclua que alguém deixou de seguir.');
  if (!draft.following) draft.warnings.push('A lista de seguindo está ausente ou inválida; esta análise será parcial.');
  if (!draft.account) draft.warnings.push('A conta não foi encontrada nas informações de perfil. Informe e confira o seu próprio @usuário; não use o nome de um seguidor.');
  draft.source = elo ? 'elo-json' : draft.source;
  draft.warnings.push(DELAY_NOTICE);
  // A identidade do arquivo não depende da data digitada pelo usuário.
  draft.inputFingerprint = JSON.stringify(files.map(file => file.text.replace(/^\uFEFF/, '')).sort());
  return draft;
}

export async function makeSnapshot(draft: ImportDraft, options: { account: string; capturedAt: number; confirmedComplete: boolean }): Promise<Snapshot> {
  const account = normalizeUsername(options.account);
  if (draft.account && normalizeUsername(draft.account) !== account) throw new Error('A conta informada difere da conta identificada no pacote.');
  if (!Number.isFinite(options.capturedAt) || options.capturedAt <= 0 || options.capturedAt > Date.now()) throw new Error('A data do pacote deve ser válida e não pode estar no futuro.');
  const followers = profiles(draft.followers ?? []);
  const following = profiles(draft.following ?? []);
  if (options.confirmedComplete && (!draft.followers || !draft.following || draft.completionBlocked)) throw new Error('Só é possível confirmar uma análise completa com ambas as listas presentes e válidas e uma origem que permita confirmar completude.');
  const content = draft.inputFingerprint ?? JSON.stringify({ account, followers, following, capturedAt: options.capturedAt });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return {
    id: crypto.randomUUID(), account, capturedAt: options.capturedAt, importedAt: Date.now(), source: draft.source,
    complete: options.confirmedComplete && draft.followers !== null && draft.following !== null,
    followers, following, fingerprint: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''),
  };
}

export function compareSnapshots(previous: Snapshot, current: Snapshot): ChangeSet | null {
  if (!previous.complete || !current.complete || previous.account !== current.account || previous.capturedAt >= current.capturedAt) return null;
  const sets = (snapshot: Snapshot) => ({ followerIds: snapshot.followers.map(p => p.username), followingIds: snapshot.following.map(p => p.username) });
  const changes = diffSnapshots(sets(previous), sets(current));
  return {
    snapshotId: current.id, previousId: previous.id, detectedAt: current.importedAt,
    followersGained: [...changes.followersGained], followersLost: [...changes.followersLost],
    followingAdded: [...changes.followingAdded], followingRemoved: [...changes.followingRemoved],
  };
}
