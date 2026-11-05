import { describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { createController, navigateTab } from '../entrypoints/background';
import type { ActionJob, CollectionJob, ContentMessage, Review } from './messages';
import type { AccountData, ActionRecord } from './types';

const ui = { id: 'test', url: 'chrome-extension://test/manager.html', frameId: 0, tab: { id: 9, url: 'chrome-extension://test/manager.html' } } as Browser.runtime.MessageSender;
const content = { id: 'test', tab: { id: 7, url: 'https://www.tiktok.com/@alice' }, frameId: 0 } as Browser.runtime.MessageSender;
function fixture() {
  const data: AccountData = { account: 'alice', snapshots: [{ id: 'baseline', account: 'alice', capturedAt: 1, importedAt: 2, complete: false, source: 'browser', fingerprint: 'a'.repeat(64), followers: [], following: ['bob', 'carol'].map(username => ({ username })) }], protected: [], actions: [], changes: [] };
  const timeline: string[] = [];
  let account = 'alice';
  let profile = 'alice';
  let time = 1000;
  const logAction = vi.fn(async (record: ActionRecord) => {
    timeline.push(`logged:${record.status}:${record.target}`);
    const index = data.actions.findIndex(item => item.id === record.id);
    if (index === -1) data.actions.push(structuredClone(record));
    else data.actions[index] = structuredClone(record);
  });
  const send = vi.fn(async (_tabId: number, message: ContentMessage): Promise<unknown> => {
    timeline.push(`sent:${message.type}`);
    if (message.type === 'tt-status') return { ok: true, status: { account, blocked: null, profile, canUnfollow: true, renderedProfile: true } };
    if (message.type === 'tt-unfollow') return { ok: true, result: { status: 'verified', message: 'Changed to Follow in synthetic fixture.' } };
    if (message.type === 'tt-collect-following') return { ok: true, result: { account, profiles: [{ username: 'bob' }, { username: 'carol' }], complete: true, expected: 2, notice: 'Coleta sintética concluída.', capturedAt: 1000 } };
    return { ok: true };
  });
  const api = {
    id: 'test', baseUrl: 'chrome-extension://test/',
    tabs: vi.fn(async () => [{ id: 7, url: 'https://www.tiktok.com/@alice', active: true }]),
    send, activate: vi.fn(async () => undefined),
    navigate: vi.fn(async (_tabId: number, url: string) => { timeline.push(`navigate:${url}`); profile = url.split('@')[1]!; }),
    inject: vi.fn(async (_tabId: number) => undefined),
    sleep: vi.fn(async (_milliseconds: number) => undefined),
  };
  const store = { getData: async () => structuredClone(data), logAction };
  const controller = createController(api, Promise.resolve(store), () => time);
  const call = (message: unknown, sender = ui) => controller.handle(message, sender);
  async function review(targets = ['bob']) {
    const response = await call({ type: 'review', tabId: 7, account: 'alice', targets }) as { ok: boolean; review: Review };
    expect(response.ok).toBe(true);
    return response.review;
  }
  const job = async () => (await call({ type: 'status-job' }) as { job: ActionJob | null }).job;
  const collection = async () => (await call({ type: 'status-collection' }) as { collection: CollectionJob | null }).collection;
  async function finished() {
    await vi.waitFor(async () => { expect((await job())?.state).not.toBe('running'); });
    return (await job())!;
  }
  async function collected() {
    await vi.waitFor(async () => { expect((await collection())?.state).not.toBe('running'); });
    return (await collection())!;
  }
  return { data, timeline, send, api, store, call, review, job, finished, collection, collected, setAccount: (value: string) => { account = value; }, setTime: (value: number) => { time = value; } };
}

describe('background action safety (synthetic TikTok responses only)', () => {
  it('requires the exact manager origin; web content cannot start or cancel jobs', async () => {
    const f = fixture();
    expect(await f.call({ type: 'review', account: 'alice', targets: ['bob'], tabId: 7 }, content)).toBeUndefined();
    expect(await f.call({ type: 'status' }, { ...ui, id: 'another-extension' })).toBeUndefined();
    expect(await f.call({ type: 'status' }, { ...ui, url: 'chrome-extension://test/other.html' })).toBeUndefined();
    expect(await f.call({ type: 'tt-authorize', account: 'alice', target: 'bob', operationId: 'fake' }, content)).toMatchObject({ ok: false });
    expect(f.send).not.toHaveBeenCalled();
    expect(await f.call({ type: 'status-job' }, ui)).toMatchObject({ ok: true, job: null });
    expect(await f.call({ type: 'status-job' }, { ...ui, tab: undefined })).toMatchObject({ ok: true, job: null });
  });

  it('persists each attempting record before contacting the TikTok action handler', async () => {
    const f = fixture();
    const reviewed = await f.review(['bob', 'carol']);
    const response = await f.call({ type: 'execute', token: reviewed.token, confirmedAccount: 'alice' });
    expect(response).toMatchObject({ ok: true });
    const job = await f.finished();
    expect(job).toMatchObject({ state: 'completed', completed: 2, total: 2 });
    const actionPositions = f.timeline.flatMap((event, index) => event === 'sent:tt-unfollow' ? [index] : []);
    expect(f.timeline.indexOf('logged:attempting:bob')).toBeLessThan(actionPositions[0]!);
    expect(f.timeline.indexOf('logged:attempting:carol')).toBeLessThan(actionPositions[1]!);
    expect(f.data.actions.map(action => action.status)).toEqual(['verified', 'verified']);
    expect(f.api.activate).toHaveBeenCalledWith(7);
    expect(f.api.navigate.mock.calls.map(([, url]) => url)).toEqual(['https://www.tiktok.com/@bob', 'https://www.tiktok.com/@carol']);
    expect(f.api.sleep).toHaveBeenCalled();
  });

  it('binds review targets immutably and consumes each token once', async () => {
    const f = fixture();
    const selected = ['bob'];
    const approved = await f.review(selected);
    selected[0] = 'mallory';
    approved.targets[0] = 'eve';
    expect(await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'carol' })).toMatchObject({ ok: false });
    expect(await f.call({ type: 'execute', token: approved.token, confirmedAccount: '@alice' })).toMatchObject({ ok: true });
    expect(await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' })).toMatchObject({ ok: false });
    await f.finished();
    expect(f.data.actions[0]?.target).toBe('bob');
  });

  it('expires reviews and rejects invalid or excessive selections', async () => {
    const f = fixture();
    const approved = await f.review();
    f.setTime(400_000);
    expect(await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' })).toMatchObject({ ok: false });
    for (const targets of [[], ['bob', 'BOB'], ['alice'], Array(10_001).fill('bob'), ['not_in_snapshot']]) {
      expect(await f.call({ type: 'review', account: 'alice', targets, tabId: 7 })).toMatchObject({ ok: false });
    }
    expect(f.data.actions).toEqual([]);
  });

  it('accepts a reviewed queue above 25 targets without requiring all DOM rows', async () => {
    const f = fixture();
    const targets = Array.from({ length: 30 }, (_, index) => `target${index}`);
    f.data.snapshots[0]!.following = targets.map(username => ({ username }));
    expect((await f.review(targets)).targets).toHaveLength(30);
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-review')).toBe(false);
  });

  it('invalidates the approval when the local dataset changes', async () => {
    const f = fixture();
    const approved = await f.review();
    f.data.snapshots[0]!.id = 'different';
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'stopped', completed: 0 });
    expect(f.api.navigate).not.toHaveBeenCalled();
    expect(f.data.actions).toEqual([]);
  });

  it('waits for page readiness without retrying clicks and stops on changed identity', async () => {
    const f = fixture();
    f.api.navigate.mockImplementation(async () => { f.setAccount('mallory'); });
    const approved = await f.review();
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'stopped', completed: 0 });
    expect(f.data.actions).toEqual([]);
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-unfollow')).toBe(false);
  });

  it('checks the connected account and protections again after approval', async () => {
    const f = fixture();
    const approved = await f.review();
    f.setAccount('eve');
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'stopped', completed: 0 });
    expect(f.data.actions).toEqual([]);
    const g = fixture();
    const approved2 = await g.review();
    g.data.protected.push('bob');
    await g.call({ type: 'execute', token: approved2.token, confirmedAccount: 'alice' });
    expect(await g.finished()).toMatchObject({ state: 'stopped', completed: 0 });
    expect(g.data.actions).toEqual([]);
  });

  it('stops the batch after an uncertain response and never retries after restart', async () => {
    const f = fixture();
    const normalSend = f.send.getMockImplementation()!;
    f.send.mockImplementation(async (tabId, message) => {
      if (message.type === 'tt-unfollow') throw new Error('Disconnected after click');
      return normalSend(tabId, message);
    });
    const approved = await f.review(['bob', 'carol']);
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'stopped', completed: 0 });
    expect(f.data.actions).toHaveLength(1);
    expect(f.data.actions[0]?.status).toBe('uncertain');
    expect(f.api.inject).not.toHaveBeenCalled();
    const restarted = createController(f.api, Promise.resolve(f.store));
    expect(await restarted.handle({ type: 'review', account: 'alice', targets: ['bob'], tabId: 7 }, ui)).toMatchObject({ ok: false });
    f.data.actions[0]!.status = 'attempting';
    expect(await restarted.handle({ type: 'review', account: 'alice', targets: ['bob'], tabId: 7 }, ui)).toMatchObject({ ok: false });
  });

  it('cancels during journal persistence without sending the action', async () => {
    const f = fixture();
    const persist = f.store.logAction.getMockImplementation()!;
    let unlock: (() => void) | undefined;
    f.store.logAction.mockImplementation(async record => {
      await persist(record);
      if (record.status === 'attempting') await new Promise<void>(resolve => { unlock = resolve; });
    });
    const approved = await f.review();
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    await vi.waitFor(() => { expect(unlock).toBeDefined(); });
    await f.call({ type: 'cancel' });
    unlock!();
    expect(await f.finished()).toMatchObject({ state: 'cancelled', completed: 0 });
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-unfollow')).toBe(false);
    expect(f.data.actions[0]?.status).toBe('cancelled');
  });

  it('authorizes only the current operation in the bound top-level tab and rereads protections', async () => {
    const f = fixture();
    const normalSend = f.send.getMockImplementation()!;
    let checks = 0;
    f.send.mockImplementation(async (tabId, message) => {
      if (message.type !== 'tt-unfollow') return normalSend(tabId, message);
      const request = { type: 'tt-authorize', account: message.account, target: message.target, operationId: message.operationId };
      expect(await f.call(request, { ...content, frameId: 1 })).toMatchObject({ ok: false });
      expect(await f.call({ ...request, target: 'carol' }, content)).toMatchObject({ ok: false });
      expect(await f.call(request, content)).toMatchObject({ ok: true });
      checks++;
      f.data.protected.push('bob');
      expect(await f.call(request, content)).toMatchObject({ ok: false });
      checks++;
      return { ok: true, result: { status: 'uncertain', message: 'Protected before confirmation' } };
    });
    const approved = await f.review();
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'stopped' });
    expect(checks).toBe(2);
    expect(f.data.actions[0]?.status).toBe('uncertain');
  });

  it('binds the snapshot again immediately before every click authorization', async () => {
    const f = fixture();
    const normalSend = f.send.getMockImplementation()!;
    f.send.mockImplementation(async (tabId, message) => {
      if (message.type !== 'tt-unfollow') return normalSend(tabId, message);
      f.data.snapshots[0]!.id = 'replaced-after-journal';
      expect(await f.call({ type: 'tt-authorize', account: message.account, target: message.target, operationId: message.operationId }, content)).toMatchObject({ ok: false });
      return { ok: true, result: { status: 'blocked', message: 'A análise mudou antes do clique.' } };
    });
    const approved = await f.review();
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'stopped', completed: 0 });
    expect(f.data.actions[0]?.status).toBe('blocked');
  });

  it('cancels page readiness waits without sending or journaling an action', async () => {
    const f = fixture();
    let navigated = false;
    f.api.navigate.mockImplementation(async () => { navigated = true; await f.call({ type: 'cancel' }); });
    const approved = await f.review();
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'cancelled', completed: 0 });
    expect(navigated).toBe(true);
    expect(f.data.actions).toEqual([]);
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-unfollow')).toBe(false);
  });

  it('checks cancellation during the two-second interval between profiles', async () => {
    const f = fixture();
    f.api.sleep.mockImplementation(async () => { await f.call({ type: 'cancel' }); });
    const approved = await f.review(['bob', 'carol']);
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    expect(await f.finished()).toMatchObject({ state: 'cancelled', completed: 1 });
    expect(f.api.navigate.mock.calls.map(([, url]) => url)).toEqual(['https://www.tiktok.com/@bob']);
    expect(f.data.actions).toHaveLength(1);
  });
});

