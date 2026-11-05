import { normalizeUsername } from './import';
import type { CaptureResult, ListKind, TikTokStatus, UnfollowResult } from './messages';
import type { Profile } from './types';

const OWN_LINKS = 'a[data-e2e="nav-profile"], a[data-e2e="bottom-nav-profile"], a[data-e2e="profile-icon"]';
const LISTS = '[data-e2e="follow-info-popup"], [role="dialog"], dialog';
const ROWS = '[data-e2e="follow-user"]';
const FOLLOWING = /^(following|friends|seguindo|amigos)$/;
const FOLLOW = /^(follow|follow back|seguir|seguir de volta)$/;
const UNFOLLOW = /^(unfollow|deixar de seguir)$/;
const label = (node: Element): string => (node.textContent ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

export function isVisible(node: Element): boolean {
  const win = node.ownerDocument.defaultView;
  if (!win || !node.isConnected) return false;
  for (let current: Element | null = node; current; current = current.parentElement) {
    const style = win.getComputedStyle(current);
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  }
  return node.getClientRects().length > 0;
}

export function visible(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector)).filter(isVisible);
}

function handleFromHref(href: string | null, currentUrl: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, currentUrl);
    if (url.origin !== 'https://www.tiktok.com' || !/^\/@[^/]+\/?$/.test(url.pathname)) return null;
    return normalizeUsername(url.pathname.slice(2).replace(/\/$/, ''));
  } catch { return null; }
}

export function currentProfile(currentUrl: string): string | null {
  return handleFromHref(currentUrl, currentUrl);
}

export function requireRenderedProfile(doc: Document, currentUrl: string, expected: string): void {
  const titles = visible(doc, '[data-e2e="user-title"]');
  const subtitles = visible(doc, '[data-e2e="user-subtitle"]');
  if (titles.length > 1 || subtitles.length > 1) throw new Error('O identificador visível do perfil está ambíguo. Nenhuma ação foi enviada.');
  const username = (node?: Element): string | null => {
    if (!node) return null;
    try { return normalizeUsername((node.textContent ?? '').trim()); }
    catch { return null; }
  };
  // Em layouts atuais o título pode ser o apelido; o subtítulo contém o @usuário.
  const rendered = subtitles.length ? username(subtitles[0]) : username(titles[0]);
  if (!rendered) throw new Error('Não foi encontrado um identificador visível do perfil neste layout do TikTok. Nenhuma ação foi enviada.');
  if (currentProfile(currentUrl) !== expected || rendered !== expected) throw new Error('O identificador visível do perfil não corresponde ao endereço. Aguarde o perfil terminar de carregar e revise novamente.');
}

export function connectedAccount(doc: Document, currentUrl: string): string | null {
  const handles = new Set(visible(doc, OWN_LINKS).map(node => handleFromHref(node.getAttribute('href'), currentUrl)).filter((value): value is string => value !== null));
  return handles.size === 1 ? [...handles][0]! : null;
}

