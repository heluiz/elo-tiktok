import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { normalizeUsername } from '../lib/import';
import { errorText, type ActionJob, type CollectionJob, type CollectionResult, type ContentMessage, type ManagerMessage, type Reply, type Review, type TikTokStatus, type UnfollowResult } from '../lib/messages';
import { TrackerStore } from '../lib/store';
import type { ActionRecord } from '../lib/types';

type Store = Pick<TrackerStore, 'getData' | 'logAction'>;
interface API {
  id: string;
  baseUrl: string;
  tabs: () => Promise<Array<{ id?: number; active?: boolean; url?: string }>>;
  send: (tabId: number, message: ContentMessage) => Promise<unknown>;
  activate: (tabId: number) => Promise<unknown>;
  navigate: (tabId: number, url: string) => Promise<unknown>;
  inject: (tabId: number) => Promise<unknown>;
  sleep?: (milliseconds: number) => Promise<void>;
}
type InternalMessage =
  | { type: 'tt-authorize'; operationId: string; account: string; target: string }
  | { type: 'tt-collection-progress'; operationId: string; account: string; collected: number; expected: number | null; message: string };

type NavigationListener = (tabId: number, change: { status?: string }, tab: { url?: string }) => void;
interface NavigationTabs {
  onUpdated: { addListener: (listener: NavigationListener) => void; removeListener: (listener: NavigationListener) => void };
  update: (tabId: number, properties: { url: string }) => Promise<unknown>;
}

export async function navigateTab(tabs: NavigationTabs, tabId: number, url: string, timeout = 20_000): Promise<void> {
  const expected = new URL(url);
  if (expected.origin !== 'https://www.tiktok.com' || !/^\/@[a-z0-9._]+\/?$/.test(expected.pathname)) throw new Error('Destino de navegação inválido.');
  let started = false;
  let timer: ReturnType<typeof setTimeout>;
  let listener: NavigationListener;
  const complete = new Promise<void>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('A página do TikTok não concluiu o carregamento. A operação foi interrompida.')), timeout);
    listener = (updatedId, change, tab) => {
      if (updatedId !== tabId) return;
      if (change.status === 'loading') started = true;
      if (!started || change.status !== 'complete') return;
      try {
        const loaded = new URL(tab.url ?? '');
        if (loaded.origin !== expected.origin || loaded.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) throw new Error('O TikTok redirecionou para outra página. Confira a conta antes de continuar.');
        resolve();
      } catch (error) { reject(error); }
    };
    tabs.onUpdated.addListener(listener);
  });
  try {
    // O status retornado por update pode pertencer ao documento antigo, inclusive na mesma URL.
    await Promise.all([tabs.update(tabId, { url }), complete]);
  } finally {
    clearTimeout(timer!);
    tabs.onUpdated.removeListener(listener!);
  }
}