describe('automatic following collection (synthetic responses only)', () => {
  it('navigates to the connected account and returns the independently polled result', async () => {
    const f = fixture();
    expect(await f.call({ type: 'collect-following' })).toMatchObject({ ok: true, collection: { account: 'alice', state: 'running' } });
    expect(await f.collected()).toMatchObject({ state: 'completed', collected: 2, expected: 2, complete: true, result: { account: 'alice' } });
    expect(f.api.navigate).toHaveBeenCalledWith(7, 'https://www.tiktok.com/@alice');
    expect(f.data.actions).toEqual([]);
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-unfollow')).toBe(false);
  });

  it('binds progress to operation/account/top frame and cancels without overlapping actions', async () => {
    const f = fixture();
    const approved = await f.review();
    const normalSend = f.send.getMockImplementation()!;
    let release: ((value: unknown) => void) | undefined;
    f.send.mockImplementation(async (tabId, message) => message.type === 'tt-collect-following' ? new Promise(resolve => { release = resolve; }) : normalSend(tabId, message));
    const response = await f.call({ type: 'collect-following', tabId: 7, account: 'alice' }) as { collection: CollectionJob };
    await vi.waitFor(() => expect(release).toBeDefined());
    const progress = { type: 'tt-collection-progress', operationId: response.collection.id, account: 'alice', collected: 1, expected: 2, message: 'Lendo…' };
    expect(await f.call(progress, { ...content, frameId: 1 })).toMatchObject({ ok: false });
    expect(await f.call({ ...progress, operationId: 'fake' }, content)).toMatchObject({ ok: false });
    expect(await f.call({ ...progress, account: 'other' }, content)).toMatchObject({ ok: false });
    expect(await f.call(progress, content)).toMatchObject({ ok: true });
    expect(await f.collection()).toMatchObject({ collected: 1, expected: 2 });
    expect(await f.call({ type: 'review', tabId: 7, account: 'alice', targets: ['bob'] })).toMatchObject({ ok: false });
    expect(await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' })).toMatchObject({ ok: false });
    expect(await f.call({ type: 'collect-following' })).toMatchObject({ ok: false });
    await f.call({ type: 'cancel' });
    expect(await f.call(progress, content)).toMatchObject({ ok: false });
    release!({ ok: true, result: { account: 'alice', profiles: [{ username: 'bob' }], complete: false, expected: 2, notice: 'Leitura cancelada.', capturedAt: 1000 } });
    expect(await f.collected()).toMatchObject({ state: 'cancelled', collected: 1, complete: false });
    expect(f.data.actions).toEqual([]);
  });

  it('honors cancellation while identifying the initial session', async () => {
    const f = fixture();
    const normalSend = f.send.getMockImplementation()!;
    let release: (() => void) | undefined;
    f.send.mockImplementation(async (tabId, message) => {
      if (message.type === 'tt-status') await new Promise<void>(resolve => { release = resolve; });
      return normalSend(tabId, message);
    });
    const start = f.call({ type: 'collect-following' });
    await vi.waitFor(() => expect(release).toBeDefined());
    await f.call({ type: 'cancel' });
    release!();
    expect(await start).toMatchObject({ ok: false });
    expect(f.api.navigate).not.toHaveBeenCalled();
    expect(await f.collection()).toBeNull();
  });

  it('rejects collection completion whose exact count does not match unique profiles', async () => {
    const f = fixture();
    const normalSend = f.send.getMockImplementation()!;
    f.send.mockImplementation(async (tabId, message) => message.type === 'tt-collect-following' ? { ok: true, result: { account: 'alice', profiles: [{ username: 'bob' }], complete: true, expected: 2, notice: 'Wrong count', capturedAt: 1000 } } : normalSend(tabId, message));
    await f.call({ type: 'collect-following' });
    expect(await f.collected()).toMatchObject({ state: 'stopped', complete: false });
    expect((await f.collection())?.result).toBeUndefined();
  });

  it('refuses to collect under a different account', async () => {
    const f = fixture();
    expect(await f.call({ type: 'collect-following', account: 'mallory' })).toMatchObject({ ok: false });
    expect(f.api.navigate).not.toHaveBeenCalled();
  });

  it('reports the rendered profile validation problem without beginning collection', async () => {
    const f = fixture();
    const normal = f.send.getMockImplementation()!;
    f.send.mockImplementation(async (id, message) => message.type === 'tt-status' ? { ok: true, status: { account: 'alice', blocked: null, profile: 'alice', canUnfollow: false, renderedProfile: false, profileProblem: 'O @usuário exibido no perfil não corresponde ao endereço da página.' } } : normal(id, message));
    await f.call({ type: 'collect-following' });
    expect(await f.collected()).toMatchObject({ state: 'stopped', message: 'O @usuário exibido no perfil não corresponde ao endereço da página.' });
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-collect-following')).toBe(false);
    expect(f.data.actions).toEqual([]);
  });

  it('distinguishes a wrong loaded profile from an unreadable heading', async () => {
    const f = fixture();
    const normal = f.send.getMockImplementation()!;
    let navigated = false;
    f.api.navigate.mockImplementation(async () => { navigated = true; });
    f.send.mockImplementation(async (id, message) => message.type === 'tt-status' && navigated ? { ok: true, status: { account: 'alice', blocked: null, profile: 'different', canUnfollow: false, renderedProfile: true } } : normal(id, message));
    await f.call({ type: 'collect-following' });
    expect(await f.collected()).toMatchObject({ state: 'stopped', message: expect.stringContaining('página aberta não corresponde ao perfil esperado @alice') });
    expect(f.send.mock.calls.some(([, message]) => message.type === 'tt-collect-following')).toBe(false);
  });
});

describe('navigation waits for the new document', () => {
  function tabsFixture() {
    type Listener = (id: number, change: { status?: string }, tab: { url?: string }) => void;
    const listeners = new Set<Listener>();
    const tabs = {
      onUpdated: { addListener: vi.fn((listener: Listener) => { listeners.add(listener); }), removeListener: vi.fn((listener: Listener) => { listeners.delete(listener); }) },
      update: vi.fn(async (_id: number, _properties: { url: string }): Promise<unknown> => ({ status: 'complete', url: 'https://www.tiktok.com/@alice' })),
    };
    const emit = (id: number, status: string, url = 'https://www.tiktok.com/@alice') => listeners.forEach(listener => listener(id, { status }, { url }));
    return { tabs, listeners, emit };
  }

  it('ignores the old complete status even when navigating to the same URL', async () => {
    const f = tabsFixture();
    let settled = false;
    const pending = navigateTab(f.tabs, 7, 'https://www.tiktok.com/@alice').then(() => { settled = true; });
    await Promise.resolve();
    expect(f.listeners.size).toBe(1);
    expect(settled).toBe(false);
    f.emit(7, 'complete');
    f.emit(8, 'loading');
    f.emit(8, 'complete');
    await Promise.resolve();
    expect(settled).toBe(false);
    f.emit(7, 'loading');
    f.emit(7, 'complete', 'https://www.tiktok.com/@alice?lang=pt-BR');
    await pending;
    expect(settled).toBe(true);
    expect(f.listeners.size).toBe(0);
    expect(f.tabs.onUpdated.addListener.mock.invocationCallOrder[0]).toBeLessThan(f.tabs.update.mock.invocationCallOrder[0]!);
  });

  it('rejects redirects outside the approved profile and removes the listener', async () => {
    const f = tabsFixture();
    const pending = expect(navigateTab(f.tabs, 7, 'https://www.tiktok.com/@alice')).rejects.toThrow('redirecionou');
    f.emit(7, 'loading');
    f.emit(7, 'complete', 'https://www.tiktok.com/login');
    await pending;
    expect(f.listeners.size).toBe(0);
  });

  it('fails on update rejection and cleans up its event listener', async () => {
    const f = tabsFixture();
    f.tabs.update.mockRejectedValue(new Error('Tab closed'));
    await expect(navigateTab(f.tabs, 7, 'https://www.tiktok.com/@alice')).rejects.toThrow('Tab closed');
    expect(f.listeners.size).toBe(0);
  });

  it('times out instead of trusting an old document with no new loading event', async () => {
    vi.useFakeTimers();
    try {
      const f = tabsFixture();
      const pending = expect(navigateTab(f.tabs, 7, 'https://www.tiktok.com/@alice', 50)).rejects.toThrow('não concluiu');
      f.emit(7, 'complete');
      await vi.advanceTimersByTimeAsync(50);
      await pending;
      expect(f.listeners.size).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});

describe('read-only recovery for previously opened tabs', () => {
  const missingReceiver = 'Could not establish connection. Receiving end does not exist.';

  it('injects once and reads status once again only for the exact missing receiver error', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error(missingReceiver));
    expect(await f.call({ type: 'status' })).toMatchObject({ ok: true, status: { account: 'alice' } });
    expect(f.api.inject).toHaveBeenCalledExactlyOnceWith(7);
    expect(f.send.mock.calls.map(([, message]) => message.type)).toEqual(['tt-status', 'tt-status']);
    expect(f.api.navigate).not.toHaveBeenCalled();
    expect(f.data.actions).toEqual([]);
  });

  it('can repair the initial read-only collection status before any collection job starts', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error(missingReceiver));
    expect(await f.call({ type: 'collect-following' })).toMatchObject({ ok: true });
    expect(await f.collected()).toMatchObject({ state: 'completed' });
    expect(f.api.inject).toHaveBeenCalledExactlyOnceWith(7);
    expect(f.data.actions).toEqual([]);
  });

  it('does not inject after channel closure or other errors and gives instructions in Portuguese', async () => {
    for (const text of ['A listener indicated an asynchronous response but the message channel closed.', 'Permission denied', 'Unexpected page error']) {
      const f = fixture();
      f.send.mockRejectedValueOnce(new Error(text));
      const response = await f.call({ type: 'status' });
      expect(response).toMatchObject({ ok: false, error: expect.stringContaining('recarregue a página do TikTok') });
      expect(f.api.inject).not.toHaveBeenCalled();
      expect(f.send).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses injection if the tab leaves the permitted TikTok host', async () => {
    const f = fixture();
    f.api.tabs.mockResolvedValueOnce([{ id: 7, url: 'https://www.tiktok.com/@alice', active: true }]);
    f.api.tabs.mockResolvedValue([{ id: 7, url: 'https://www.tiktok.com.evil.invalid/@alice', active: true }]);
    f.send.mockRejectedValueOnce(new Error(missingReceiver));
    expect(await f.call({ type: 'status', tabId: 7 })).toMatchObject({ ok: false, error: expect.stringContaining('acesso a www.tiktok.com') });
    expect(f.api.inject).not.toHaveBeenCalled();
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous injection attempts and blocks action start while reconnecting', async () => {
    const f = fixture();
    const approved = await f.review();
    const normal = f.send.getMockImplementation()!;
    let connected = false;
    let release: (() => void) | undefined;
    f.send.mockImplementation(async (id, message) => {
      if (!connected) throw new Error(missingReceiver);
      return normal(id, message);
    });
    f.api.inject.mockImplementation(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      connected = true;
    });
    const first = f.call({ type: 'status' });
    const second = f.call({ type: 'status' });
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(f.api.inject).toHaveBeenCalledTimes(1);
    expect(await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' })).toMatchObject({ ok: false });
    release!();
    expect(await first).toMatchObject({ ok: true });
    expect(await second).toMatchObject({ ok: true });
    expect(f.api.inject).toHaveBeenCalledTimes(1);
    expect(f.data.actions).toEqual([]);
  });

  it('reports denied site permission without replaying any operation', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error(missingReceiver));
    f.api.inject.mockRejectedValueOnce(new Error('Cannot access contents of the page. Extension manifest must request permission.'));
    const result = await f.call({ type: 'status' }) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain('permita à extensão acesso a www.tiktok.com');
    expect(result.error).toContain('Conferir sessão');
    expect(result.error).not.toContain('Cannot access');
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.api.inject).toHaveBeenCalledTimes(1);
    expect(await f.call({ type: 'status' })).toMatchObject({ ok: true });
  });

  it('stops after one failed post-injection status read', async () => {
    const f = fixture();
    f.send.mockRejectedValue(new Error(missingReceiver));
    expect(await f.call({ type: 'status' })).toMatchObject({ ok: false });
    expect(f.api.inject).toHaveBeenCalledTimes(1);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it('does not reconnect an active action job, even when the manager requests status', async () => {
    const f = fixture();
    const normal = f.send.getMockImplementation()!;
    let release: ((value: unknown) => void) | undefined;
    f.send.mockImplementation(async (id, message) => message.type === 'tt-unfollow' ? new Promise(resolve => { release = resolve; }) : normal(id, message));
    const approved = await f.review();
    await f.call({ type: 'execute', token: approved.token, confirmedAccount: 'alice' });
    await vi.waitFor(() => expect(release).toBeDefined());
    f.send.mockRejectedValueOnce(new Error(missingReceiver));
    expect(await f.call({ type: 'status' })).toMatchObject({ ok: false });
    expect(f.api.inject).not.toHaveBeenCalled();
    release!({ ok: true, result: { status: 'uncertain', message: 'Connection lost after one attempt.' } });
    expect(await f.finished()).toMatchObject({ state: 'stopped' });
    expect(f.data.actions).toHaveLength(1);
    expect(f.data.actions[0]?.status).toBe('uncertain');
  });
});
