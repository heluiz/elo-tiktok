import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { collectFollowing, exactFollowingCount } from './collector';

// All fixtures are artificial; no TikTok page, session, or request is accessed.
function fixture(options: { count?: string; rows?: string[]; opened?: boolean; label?: string; header?: string; tagged?: boolean; generic?: boolean; duplicateLinks?: boolean; scroll?: boolean; top?: number; profile?: string; rendered?: string } = {}) {
  const win = new Window({ url: `https://www.tiktok.com/@${options.profile ?? 'alice'}` });
  Object.defineProperty(win.HTMLElement.prototype, 'getClientRects', { configurable: true, value: () => [new win.DOMRect(0, 0, 100, 20)] });
  const doc = win.document as unknown as Document;
  Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'visible' });
  let currentUrl = win.location.href;
  doc.body.innerHTML = `<nav><a data-e2e="nav-profile" href="/@alice">Perfil</a></nav><h1 data-e2e="user-title">@${options.rendered ?? options.profile ?? 'alice'}</h1><strong data-e2e="following-count">${options.count ?? '3'}</strong>`;
  const count = doc.querySelector('[data-e2e="following-count"]')!;
  const clicks = vi.fn();
  const positions: number[] = [];
  let onScroll: ((top: number) => void) | undefined;
  let scroller: HTMLElement;
  let list: HTMLElement;
  function renderRows(usernames: string[]) {
    list.querySelector('ul')!.innerHTML = usernames.map(username => `<li${options.tagged === false ? '' : ' data-e2e="follow-user"'}>${options.duplicateLinks ? `<a href="/@${username}" aria-label="Avatar"><img alt=""/></a>` : ''}<a href="/@${username}">@${username}</a><button data-e2e="follow-button">Seguindo</button></li>`).join('');
  }
  function open() {
    list = doc.createElement('section');
    if (!options.generic) list.setAttribute('data-e2e', 'follow-info-popup');
    list.setAttribute('role', 'dialog');
    if (options.label !== '') list.setAttribute('aria-label', options.label ?? 'Seguindo');
    list.innerHTML = `${options.header ?? ''}<div data-scroll><ul></ul></div>`;
    doc.body.append(list);
    scroller = list.querySelector<HTMLElement>('[data-scroll]')!;
    scroller.style.overflowY = options.scroll === false ? 'visible' : 'auto';
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    let top = options.top ?? 0;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => {
      top = value;
      positions.push(value);
      onScroll?.(value);
    } });
    renderRows(options.rows ?? ['bob']);
  }
  if (options.opened !== false) open();
  count.addEventListener('click', () => { clicks(); if (!list) open(); });
  const controls = { cancelled: () => false, onProgress: vi.fn(async () => undefined), sleep: vi.fn(async (_ms: number) => undefined) };
  return {
    doc, count, clicks, positions, controls,
    url: () => currentUrl,
    navigate: (value: string) => { currentUrl = value; },
    setOnScroll: (callback: (top: number) => void) => { onScroll = callback; },
    renderRows,
    get list() { return list; },
    get scroller() { return scroller; },
  };
}
afterEach(() => { vi.useRealTimers(); });

describe('exact Following counter', () => {
  it.each([['0', 0], ['1234', 1234], ['1.234', 1234], ['1,234', 1234], ['12 345', 12345], ['1.234.567', 1234567]])('reads exact displayed integer %s', (text, expected) => {
    const f = fixture({ count: text });
    expect(exactFollowingCount(f.doc)).toBe(expected);
  });
  it.each(['1K', '1.2K', '1,2 mil', '2M', '1.23', '1,234.567', 'Following 12', '', '-1', '9007199254740992'])('refuses abbreviated, estimated, or invalid counter %s', text => {
    expect(exactFollowingCount(fixture({ count: text }).doc)).toBeNull();
  });
  it('refuses ambiguous or hidden counters', () => {
    const f = fixture();
    f.count.insertAdjacentHTML('afterend', '<strong data-e2e="following-count">3</strong>');
    expect(exactFollowingCount(f.doc)).toBeNull();
    f.count.nextElementSibling!.remove();
    f.count.setAttribute('hidden', '');
    expect(exactFollowingCount(f.doc)).toBeNull();
  });
});