export function blockingReason(doc: Document): string | null {
  if (visible(doc, '[id*="captcha" i], [class*="captcha" i], iframe[src*="captcha" i], [data-e2e="verify-center"], [data-e2e="security-check"]' ).length) {
    return 'Desafio de segurança detectado. Resolva-o manualmente no TikTok; a operação foi interrompida.';
  }
  if (visible(doc, '[data-e2e="top-login-button"], [data-e2e="login-button"]' ).length) return 'A sessão do TikTok não está autenticada.';
  const text = (doc.body?.innerText ?? doc.body?.textContent ?? '').toLowerCase();
  if (/too many (?:attempts|requests)|following too fast|you(?:'|’)?re following too fast|try again later|suspicious activity|account (?:was |is )?suspended|tentativas demais|muitas tentativas|seguindo (?:muito |rápido )?rápido|tente novamente mais tarde|atividade suspeita|conta (?:foi |está )?suspensa|verify (?:that )?you are human|verifique se voc[eê] [eé] humano/.test(text)) {
    return 'O TikTok exibiu um bloqueio ou aviso de segurança. A operação foi interrompida.';
  }
  return null;
}

export function requireSession(doc: Document, currentUrl: string, expected?: string, requireVisible = false): string {
  if (new URL(currentUrl).origin !== 'https://www.tiktok.com') throw new Error('Abra uma página de https://www.tiktok.com.');
  const blocked = blockingReason(doc);
  if (blocked) throw new Error(blocked);
  const account = connectedAccount(doc, currentUrl);
  if (!account) throw new Error('Não foi possível identificar com segurança a conta conectada pelo menu Perfil. Abra o TikTok autenticado e recarregue a página.');
  if (expected && account !== expected) throw new Error('A conta conectada mudou. Revise a seleção novamente.');
  if (requireVisible && doc.visibilityState !== 'visible') throw new Error('Mantenha a aba do TikTok visível durante a ação.');
  return account;
}

export function listKind(list: Element): ListKind | null {
  const explicit = [list.getAttribute('aria-label') ?? '', ...visible(list, '[role="tab"][aria-selected="true"], [role="heading"], h1, h2, h3').map(node => node.textContent ?? '')];
  const kinds = new Set(explicit.map(text => text.trim().replace(/\s+[\d.,kKmM]+$/, '').toLowerCase()).flatMap(text => text === 'followers' || text === 'seguidores' ? ['followers' as const] : text === 'following' || text === 'seguindo' ? ['following' as const] : []));
  return kinds.size === 1 ? [...kinds][0]! : null;
}

function ownList(doc: Document, currentUrl: string, account: string, kind?: ListKind): Element {
  if (currentProfile(currentUrl) !== account) throw new Error('Abra a lista no perfil da própria conta conectada.');
  requireRenderedProfile(doc, currentUrl, account);
  const candidates = visible(doc, LISTS).filter(node => visible(node, ROWS).length > 0);
  const lists = candidates.filter(node => !candidates.some(other => node !== other && node.contains(other)));
  if (lists.length !== 1) throw new Error('Abra uma única lista de Seguidores ou Seguindo no seu perfil TikTok.');
  const actualKind = listKind(lists[0]!);
  if (!actualKind || (kind && actualKind !== kind)) throw new Error('Não foi possível confirmar o tipo da lista aberta pelo título ou aba selecionada. Não foram coletados dados nem executadas ações.');
  return lists[0]!;
}

export function rowProfile(row: Element, currentUrl: string): Profile | null {
  const links = visible(row, 'a[href]');
  const handles = new Set(links.map(link => handleFromHref(link.getAttribute('href'), currentUrl)).filter((value): value is string => value !== null));
  if (handles.size !== 1) return null;
  const username = [...handles][0]!;
  const displayName = (visible(row, '[data-e2e="follow-user-nickname"]')[0]?.textContent ?? '').trim();
  return { username, ...(displayName ? { displayName } : {}) };
}

export function captureVisibleList(doc: Document, currentUrl: string, kind: ListKind): CaptureResult {
  if (kind !== 'followers' && kind !== 'following') throw new Error('Tipo de lista inválido.');
  const account = requireSession(doc, currentUrl);
  const list = ownList(doc, currentUrl, account, kind);
  const profiles = new Map<string, Profile>();
  for (const row of visible(list, ROWS)) {
    const profile = rowProfile(row, currentUrl);
    if (!profile) throw new Error('Uma linha da lista não identifica um perfil único. Captura interrompida.');
    profiles.set(profile.username, profile);
  }
  if (!profiles.size) throw new Error('Nenhum perfil carregado na lista aberta.');
  return {
    account,
    profiles: [...profiles.values()],
    complete: false,
    notice: 'Captura parcial: somente linhas já carregadas na lista aberta. A extensão não rola nem consulta endpoints. Use a importação oficial para análises completas; esta captura nunca comprova perdas de seguidores.',
  };
}

function relationshipButton(doc: Document, currentUrl: string, account: string, target: string): HTMLButtonElement {
  let roots: Element[];
  if (currentProfile(currentUrl) === target && target !== account) {
    requireRenderedProfile(doc, currentUrl, target);
    roots = visible(doc, 'button[data-e2e="follow-button"]').filter(node => !node.closest(ROWS));
  } else {
    const list = ownList(doc, currentUrl, account, 'following');
    const rows = visible(list, ROWS).filter(row => rowProfile(row, currentUrl)?.username === target);
    if (rows.length !== 1) throw new Error(`@${target} precisa estar carregado uma única vez na lista Seguindo aberta.`);
    roots = visible(rows[0]!, 'button[data-e2e="follow-button"]');
  }
  if (roots.length !== 1 || roots[0]!.tagName !== 'BUTTON') throw new Error(`Não há um botão inequívoco para @${target}. Nenhuma ação foi enviada.`);
  const button = roots[0] as HTMLButtonElement;
  if (button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error(`O botão de @${target} está desabilitado.`);
  return button;
}

export function ensureTargets(doc: Document, currentUrl: string, account: string, targets: string[]): void {
  requireSession(doc, currentUrl, account);
  for (const target of targets) {
    if (target === account || normalizeUsername(target) !== target) throw new Error('Seleção inválida.');
    if (!FOLLOWING.test(label(relationshipButton(doc, currentUrl, account, target)))) throw new Error(`O TikTok não mostra um botão Seguindo/Amigos inequívoco para @${target}.`);
  }
}

export function readTikTokStatus(doc: Document, currentUrl: string): TikTokStatus {
  const account = connectedAccount(doc, currentUrl);
  const blocked = blockingReason(doc);
  const profile = currentProfile(currentUrl);
  let canUnfollow = false;
  if (account && !blocked) {
    try {
      if (profile && profile !== account) canUnfollow = FOLLOWING.test(label(relationshipButton(doc, currentUrl, account, profile)));
      else {
        const list = ownList(doc, currentUrl, account, 'following');
        canUnfollow = visible(list, ROWS).some(row => {
          const target = rowProfile(row, currentUrl)?.username;
          return !!target && target !== account && FOLLOWING.test(label(relationshipButton(doc, currentUrl, account, target)));
        });
      }
    } catch { /* A list or a following button is optional for read-only status. */ }
  }
  return { account, blocked, profile, canUnfollow };
}

export async function performUnfollow(doc: Document, getUrl: () => string, account: string, target: string, controls: {
  authorize: () => Promise<void>;
  cancelled: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<UnfollowResult> {
  let clicked = false;
  const initialUrl = getUrl();
  const initialProfile = currentProfile(initialUrl);
  const pause = controls.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  function checkContext(): void {
    if (getUrl() !== initialUrl) throw new Error('A página mudou durante a ação. Confira o resultado manualmente.');
    requireSession(doc, getUrl(), account, true);
    if (!initialProfile) throw new Error('Abra o perfil da sua conta ou do alvo selecionado.');
    requireRenderedProfile(doc, getUrl(), initialProfile);
  }
  async function guard(): Promise<void> {
    if (controls.cancelled()) throw new Error('Operação cancelada.');
    checkContext();
    await controls.authorize();
    if (controls.cancelled()) throw new Error('Operação cancelada.');
    checkContext();
  }
  try {
    await guard();
    if (visible(doc, '[data-e2e="unfollow-confirm"]').length) throw new Error('Feche a confirmação já aberta no TikTok antes de revisar uma nova ação.');
    const button = relationshipButton(doc, getUrl(), account, target);
    if (!FOLLOWING.test(label(button))) throw new Error(`O estado de @${target} mudou. Revise novamente.`);
    clicked = true;
    button.click();
    let confirmationClicked = false;
    let followObservations = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      await pause(250);
      checkContext();
      if (controls.cancelled()) throw new Error('Cancelamento solicitado após o início. Confira o resultado manualmente.');
      const confirmations = visible(doc, '[data-e2e="unfollow-confirm"]').filter(node => node.tagName === 'BUTTON' && UNFOLLOW.test(label(node)));
      if (confirmations.length > 1) throw new Error('Há mais de uma confirmação de deixar de seguir. Confira manualmente.');
      if (confirmations.length === 1 && !confirmationClicked) {
        await guard();
        const confirm = confirmations[0] as HTMLButtonElement;
        if (!isVisible(confirm) || confirm.disabled) throw new Error('A confirmação mudou ou ficou indisponível. Confira manualmente.');
        const dialog = confirm.closest('[role="dialog"], dialog');
        const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namedTarget = new RegExp(`@${escapedTarget}(?![a-z0-9._])`, 'i');
        if (!dialog || dialog.matches('[data-e2e="follow-info-popup"]') || dialog.querySelector(ROWS) || listKind(dialog) !== null || !namedTarget.test(dialog.textContent ?? '') || !FOLLOWING.test(label(relationshipButton(doc, getUrl(), account, target)))) throw new Error('A confirmação não identifica claramente o perfil selecionado em um diálogo separado. Confira e conclua manualmente no TikTok; a extensão não confirmará este diálogo.');
        confirmationClicked = true;
        confirm.click();
        continue;
      }
      const updated = relationshipButton(doc, getUrl(), account, target);
      if (FOLLOW.test(label(updated)) && confirmations.length === 0) {
        followObservations++;
        if (followObservations >= 4) return { status: 'verified', message: `O botão de @${target} permaneceu em Seguir durante quatro verificações de 250 ms. Resultado observado na interface; nenhuma resposta de servidor foi consultada.` };
      } else if (followObservations > 0) throw new Error(`O botão de @${target} mudou novamente após indicar Seguir. O resultado é incerto; confira manualmente, sem repetir a ação.`);
    }
    return { status: 'uncertain', message: `O resultado de @${target} não pôde ser confirmado. Não tente novamente pela extensão; confira manualmente no TikTok.` };
  } catch (error) {
    return { status: clicked ? 'uncertain' : controls.cancelled() ? 'cancelled' : 'blocked', message: error instanceof Error ? error.message : 'Ação interrompida.' };
  }
}
