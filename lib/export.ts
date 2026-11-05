import type { AccountData } from './types';

export function exportData(data: AccountData): string {
  return JSON.stringify({ schema: 'elo-tiktok/1', exportedAt: new Date().toISOString(), ...data }, null, 2);
}

// Adaptado de elo Instagram / IgDiff (MIT). Avisos completos em THIRD-PARTY-NOTICES.txt.
export function csvField(value: string | number | boolean): string {
  let text = String(value);
  // Nomes de exibição são controlados por terceiros e planilhas interpretam fórmulas.
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | boolean>>): string {
  return [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function exportCsv(data: AccountData): string {
  const latest = data.snapshots.at(-1);
  const rows: Array<Array<string | boolean>> = [];
  if (latest) {
    const followers = new Set(latest.followers.map(profile => profile.username));
    const following = new Set(latest.following.map(profile => profile.username));
    const all = new Map([...latest.followers, ...latest.following].map(profile => [profile.username, profile]));
    for (const profile of all.values()) rows.push([
      data.account, new Date(latest.capturedAt).toISOString(), new Date(latest.importedAt).toISOString(), latest.complete,
      profile.username, profile.displayName ?? '', `https://www.tiktok.com/@${profile.username}`,
      followers.has(profile.username), following.has(profile.username), data.protected.includes(profile.username),
      latest.followingCollection?.complete ?? latest.complete,
    ]);
  }
  return '\uFEFF' + toCsv(['conta', 'data_do_pacote', 'detectado_em', 'listas_completas_confirmadas', 'usuario', 'nome', 'perfil', 'seguidor', 'seguindo', 'protegido', 'seguindo_completo'], rows);
}