describe('Following DOM collector (synthetic fixtures)', () => {
  it('opens only the Following counter and accumulates virtualized rows while scrolling only their container', async () => {
    const f = fixture({ opened: false, count: '3' });
    let page = 0;
    f.setOnScroll(() => { page++; f.renderRows(page === 1 ? ['bob', 'carol'] : ['carol', 'dan']); });
    const documentScroll = vi.spyOn(f.doc.defaultView!, 'scrollTo');
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result).toMatchObject({ account: 'alice', complete: true, expected: 3 });
    expect(result.profiles.map(profile => profile.username)).toEqual(['bob', 'carol', 'dan']);
    expect(f.clicks).toHaveBeenCalledTimes(1);
    expect(f.positions).toEqual([80, 160]);
    expect(documentScroll).not.toHaveBeenCalled();
    expect(f.controls.onProgress).toHaveBeenCalled();
    expect(result.notice).toContain('contador permaneceu igual');
  });

  it('uses an already open Following list without clicking any control', async () => {
    const f = fixture({ count: '2', rows: ['bob', 'carol'] });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(true);
    expect(f.clicks).not.toHaveBeenCalled();
    expect(f.positions).toEqual([]);
  });

  it('binds a newly opened popup to the verified Following-counter click without invented ARIA or heading labels', async () => {
    const f = fixture({ opened: false, count: '3', label: '', header: '<h2>@alice</h2><div><div>Seguidores</div><div>Seguindo</div></div>', tagged: false, duplicateLinks: true });
    let page = 0;
    f.setOnScroll(() => { page++; f.renderRows(page === 1 ? ['bob', 'carol'] : ['carol', 'dan']); });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(true);
    expect(result.profiles.map(profile => profile.username)).toEqual(['bob', 'carol', 'dan']);
    expect(f.clicks).toHaveBeenCalledTimes(1);
  });

  it('rejects an unidentifiable popup that was already visible before the counter click', async () => {
    const f = fixture({ label: '', header: '<h2>@alice</h2>' });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.notice).toContain('já aberto');
    expect(f.clicks).not.toHaveBeenCalled();
  });

  it('rejects a pre-existing generic dialog containing untagged Following LI rows', async () => {
    const f = fixture({ label: '', generic: true, tagged: false });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([]);
    expect(f.clicks).not.toHaveBeenCalled();
  });

  it('accepts a previously hidden specific popup only after the counter makes it visible', async () => {
    const f = fixture({ count: '1', label: '', header: '<h2>@alice</h2>' });
    f.list.hidden = true;
    f.count.addEventListener('click', () => { f.list.hidden = false; });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(true);
    expect(f.clicks).toHaveBeenCalledTimes(1);
  });

  it('never treats a newly opened generic unlabelled dialog as a Following popup', async () => {
    const f = fixture({ opened: false, label: '', generic: true });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([]);
    expect(result.notice).toContain('reconhecer o popup');
  });

  it.each(['followers', 'conflict', 'foreign', 'multiple', 'sibling'])('rejects a newly opened popup with %s evidence', async evidence => {
    const f = fixture({ opened: false, label: '', header: evidence === 'foreign' ? '<h2>@eve</h2>' : evidence === 'followers' ? '<h2>Seguidores</h2>' : evidence === 'conflict' ? '<h2>Seguindo</h2><h2>Seguidores</h2>' : '<h2>@alice</h2>' });
    f.controls.sleep.mockImplementation(async () => {
      if (!f.doc.querySelector('[data-extra]') && ['multiple', 'sibling'].includes(evidence)) f.doc.body.insertAdjacentHTML('beforeend', evidence === 'multiple' ? '<div data-extra data-e2e="follow-info-popup"><h2>@alice</h2></div>' : '<div data-extra role="dialog" aria-label="Seguidores"></div>');
    });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([]);
  });

  it.each(['pointerdown', 'click', 'keydown'])('stops before reading another section after a %s interaction', async type => {
    const f = fixture({ opened: false, label: '', header: '<h2>@alice</h2><div data-tabs><div>Seguidores</div><div>Seguindo</div></div>' });
    f.setOnScroll(() => {
      f.list.querySelector('[data-tabs]')!.dispatchEvent(new f.doc.defaultView!.Event(type, { bubbles: true }));
      f.renderRows(['wrong.follower']);
    });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([{ username: 'bob' }]);
    expect(result.notice).toContain('Você interagiu');
  });

  it('stops if accessible tab selection changes without an input event', async () => {
    const f = fixture({ opened: false, label: '', header: '<h2>@alice</h2><div role="tab" aria-selected="false">Outro</div>' });
    f.setOnScroll(() => { f.list.querySelector('[role="tab"]')!.setAttribute('aria-selected', 'true'); f.renderRows(['wrong.follower']); });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.notice).toContain('aba selecionada');
    expect(result.profiles).toEqual([{ username: 'bob' }]);
  });

  it('accepts mixed tagged and untagged LI rows and excludes recommendations in Follow state', async () => {
    const f = fixture({ opened: false, count: '2', label: '', header: '<h2>@alice</h2>', tagged: false });
    f.controls.sleep.mockImplementation(async () => {
      if (f.doc.querySelector('[data-mixed]')) return;
      f.list.querySelector('ul')!.insertAdjacentHTML('beforeend', '<li data-mixed data-e2e="follow-user"><a href="/@carol">@carol</a></li><li><a href="/@suggested">@suggested</a><button data-e2e="follow-button">Seguir</button></li>');
    });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(true);
    expect(result.profiles.map(profile => profile.username).sort()).toEqual(['bob', 'carol']);
  });

  it.each(['links', 'buttons', 'missing'])('rejects malformed untagged Following LI rows: %s', async problem => {
    const f = fixture({ opened: false, count: '1', label: '', tagged: false });
    f.controls.sleep.mockImplementation(async () => {
      const row = f.list.querySelector('li')!;
      if (problem === 'links') row.insertAdjacentHTML('beforeend', '<a href="/@carol">@carol</a>');
      if (problem === 'buttons') row.insertAdjacentHTML('beforeend', '<button data-e2e="follow-button">Seguindo</button>');
      if (problem === 'missing') row.querySelector('a')!.remove();
    });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([]);
  });

  it('does not treat LI profile headings or selection attributes as popup owner or active tabs', async () => {
    const f = fixture({ opened: false, count: '1', label: '', header: '<h2>@alice</h2>', tagged: false });
    f.controls.sleep.mockImplementation(async () => { f.list.querySelector('li')!.insertAdjacentHTML('beforeend', '<h3>@bob</h3><h3>Seguidores</h3><span aria-current="page">Perfil</span>'); });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(true);
    expect(result.profiles).toEqual([{ username: 'bob' }]);
  });

  it('removes the input guard after both success and interruption', async () => {
    for (const fail of [false, true]) {
      const f = fixture({ opened: false, count: '1', label: '', header: '<h2>@alice</h2>' });
      const add = vi.spyOn(f.doc, 'addEventListener');
      const remove = vi.spyOn(f.doc, 'removeEventListener');
      if (fail) f.controls.sleep.mockImplementation(async () => { f.doc.dispatchEvent(new f.doc.defaultView!.Event('keydown')); });
      const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
      expect(result.complete).toBe(!fail);
      for (const type of ['pointerdown', 'click', 'keydown']) {
        const registration = add.mock.calls.find(([event]) => event === type)!;
        expect(remove.mock.calls.some(([event, callback, capture]) => event === type && callback === registration[1] && capture === true)).toBe(true);
      }
    }
  });

  it('accepts explicit zero before and after reading without opening a list', async () => {
    const f = fixture({ count: '0', opened: false });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result).toMatchObject({ profiles: [], complete: true, expected: 0 });
    expect(f.clicks).not.toHaveBeenCalled();
    expect(f.controls.sleep).not.toHaveBeenCalled();
  });

  it('does not treat zero as complete if a contradictory Following row is present', async () => {
    const f = fixture({ count: '0', rows: ['bob'] });
    expect((await collectFollowing(f.doc, f.url, 'alice', f.controls)).complete).toBe(false);
  });

  it('returns partial after five attempts without growth, never proving completeness by reaching the end', async () => {
    const f = fixture({ count: '20' });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result).toMatchObject({ complete: false, expected: 20, profiles: [{ username: 'bob' }] });
    expect(f.positions).toHaveLength(5);
    expect(result.notice).toContain('cinco tentativas');
  });

  it('keeps abbreviated counts partial even when every rendered row is collected', async () => {
    const f = fixture({ count: '1K', rows: ['bob', 'carol'] });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result).toMatchObject({ complete: false, expected: null });
    expect(result.profiles).toHaveLength(2);
    expect(result.notice).toContain('não é exato');
  });

  it('never falls back to scrolling the page when the list is not scrollable', async () => {
    const f = fixture({ scroll: false });
    const documentScroll = vi.spyOn(f.doc.defaultView!, 'scrollTo');
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(f.positions).toEqual([]);
    expect(documentScroll).not.toHaveBeenCalled();
    expect(result.notice).toContain('contêiner rolável');
  });

  it('starts at the top if the user left a virtualized list scrolled down', async () => {
    const f = fixture({ top: 300, count: '2', rows: ['carol'] });
    f.setOnScroll(top => { f.renderRows(top === 0 ? ['bob'] : ['carol']); });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(true);
    expect(result.profiles.map(profile => profile.username)).toEqual(['carol', 'bob']);
    expect(f.positions[0]).toBe(0);
  });

  it.each(['account', 'profile', 'navigation', 'hidden', 'challenge', 'section', 'replacement', 'cancel', 'counter'])('interrupts safely with partial data on %s change', async change => {
    const f = fixture();
    let cancelled = false;
    f.controls.cancelled = () => cancelled;
    f.setOnScroll(() => {
      if (change === 'account') f.doc.querySelector('nav a')!.setAttribute('href', '/@eve');
      if (change === 'profile') f.doc.querySelector('[data-e2e="user-title"]')!.textContent = '@eve';
      if (change === 'navigation') f.navigate('https://www.tiktok.com/@eve');
      if (change === 'hidden') Object.defineProperty(f.doc, 'visibilityState', { value: 'hidden' });
      if (change === 'challenge') f.doc.body.insertAdjacentHTML('beforeend', '<div id="captcha-test">Verificar</div>');
      if (change === 'section') f.list.setAttribute('aria-label', 'Seguidores');
      if (change === 'replacement') f.list.replaceWith(f.list.cloneNode(true));
      if (change === 'cancel') cancelled = true;
      if (change === 'counter') f.count.textContent = '4';
    });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([{ username: 'bob' }]);
    expect(result.notice).toContain('Leitura parcial');
    expect(f.positions).toHaveLength(1);
  });

  it('does not collect or click from a foreign profile or stale heading', async () => {
    for (const f of [fixture({ profile: 'carol', opened: false }), fixture({ rendered: 'carol', opened: false })]) {
      const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
      expect(result.complete).toBe(false);
      expect(result.profiles).toEqual([]);
      expect(f.clicks).not.toHaveBeenCalled();
    }
  });

  it('refuses a Followers list and never clicks its rows', async () => {
    const f = fixture({ label: 'Seguidores' });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([]);
    expect(f.clicks).not.toHaveBeenCalled();
  });

  it('stops on an ambiguous row without treating loaded handles as a complete list', async () => {
    const f = fixture({ count: '1' });
    f.list.querySelector('li')!.insertAdjacentHTML('beforeend', '<a href="/@carol">@carol</a>');
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.profiles).toEqual([]);
  });

  it('requires the count to remain exact after the progress callback too', async () => {
    const f = fixture({ count: '1' });
    f.controls.onProgress.mockImplementation(async () => { f.count.textContent = '2'; });
    expect((await collectFollowing(f.doc, f.url, 'alice', f.controls)).complete).toBe(false);
  });

  it('stops at thirty minutes even while the list keeps growing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    const f = fixture({ count: '10' });
    f.controls.sleep.mockImplementation(async () => { vi.setSystemTime(Date.now() + 30 * 60_000); });
    const result = await collectFollowing(f.doc, f.url, 'alice', f.controls);
    expect(result.complete).toBe(false);
    expect(result.notice).toContain('30 minutos');
    expect(f.positions).toHaveLength(1);
  });
});
