import { normalizeUsername } from './import';
import { isVisible, listKind, requireRenderedProfile, requireSession, rowProfile, visible } from './tiktok';
import type { Profile } from './types';

const LISTS = '[data-e2e="follow-info-popup"], [role="dialog"], dialog';
const POPUPS = '[data-e2e="follow-info-popup"]';
const ROWS = '[data-e2e="follow-user"]';
const MAX_SCROLLS = 5000;
const MAX_DURATION = 30 * 60_000;
const NO_GROWTH_LIMIT = 5;

export interface CollectProgress {
  account: string;
  collected: number;
  expected: number | null;
  scrolls: number;
  message: string;
}
export interface FollowingCollection {
  account: string;
  profiles: Profile[];
  complete: boolean;
  expected: number | null;
  notice: string;
  capturedAt: number;
}
export interface CollectionControls {
  cancelled: () => boolean;
  onProgress: (progress: CollectProgress) => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export function exactFollowingCount(doc: Document): number | null {
  const counters = visible(doc, '[data-e2e="following-count"]');
  if (counters.length !== 1) return null;
  const text = (counters[0]!.textContent ?? '').trim().replace(/[\u00a0\u202f]/g, ' ');
  const exact = /^\d+$/.test(text) || /^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/.test(text);
  if (!exact) return null;
  const count = Number(text.replace(/[., ]/g, ''));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function openFollowingList(doc: Document): Element | null {
  const candidates = visible(doc, LISTS).filter(node => listKind(node) === 'following');
  const lists = candidates.filter(node => !candidates.some(other => node !== other && node.contains(other)));
  if (lists.length > 1) throw new Error('Há mais de uma lista Seguindo aberta. Feche os diálogos extras.');
  return lists[0] ?? null;
}

function explicitFollowers(list: Element, currentUrl: string): boolean {
  const rows = profileRows(list, currentUrl);
  const texts = [list.getAttribute('aria-label') ?? '', ...visible(list, '[role="tab"][aria-selected="true"], [role="heading"], h1, h2, h3').filter(node => !rows.some(row => row.contains(node))).map(node => node.textContent ?? '')];
  return texts.some(text => /^(followers|seguidores)(?:\s+[\d.,kKmM]+)?$/i.test(text.trim()));
}

function profileRows(list: Element, currentUrl: string): Element[] {
  const tagged = visible(list, ROWS);
  const plain = visible(list, 'li').filter(row => {
    if (tagged.some(other => row === other || row.contains(other) || other.contains(row))) return false;
    const buttons = visible(row, 'button[data-e2e="follow-button"]');
    if (!buttons.some(button => /^(following|seguindo|friends|amigos)$/i.test((button.textContent ?? '').trim()))) return false;
    if (buttons.length !== 1 || !rowProfile(row, currentUrl)) throw new Error('Uma linha de Seguindo sem identificador contém botões ou perfis ambíguos.');
    return true;
  });
  return [...tagged, ...plain];
}

function selectedTabs(list: Element, currentUrl: string): string {
  const rows = profileRows(list, currentUrl);
  return JSON.stringify(visible(list, '[role="tab"], [aria-selected], [aria-current]').filter(node => !rows.some(row => row.contains(node))).map(node => [
    node.textContent?.trim(), node.getAttribute('aria-selected'), node.getAttribute('aria-current'), node.getAttribute('data-state'),
  ]));
}

function realScroller(list: Element, currentUrl: string): HTMLElement | null {
  const rows = profileRows(list, currentUrl);
  const win = list.ownerDocument.defaultView;
  if (!win || !rows.length) return null;
  const candidates = [list, ...list.querySelectorAll('*')].filter(node => {
    const style = win.getComputedStyle(node);
    return isVisible(node) && /^(auto|scroll|overlay)$/.test(style.overflowY) && node.clientHeight > 0 && node.scrollHeight > node.clientHeight && rows.every(row => node.contains(row));
  });
  const innermost = candidates.filter(node => !candidates.some(other => node !== other && node.contains(other)));
  if (innermost.length > 1) throw new Error('O contêiner rolável da lista é ambíguo. A leitura foi interrompida.');
  return (innermost[0] as HTMLElement | undefined) ?? null;
}

export async function collectFollowing(doc: Document, getUrl: () => string, account: string, controls: CollectionControls): Promise<FollowingCollection> {
  const normalized = normalizeUsername(account);
  if (normalized !== account) throw new Error('A conta da coleta deve estar normalizada.');
  const initialUrl = getUrl();
  const deadline = Date.now() + MAX_DURATION;
  const pause = controls.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const profiles = new Map<string, Profile>();
  let expected: number | null = null;
  let scrolls = 0;
  let list: Element | null = null;
  let causalPopup: Element | null = null;
  let initialTabs = '';
  let inputGuardArmed = false;
  let interacted = false;
  const onInput = () => { if (inputGuardArmed) interacted = true; };
  const inputs = ['pointerdown', 'click', 'keydown'] as const;
  for (const event of inputs) doc.addEventListener(event, onInput, true);

  function checkContext(): void {
    if (controls.cancelled()) throw new Error('Leitura cancelada.');
    if (interacted) throw new Error('Você interagiu com a aba do TikTok durante a leitura. Recomece a leitura e aguarde sem clicar ou digitar na aba TikTok.');
    if (getUrl() !== initialUrl) throw new Error('A página mudou durante a leitura.');
    requireSession(doc, getUrl(), account, true);
    requireRenderedProfile(doc, getUrl(), account);
    if (Date.now() >= deadline) throw new Error('A leitura atingiu o limite de 30 minutos.');
    const popups = visible(doc, POPUPS);
    if (popups.length > 1) throw new Error('Há mais de um popup de relacionamentos aberto. Feche os diálogos extras e recomece a leitura.');
    if (visible(doc, LISTS).some(node => explicitFollowers(node, getUrl()))) throw new Error('A página mostra Seguidores ou sinais conflitantes sobre o tipo da lista. Recomece a leitura de Seguindo.');
    if (list) {
      const sameList = causalPopup ? popups.length === 1 && popups[0] === causalPopup : openFollowingList(doc) === list;
      if (!isVisible(list) || !sameList) throw new Error('A lista Seguindo foi fechada, trocada ou substituída durante a leitura.');
      if (causalPopup) {
        const rows = profileRows(list, getUrl());
        for (const heading of visible(list, '[role="heading"], h1, h2, h3').filter(node => !rows.some(row => row.contains(node)))) {
          const text = (heading.textContent ?? '').trim();
          if (/^@[a-z0-9._]{1,24}$/i.test(text) && normalizeUsername(text) !== account) throw new Error('O popup identifica outra conta. Recomece a leitura no seu próprio perfil.');
        }
        if (selectedTabs(list, getUrl()) !== initialTabs) throw new Error('A aba selecionada do popup mudou durante a leitura. Recomece a leitura de Seguindo.');
      }
    }
  }
  function result(complete: boolean, notice: string): FollowingCollection {
    return { account, profiles: [...profiles.values()], complete, expected, notice, capturedAt: Date.now() };
  }
  async function progress(message: string): Promise<void> {
    await controls.onProgress({ account, collected: profiles.size, expected, scrolls, message });
    checkContext();
  }
  function readRows(): void {
    checkContext();
    if (!list) return;
    for (const row of profileRows(list, getUrl())) {
      const profile = rowProfile(row, getUrl());
      if (!profile || profile.username === account) throw new Error('Uma linha não identifica um perfil válido e único da lista Seguindo.');
      profiles.set(profile.username, profile);
    }
    if (expected !== null && profiles.size > expected) throw new Error('Foram encontrados mais perfis que o contador inicial. A lista mudou durante a leitura.');
  }
  function exactComplete(): boolean {
    checkContext();
    return expected !== null && exactFollowingCount(doc) === expected && profiles.size === expected;
  }

  try {
    checkContext();
    expected = exactFollowingCount(doc);
    if (expected === 0) {
      list = openFollowingList(doc);
      inputGuardArmed = true;
      readRows();
      await progress('O contador Seguindo mostra zero.');
      if (exactComplete()) return result(true, 'Lista Seguindo vazia confirmada por contador exato zero antes e depois da leitura. Nenhum perfil foi seguido ou deixado de seguir.');
      return result(false, 'O contador mudou durante a leitura. A lista permanece parcial.');
    }
    list = openFollowingList(doc);
    if (!list) {
      const before = new Set(visible(doc, POPUPS));
      if (before.size || visible(doc, LISTS).some(node => profileRows(node, getUrl()).length > 0)) throw new Error('Há um popup de relacionamentos já aberto sem identificação de Seguindo. Feche-o e recomece a leitura para o elo abrir Seguindo pelo contador.');
      const counters = visible(doc, '[data-e2e="following-count"]');
      if (counters.length !== 1 || typeof (counters[0] as HTMLElement).click !== 'function') throw new Error('Não foi encontrado um contador Seguindo único que permita abrir a lista. Abra Seguindo no seu perfil e tente novamente.');
      checkContext();
      (counters[0] as HTMLElement).click();
      inputGuardArmed = true;
      for (let attempt = 0; attempt < 20 && !list; attempt++) {
        await pause(250);
        checkContext();
        list = openFollowingList(doc);
        if (!list) {
          const opened = visible(doc, POPUPS).filter(node => !before.has(node));
          if (opened.length === 1) {
            // O clique no contador da própria conta vincula somente este popup recém-visível à leitura de Seguindo.
            causalPopup = opened[0]!;
            initialTabs = selectedTabs(causalPopup, getUrl());
            list = causalPopup;
            checkContext();
          }
        }
      }
      if (!list) throw new Error('Não foi possível reconhecer o popup de Seguindo aberto pelo contador. A leitura foi interrompida.');
    }
    inputGuardArmed = true;
    readRows();
    await progress('Lendo os perfis carregados na lista Seguindo… Mantenha a aba visível e aguarde sem interagir.');
    if (exactComplete()) return result(true, 'Todos os perfis do contador exato Seguindo foram lidos; o contador permaneceu igual antes e depois da leitura. A verificação usa a interface do TikTok, sem consultar endpoints.');
    let scroller = realScroller(list, getUrl());
    if (scroller && scroller.scrollTop !== 0) {
      scroller.scrollTop = 0;
      await pause(750);
      readRows();
    }
    let stagnant = 0;
    while (scrolls < MAX_SCROLLS) {
      checkContext();
      if (expected !== null && exactFollowingCount(doc) !== expected) throw new Error('O contador Seguindo mudou ou deixou de ser exato durante a leitura.');
      const before = profiles.size;
      scroller = realScroller(list, getUrl());
      if (scroller) scroller.scrollTop = Math.min(scroller.scrollTop + Math.max(1, Math.floor(scroller.clientHeight * 0.8)), scroller.scrollHeight - scroller.clientHeight);
      scrolls++;
      await pause(750);
      readRows();
      await progress(`Lidos ${profiles.size}${expected === null ? '' : ` de ${expected}`} perfis de Seguindo…`);
      if (exactComplete()) return result(true, 'Todos os perfis do contador exato Seguindo foram lidos; o contador permaneceu igual antes e depois da leitura. A verificação usa a interface do TikTok, sem consultar endpoints.');
      stagnant = profiles.size > before ? 0 : stagnant + 1;
      if (stagnant >= NO_GROWTH_LIMIT) return result(false, `Leitura parcial: a lista não apresentou novos perfis após cinco tentativas${scroller ? '' : ' e não foi encontrado um contêiner rolável da lista'}. ${expected === null ? 'O contador não é exato (ausente ou abreviado); o fim da rolagem não comprova completude.' : 'A quantidade lida não alcançou o contador exato.'} Nenhuma perda de seguidores pode ser concluída a partir desta leitura.`);
    }
    return result(false, 'Leitura parcial: limite de 5.000 tentativas de rolagem atingido. O fim da rolagem não comprova completude.');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'A leitura foi interrompida.';
    return result(false, `Leitura parcial: ${reason} Nenhuma perda de seguidores pode ser concluída a partir desta leitura.`);
  } finally { for (const event of inputs) doc.removeEventListener(event, onInput, true); }
}