export function createController(api: API, storage: Promise<Store>, now: () => number = Date.now) {
  let review: Review | null = null;
  let activeApproval: Review | null = null;
  let job: ActionJob | null = null;
  let collection: CollectionJob | null = null;
  let starting = false;
  let cancelSerial = 0;
  let cancelled = false;
  let currentAction: ActionRecord | null = null;
  const reconnecting = new Map<number, Promise<void>>();
  const connectionHelp = 'Não foi possível conectar o elo à aba do TikTok. No Chrome/Edge, permita à extensão acesso a www.tiktok.com e recarregue a página do TikTok. Depois clique em Conferir sessão.';
  const busy = () => starting || reconnecting.size > 0 || job?.state === 'running' || collection?.state === 'running';
  const sleep = api.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));

  async function pause(milliseconds: number): Promise<void> {
    for (let elapsed = 0; elapsed < milliseconds && !cancelled; elapsed += 100) await sleep(Math.min(100, milliseconds - elapsed));
    if (cancelled) throw new Error('Operação cancelada.');
  }

  async function request<T extends object>(tabId: number, message: ContentMessage): Promise<T> {
    const response = await api.send(tabId, message) as Reply<T>;
    if (!response?.ok) throw new Error(response?.error ?? 'Não foi possível conversar com a aba TikTok. Recarregue a página após instalar a extensão.');
    return response;
  }

  async function findTab(preferred?: number): Promise<number> {
    const tabs = (await api.tabs()).filter(tab => tab.id !== undefined && tab.url?.startsWith('https://www.tiktok.com/'));
    const tab = preferred === undefined ? tabs.find(item => item.active) ?? tabs[0] : tabs.find(item => item.id === preferred);
    if (!tab?.id) throw new Error('Abra uma aba do TikTok no navegador e entre na sua conta.');
    return tab.id;
  }

  async function status(tabId?: number, reconnect = false): Promise<TikTokStatus & { tabId: number }> {
    const id = await findTab(tabId);
    try {
      const response = await request<{ status: TikTokStatus }>(id, { type: 'tt-status' });
      return { ...response.status, tabId: id };
    } catch (error) {
      const missing = /^Could not establish connection\.\s*Receiving end does not exist\.?$/i.test(errorText(error));
      if (!reconnect || !missing || job?.state === 'running' || collection?.state === 'running') throw new Error(connectionHelp);
      try {
        let pending = reconnecting.get(id);
        if (!pending) {
          pending = (async () => {
            await findTab(id);
            if (job?.state === 'running' || collection?.state === 'running') throw new Error(connectionHelp);
            await api.inject(id);
          })();
          reconnecting.set(id, pending);
          void pending.finally(() => { if (reconnecting.get(id) === pending) reconnecting.delete(id); }).catch(() => undefined);
        }
        await pending;
        const response = await request<{ status: TikTokStatus }>(id, { type: 'tt-status' });
        return { ...response.status, tabId: id };
      } catch { throw new Error(connectionHelp); }
    }
  }

  async function guardData(account: string, targets: string[], operationId?: string, snapshotId?: string): Promise<string> {
    const data = await (await storage).getData(account);
    const snapshot = data.snapshots.at(-1);
    if (!snapshot || snapshot.account !== account || (snapshotId && snapshot.id !== snapshotId)) throw new Error('A análise mudou ou não está disponível. Leia a lista de seguindo e revise a seleção novamente.');
    const following = new Set(snapshot.following.map(profile => profile.username));
    for (const target of targets) {
      if (!following.has(target)) throw new Error(`@${target} não pertence à lista de seguindo revisada.`);
      if (target === account) throw new Error('Sua própria conta não pode ser selecionada.');
      if (data.protected.includes(target)) throw new Error(`@${target} está protegido. A operação foi interrompida.`);
      if (data.actions.some(action => action.target === target && action.id !== operationId && ['attempting', 'uncertain', 'verified'].includes(action.status))) {
        throw new Error(`Já existe uma ação enviada ou de resultado incerto para @${target}. Confira manualmente no TikTok; a extensão não repetirá essa ação.`);
      }
    }
    return snapshot.id;
  }

  async function requireAccount(tabId: number, account: string): Promise<void> {
    const live = await status(tabId);
    if (live.blocked) throw new Error(live.blocked);
    if (!live.account || live.account !== account) throw new Error('A conta conectada mudou ou não pôde ser verificada. Revise a seleção novamente.');
  }

  async function ready(tabId: number, account: string, profile: string, needsUnfollow: boolean): Promise<void> {
    let lastStatus: TikTokStatus | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (cancelled) throw new Error('Operação cancelada.');
      let live: TikTokStatus | null = null;
      try { live = (await request<{ status: TikTokStatus }>(tabId, { type: 'tt-status' })).status; }
      catch { /* O content script pode ainda não estar pronto após a navegação. */ }
      if (live) lastStatus = live;
      if (live?.blocked) throw new Error(live.blocked);
      if (live?.account && live.account !== account) throw new Error('A conta conectada mudou. A operação foi interrompida.');
      if (live?.account === account && live.profile === profile && live.renderedProfile === true && (!needsUnfollow || live.canUnfollow)) return;
      await pause(500);
    }
    if (!lastStatus) throw new Error(connectionHelp);
    if (lastStatus.profile !== profile) throw new Error(`A página aberta não corresponde ao perfil esperado @${profile}. Confira o endereço da aba TikTok e tente novamente. Nenhuma ação foi enviada.`);
    if (!lastStatus.renderedProfile) throw new Error(lastStatus.profileProblem ?? `O TikTok abriu @${profile}, mas o identificador do perfil não pôde ser confirmado na página. Recarregue o perfil e tente novamente.`);
    if (!lastStatus.account) throw new Error('A conta conectada não pôde ser verificada. Deixe o link Perfil do menu visível e confira novamente a sessão.');
    throw new Error(`O perfil @${profile} não exibe um botão Seguindo/Amigos inequívoco. Confira o perfil manualmente; nenhuma ação foi enviada.`);
  }

  async function runCollection(active: CollectionJob): Promise<void> {
    try {
      await api.activate(active.tabId);
      await requireAccount(active.tabId, active.account);
      if (cancelled) throw new Error('Operação cancelada.');
      await api.navigate(active.tabId, `https://www.tiktok.com/@${active.account}`);
      await ready(active.tabId, active.account, active.account, false);
      const response = await request<{ result: CollectionResult }>(active.tabId, { type: 'tt-collect-following', account: active.account, operationId: active.id });
      await requireAccount(active.tabId, active.account);
      const result = response.result;
      if (!result || result.account !== active.account || !Array.isArray(result.profiles) || result.profiles.length > 100_000 || typeof result.complete !== 'boolean' || !Number.isFinite(result.capturedAt) || result.capturedAt <= 0 || result.capturedAt > Date.now() || typeof result.notice !== 'string' || result.notice.length > 2000 || !(result.expected === null || Number.isSafeInteger(result.expected) && result.expected >= 0)) throw new Error('A coleta devolveu uma resposta inválida.');
      const seen = new Set<string>();
      for (const profile of result.profiles) {
        const username = normalizeUsername(profile.username);
        if (username !== profile.username || username === active.account || seen.has(username) || (profile.displayName !== undefined && (typeof profile.displayName !== 'string' || profile.displayName.length > 500))) throw new Error('A coleta contém perfis inválidos ou duplicados.');
        seen.add(username);
      }
      if (result.complete && (result.expected === null || result.expected !== result.profiles.length)) throw new Error('A quantidade coletada não confirma a lista completa.');
      if (cancelled) result.complete = false;
      active.result = result;
      active.collected = result.profiles.length;
      active.expected = result.expected;
      active.complete = result.complete;
      active.state = cancelled ? 'cancelled' : result.complete ? 'completed' : 'stopped';
      active.message = result.notice;
    } catch (error) {
      active.state = cancelled ? 'cancelled' : 'stopped';
      active.message = errorText(error);
      active.complete = false;
    }
  }

  async function run(approved: Review, active: ActionJob): Promise<void> {
    try {
      const store = await storage;
      await api.activate(approved.tabId);
      await requireAccount(approved.tabId, approved.account);
      await guardData(approved.account, approved.targets, undefined, approved.snapshotId);
      for (const target of approved.targets) {
        if (cancelled) break;
        if (active.completed) await pause(2000);
        await requireAccount(approved.tabId, approved.account);
        await guardData(approved.account, [target], undefined, approved.snapshotId);
        if (cancelled) break;
        active.current = target;
        active.message = `Conferindo @${target} (${active.completed + 1}/${active.total})…`;
        await api.navigate(approved.tabId, `https://www.tiktok.com/@${target}`);
        await ready(approved.tabId, approved.account, target, true);
        await requireAccount(approved.tabId, approved.account);
        await guardData(approved.account, [target], undefined, approved.snapshotId);
        if (cancelled) break;
        currentAction = { id: crypto.randomUUID(), account: approved.account, target, at: now(), status: 'attempting', message: 'Tentativa registrada antes de qualquer clique. Se houver interrupção, não repetir automaticamente.' };
        await store.logAction(currentAction);
        if (cancelled) {
          await store.logAction({ ...currentAction, at: now(), status: 'cancelled', message: 'Cancelado antes de enviar a ação à aba TikTok.' });
          currentAction = null;
          break;
        }
        let result: UnfollowResult;
        try {
          const response = await request<{ result: UnfollowResult }>(approved.tabId, { type: 'tt-unfollow', account: approved.account, target, operationId: currentAction.id });
          result = response.result;
          if (!result || !['verified', 'uncertain', 'blocked', 'cancelled'].includes(result.status)) throw new Error('Resposta da aba TikTok inválida.');
        } catch (error) {
          result = { status: 'uncertain', message: `A comunicação foi interrompida. ${errorText(error)} Confira @${target} manualmente; a ação não será reenviada.` };
        }
        await store.logAction({ ...currentAction, at: now(), ...result });
        currentAction = null;
        active.message = result.message;
        if (result.status !== 'verified') {
          active.state = cancelled ? 'cancelled' : 'stopped';
          return;
        }
        active.completed++;
      }
      active.state = cancelled ? 'cancelled' : 'completed';
      active.message = cancelled ? 'Cancelamento registrado. Nenhuma próxima conta será processada; confira a ação em andamento no histórico.' : `${active.completed} ação(ões) com mudança observada na interface do TikTok.`;
    } catch (error) {
      active.state = cancelled ? 'cancelled' : 'stopped';
      active.message = errorText(error);
    } finally {
      currentAction = null;
      activeApproval = null;
      delete active.current;
    }
  }

  async function handle(value: unknown, sender: Browser.runtime.MessageSender): Promise<unknown> {
    const message = value as ManagerMessage | InternalMessage;
    if (sender.id !== api.id || !message || typeof message !== 'object' || typeof message.type !== 'string') return undefined;
    try {
      if (message.type === 'tt-authorize') {
        const active = job;
        if (!sender.tab || sender.frameId !== 0 || !sender.tab.url?.startsWith('https://www.tiktok.com/') || !active || sender.tab.id !== active.tabId || active.state !== 'running' || cancelled || !currentAction || currentAction.id !== message.operationId || currentAction.account !== message.account || currentAction.target !== message.target) throw new Error('A autorização da ação não é válida ou foi cancelada.');
        await requireAccount(active.tabId, active.account);
        if (!activeApproval) throw new Error('A revisão da operação não está disponível.');
        await guardData(message.account, [message.target], message.operationId, activeApproval.snapshotId);
        if (cancelled || active.state !== 'running') throw new Error('Operação cancelada.');
        return { ok: true };
      }
      if (message.type === 'tt-collection-progress') {
        const active = collection;
        if (!sender.tab || sender.frameId !== 0 || !sender.tab.url?.startsWith('https://www.tiktok.com/') || !active || sender.tab.id !== active.tabId || active.state !== 'running' || cancelled || active.id !== message.operationId || active.account !== message.account) throw new Error('A coleta não está ativa nesta aba.');
        if (!Number.isSafeInteger(message.collected) || message.collected < 0 || message.collected > 100_000 || !(message.expected === null || Number.isSafeInteger(message.expected) && message.expected >= 0) || typeof message.message !== 'string' || message.message.length > 2000) throw new Error('Progresso de coleta inválido.');
        active.collected = message.collected;
        active.expected = message.expected;
        active.message = message.message;
        return { ok: true };
      }
      const managerUrl = `${api.baseUrl}manager.html`;
      if (sender.url !== managerUrl || (sender.frameId !== undefined && sender.frameId !== 0) || (sender.tab && sender.tab.url !== managerUrl)) return undefined;
      switch (message.type) {
        case 'status': return { ok: true, status: await status(message.tabId, true) };
        case 'capture': {
          if (busy()) throw new Error('Aguarde ou cancele a operação em andamento.');
          if (message.kind !== 'followers' && message.kind !== 'following') throw new Error('Tipo de lista inválido.');
          const tabId = await findTab(message.tabId);
          return await request(tabId, { type: 'tt-capture', kind: message.kind });
        }
        case 'collect-following': {
          if (busy()) throw new Error('Aguarde ou cancele a operação em andamento.');
          starting = true;
          const serial = cancelSerial;
          try {
            const live = await status(message.tabId, true);
            if (serial !== cancelSerial) throw new Error('Coleta cancelada antes de começar.');
            if (live.blocked) throw new Error(live.blocked);
            if (!live.account) throw new Error('A conta conectada não pôde ser identificada. Entre no TikTok e abra seu perfil.');
            const account = normalizeUsername(message.account ?? live.account);
            if (live.account !== account) throw new Error('A conta conectada difere da conta selecionada.');
            review = null;
            cancelled = false;
            const active: CollectionJob = { id: crypto.randomUUID(), account, tabId: live.tabId, state: 'running', collected: 0, expected: null, complete: false, message: 'Abrindo seu perfil para ler a lista de seguindo…' };
            collection = active;
            void runCollection(active);
            return { ok: true, collection: { ...active } };
          } finally { starting = false; }
        }
        case 'status-collection': return { ok: true, collection: collection ? { ...collection } : null };
        case 'review': {
          if (busy()) throw new Error('Aguarde ou cancele a operação em andamento.');
          const serial = cancelSerial;
          if (!Array.isArray(message.targets) || message.targets.length < 1 || message.targets.length > 10_000) throw new Error('Selecione de 1 a 10.000 perfis por revisão.');
          const account = normalizeUsername(message.account);
          const targets = message.targets.map(target => normalizeUsername(target));
          if (new Set(targets).size !== targets.length) throw new Error('A seleção contém perfis duplicados.');
          const tabId = await findTab(message.tabId);
          await requireAccount(tabId, account);
          const snapshotId = await guardData(account, targets);
          if (busy() || serial !== cancelSerial) throw new Error('Uma operação começou ou foi cancelada durante a revisão. Revise novamente.');
          review = { token: crypto.randomUUID(), account, targets: [...targets], tabId, snapshotId, expiresAt: now() + 5 * 60_000 };
          return { ok: true, review: { ...review, targets: [...targets] } };
        }
        case 'execute': {
          const approved = review;
          if (busy() || !approved || message.token !== approved.token || approved.expiresAt < now() || normalizeUsername(message.confirmedAccount) !== approved.account) throw new Error('Confirmação inválida ou expirada. Revise a seleção e a conta novamente.');
          review = null;
          activeApproval = approved;
          cancelled = false;
          const active: ActionJob = { id: crypto.randomUUID(), account: approved.account, tabId: approved.tabId, total: approved.targets.length, completed: 0, state: 'running', message: 'Ativando a aba TikTok e conferindo conta, seleção e protegidos…' };
          job = active;
          // shortcut: o lote não retoma após reinício do service worker; o diário persistente impede reenviar tentativas incertas.
          void run(approved, active);
          return { ok: true, job: { ...active } };
        }
        case 'status-job': return { ok: true, job: job ? { ...job } : null };
        case 'cancel':
          cancelSerial++;
          cancelled = true;
          review = null;
          if (job?.state === 'running') {
            job.message = 'Cancelamento solicitado; nenhuma próxima ação será iniciada.';
            void api.send(job.tabId, { type: 'tt-cancel' }).catch(() => undefined);
          }
          if (collection?.state === 'running') {
            collection.message = 'Cancelamento solicitado; a coleta será interrompida.';
            void api.send(collection.tabId, { type: 'tt-cancel' }).catch(() => undefined);
          }
          return { ok: true, job: job ? { ...job } : null, collection: collection ? { ...collection } : null };
        default: return undefined;
      }
    } catch (error) { return { ok: false, error: errorText(error) }; }
  }
  return { handle };
}

export default defineBackground(() => {
  const controller = createController({
    id: browser.runtime.id,
    baseUrl: browser.runtime.getURL('/'),
    tabs: () => browser.tabs.query({ url: 'https://www.tiktok.com/*' }),
    send: (tabId, message) => browser.tabs.sendMessage(tabId, message, { frameId: 0 }),
    activate: tabId => browser.tabs.update(tabId, { active: true }),
    navigate: (tabId, url) => navigateTab(browser.tabs, tabId, url),
    inject: async tabId => {
      const tab = await browser.tabs.get(tabId);
      if (!tab.url?.startsWith('https://www.tiktok.com/')) throw new Error('A aba saiu do TikTok.');
      return browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['/content-scripts/tiktok.js'], world: 'ISOLATED' });
    },
  }, TrackerStore.open());
  browser.runtime.onMessage.addListener((message, sender) => controller.handle(message, sender));
  browser.action.onClicked.addListener(() => { void browser.tabs.create({ url: browser.runtime.getURL('/manager.html') }); });
});
