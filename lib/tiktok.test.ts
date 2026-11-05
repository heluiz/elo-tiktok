import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { captureVisibleList, connectedAccount, ensureTargets, performUnfollow, readTikTokStatus, requireRenderedProfile } from './tiktok';

// Synthetic DOM fixtures exercise safety rules; these are not recordings of the live TikTok site.
function fixture(html = '', profile = 'alice', renderedProfile = profile) {
  const win = new Window({ url: `https://www.tiktok.com/@${profile}` });
  Object.defineProperty(win.HTMLElement.prototype, 'getClientRects', { configurable: true, value: () => [new win.DOMRect(0, 0, 100, 20)] });
  const doc = win.document as unknown as Document;
  Object.defineProperty(doc, 'visibilityState', { configurable: true, value: 'visible' });
  doc.body.innerHTML = `<nav><a data-e2e="nav-profile" href="/@alice">Perfil</a></nav><h1 data-e2e="user-title">@${renderedProfile}</h1>${html}`;
  return { doc, url: () => win.location.href };
}
const row = (target: string, text = 'Seguindo') => `<li data-e2e="follow-user"><a href="/@${target}">@${target}</a><button data-e2e="follow-button">${text}</button></li>`;
const followingList = (rows = row('bob')) => `<section data-e2e="follow-info-popup" role="dialog" aria-label="Seguindo"><ul>${rows}</ul></section>`;
const button = (doc: Document) => doc.querySelector<HTMLButtonElement>('button[data-e2e="follow-button"]')!;
const controls = () => ({ authorize: vi.fn(async () => undefined), cancelled: () => false, sleep: async () => undefined });
function addConfirmation(doc: Document, target = '@bob') {
  const dialog = doc.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.innerHTML = `<p>Deixar de seguir ${target}?</p><button data-e2e="unfollow-confirm">Deixar de seguir</button>`;
  doc.body.append(dialog);
  return { dialog, confirm: dialog.querySelector<HTMLButtonElement>('button')! };
}

describe('TikTok DOM adapter (artificial fixtures only)', () => {
  it.each(['span', 'div', 'h2'])('reconhece nickname no título e @ no subtítulo sem depender de tag: %s', tag => {
    const { doc, url } = fixture();
    doc.querySelector('[data-e2e="user-title"]')!.outerHTML = `<${tag} data-e2e="user-title">Nome de exibição</${tag}><${tag} data-e2e="user-subtitle">@alice</${tag}>`;
    expect(() => requireRenderedProfile(doc, url(), 'alice')).not.toThrow();
  });

  it('não usa um apelido coincidente como identidade quando o subtítulo aponta outro perfil', () => {
    const { doc, url } = fixture();
    doc.body.insertAdjacentHTML('beforeend', '<div data-e2e="user-subtitle">@carol</div>');
    expect(() => requireRenderedProfile(doc, url(), 'alice')).toThrow('identificador visível');
  });

  it('não substitui subtítulo inválido por um apelido coincidente e recusa subtítulos duplicados', () => {
    const { doc, url } = fixture();
    doc.body.insertAdjacentHTML('beforeend', '<div data-e2e="user-subtitle">Nome com espaços</div>');
    expect(() => requireRenderedProfile(doc, url(), 'alice')).toThrow('identificador visível');
    doc.body.insertAdjacentHTML('beforeend', '<div data-e2e="user-subtitle">@alice</div>');
    expect(() => requireRenderedProfile(doc, url(), 'alice')).toThrow('ambíguo');
  });
  it('identifies only the own navigation link, never the visited profile', () => {
    const { doc, url } = fixture('<h1 data-e2e="user-title">bob</h1>', 'bob');
    expect(connectedAccount(doc, url())).toBe('alice');
    doc.querySelector('nav')!.remove();
    expect(connectedAccount(doc, url())).toBeNull();
  });

  it('fails closed for conflicting identities, foreign links, and hidden login links', () => {
    const { doc, url } = fixture('<a data-e2e="bottom-nav-profile" href="/@mallory">Perfil</a>');
    expect(connectedAccount(doc, url())).toBeNull();
    doc.querySelector('[data-e2e="bottom-nav-profile"]')!.setAttribute('hidden', '');
    expect(connectedAccount(doc, url())).toBe('alice');
    doc.querySelector('nav a')!.setAttribute('href', 'https://evil.example/@alice');
    expect(connectedAccount(doc, url())).toBeNull();
  });

  it('captures loaded rows only and always labels capture incomplete', () => {
    const { doc, url } = fixture(followingList(row('bob') + row('carol')));
    const captured = captureVisibleList(doc, url(), 'following');
    expect(captured.account).toBe('alice');
    expect(captured.profiles.map(profile => profile.username)).toEqual(['bob', 'carol']);
    expect(captured.complete).toBe(false);
    expect(captured.notice).toContain('nunca comprova perdas');
    expect(() => captureVisibleList(doc, url(), 'followers')).toThrow('tipo da lista');
  });

  it('rejects foreign-owner lists, unlabeled lists, and ambiguous rows', () => {
    const other = fixture(followingList(), 'bob');
    expect(() => captureVisibleList(other.doc, other.url(), 'following')).toThrow('própria conta');
    const missingLabel = fixture(followingList().replace('aria-label="Seguindo"', ''));
    expect(() => captureVisibleList(missingLabel.doc, missingLabel.url(), 'following')).toThrow('tipo da lista');
    const ambiguous = fixture(followingList(row('bob').replace('</li>', '<a href="/@carol">carol</a></li>')));
    expect(() => captureVisibleList(ambiguous.doc, ambiguous.url(), 'following')).toThrow('perfil único');
  });

  it('rejects a list left over from another rendered profile after SPA navigation', () => {
    const { doc, url } = fixture(followingList(), 'alice', 'carol');
    expect(() => captureVisibleList(doc, url(), 'following')).toThrow('identificador visível');
    expect(() => ensureTargets(doc, url(), 'alice', ['bob'])).toThrow('identificador visível');
  });

  it.each(['wrong', 'missing', 'hidden', 'duplicate'])('requires a unique visible profile heading before a direct action: %s', async state => {
    const { doc, url } = fixture('<button data-e2e="follow-button">Seguindo</button>', 'bob');
    const heading = doc.querySelector('[data-e2e="user-title"]')!;
    if (state === 'wrong') heading.textContent = '@carol';
    if (state === 'missing') heading.remove();
    if (state === 'hidden') heading.setAttribute('hidden', '');
    if (state === 'duplicate') heading.insertAdjacentHTML('afterend', '<h1 data-e2e="user-title">@bob</h1>');
    const click = vi.fn();
    button(doc).addEventListener('click', click);
    expect(() => ensureTargets(doc, url(), 'alice', ['bob'])).toThrow('identificador visível');
    expect((await performUnfollow(doc, url, 'alice', 'bob', controls())).status).toBe('blocked');
    expect(click).not.toHaveBeenCalled();
  });

  it('reviews every target and refuses missing, duplicate, self, or non-following rows', () => {
    const { doc, url } = fixture(followingList(row('bob') + row('carol', 'Seguir')));
    expect(() => ensureTargets(doc, url(), 'alice', ['bob'])).not.toThrow();
    expect(() => ensureTargets(doc, url(), 'alice', ['bob', 'dan'])).toThrow('carregado');
    expect(() => ensureTargets(doc, url(), 'alice', ['carol'])).toThrow('Seguindo/Amigos');
    expect(() => ensureTargets(doc, url(), 'alice', ['alice'])).toThrow('inválida');
    doc.querySelector('ul')!.insertAdjacentHTML('beforeend', row('bob'));
    expect(() => ensureTargets(doc, url(), 'alice', ['bob'])).toThrow('uma única vez');
  });

  it('records success only after the exact target button changes to Follow', async () => {
    const { doc, url } = fixture('<button data-e2e="follow-button">Amigos</button>', 'bob');
    const click = vi.fn(() => { button(doc).textContent = 'Seguir'; });
    button(doc).addEventListener('click', click);
    const guard = controls();
    let checks = 0;
    guard.sleep = async () => { checks++; };
    const result = await performUnfollow(doc, url, 'alice', 'bob', guard);
    expect(result.status).toBe('verified');
    expect(click).toHaveBeenCalledTimes(1);
    expect(guard.authorize).toHaveBeenCalledTimes(1);
    expect(checks).toBe(4);
    expect(result.message).toContain('nenhuma resposta de servidor');
  });

  it('returns uncertain if an optimistic Follow label reverts; it never clicks again', async () => {
    const { doc, url } = fixture(followingList());
    const click = vi.fn(() => { button(doc).textContent = 'Seguir'; });
    button(doc).addEventListener('click', click);
    let checks = 0;
    const result = await performUnfollow(doc, url, 'alice', 'bob', { ...controls(), sleep: async () => {
      checks++;
      if (checks === 3) button(doc).textContent = 'Seguindo';
    } });
    expect(result.status).toBe('uncertain');
    expect(result.message).toContain('mudou novamente');
    expect(checks).toBe(3);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each(['account', 'profile', 'security', 'cancel'])('checks context throughout the four-observation window: %s', async change => {
    const { doc, url } = fixture(followingList());
    const click = vi.fn(() => { button(doc).textContent = 'Seguir'; });
    button(doc).addEventListener('click', click);
    let checks = 0;
    let cancelled = false;
    const result = await performUnfollow(doc, url, 'alice', 'bob', { ...controls(), cancelled: () => cancelled, sleep: async () => {
      checks++;
      if (checks !== 3) return;
      if (change === 'account') doc.querySelector('nav a')!.setAttribute('href', '/@eve');
      if (change === 'profile') doc.querySelector('[data-e2e="user-title"]')!.textContent = '@carol';
      if (change === 'security') doc.body.insertAdjacentHTML('beforeend', '<div id="captcha-test">Verificar</div>');
      if (change === 'cancel') cancelled = true;
    } });
    expect(result.status).toBe('uncertain');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('confirms only a newly opened dialog that explicitly names the selected handle', async () => {
    const { doc, url } = fixture(followingList());
    const confirmed = vi.fn();
    button(doc).addEventListener('click', () => {
      const { dialog, confirm } = addConfirmation(doc);
      confirm.addEventListener('click', () => { confirmed(); button(doc).textContent = 'Seguir'; dialog.remove(); });
    });
    const guard = controls();
    expect((await performUnfollow(doc, url, 'alice', 'bob', guard)).status).toBe('verified');
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(guard.authorize).toHaveBeenCalledTimes(2);
  });

  it.each(['essa conta', '@bob.other', '@carol'])('never confirms a dialog lacking an exact target: %s', async name => {
    const { doc, url } = fixture(followingList());
    const confirmed = vi.fn();
    button(doc).addEventListener('click', () => { addConfirmation(doc, name).confirm.addEventListener('click', confirmed); });
    const result = await performUnfollow(doc, url, 'alice', 'bob', controls());
    expect(result.status).toBe('uncertain');
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('never treats the outer following list as the target-specific confirmation dialog', async () => {
    const { doc, url } = fixture(followingList(row('bob') + row('carol')));
    const confirmed = vi.fn();
    button(doc).addEventListener('click', () => {
      const list = doc.querySelector('[data-e2e="follow-info-popup"]')!;
      list.insertAdjacentHTML('beforeend', '<div><p>Deixar de seguir @carol?</p><button data-e2e="unfollow-confirm">Deixar de seguir</button></div>');
      list.querySelector('[data-e2e="unfollow-confirm"]')!.addEventListener('click', confirmed);
    });
    const result = await performUnfollow(doc, url, 'alice', 'bob', controls());
    expect(result.status).toBe('uncertain');
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('rejects a list-like confirmation even when it contains the selected handle', async () => {
    const { doc, url } = fixture(followingList());
    const confirmed = vi.fn();
    button(doc).addEventListener('click', () => {
      const { dialog, confirm } = addConfirmation(doc);
      dialog.setAttribute('data-e2e', 'follow-info-popup');
      confirm.addEventListener('click', confirmed);
    });
    expect((await performUnfollow(doc, url, 'alice', 'bob', controls())).status).toBe('uncertain');
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('rejects a confirmation that already existed before the selected action', async () => {
    const { doc, url } = fixture(followingList());
    addConfirmation(doc);
    const click = vi.fn();
    button(doc).addEventListener('click', click);
    expect((await performUnfollow(doc, url, 'alice', 'bob', controls())).status).toBe('blocked');
    expect(click).not.toHaveBeenCalled();
  });

  it('checks protection authorization again before the confirmation click', async () => {
    const { doc, url } = fixture(followingList());
    const confirmed = vi.fn();
    button(doc).addEventListener('click', () => { addConfirmation(doc).confirm.addEventListener('click', confirmed); });
    const guard = controls();
    guard.authorize.mockImplementationOnce(async () => undefined).mockRejectedValueOnce(new Error('Conta protegida'));
    expect((await performUnfollow(doc, url, 'alice', 'bob', guard)).status).toBe('uncertain');
    expect(confirmed).not.toHaveBeenCalled();
  });

  it.each(['security', 'account', 'profile', 'navigation', 'hidden', 'cancel'])('stops after a change during the action: %s', async change => {
    const { doc, url } = fixture(followingList());
    let currentUrl = url();
    let cancelled = false;
    const confirmed = vi.fn();
    button(doc).addEventListener('click', () => {
      addConfirmation(doc).confirm.addEventListener('click', confirmed);
      if (change === 'security') doc.body.insertAdjacentHTML('beforeend', '<div id="captcha-test">Verificar</div>');
      if (change === 'account') doc.querySelector('nav a')!.setAttribute('href', '/@eve');
      if (change === 'profile') doc.querySelector('[data-e2e="user-title"]')!.textContent = '@carol';
      if (change === 'navigation') currentUrl = 'https://www.tiktok.com/@carol';
      if (change === 'hidden') Object.defineProperty(doc, 'visibilityState', { value: 'hidden' });
      if (change === 'cancel') cancelled = true;
    });
    const result = await performUnfollow(doc, () => currentUrl, 'alice', 'bob', { ...controls(), cancelled: () => cancelled });
    expect(result.status).toBe('uncertain');
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('does not retry a click when the state remains unchanged', async () => {
    const { doc, url } = fixture(followingList());
    const click = vi.fn();
    button(doc).addEventListener('click', click);
    expect((await performUnfollow(doc, url, 'alice', 'bob', controls())).status).toBe('uncertain');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('blocks hidden tabs, signed-out sessions and security challenges before clicking', async () => {
    const { doc, url } = fixture(followingList());
    const click = vi.fn();
    button(doc).addEventListener('click', click);
    Object.defineProperty(doc, 'visibilityState', { value: 'hidden' });
    expect((await performUnfollow(doc, url, 'alice', 'bob', controls())).status).toBe('blocked');
    Object.defineProperty(doc, 'visibilityState', { value: 'visible' });
    doc.body.insertAdjacentHTML('beforeend', '<button data-e2e="top-login-button">Entrar</button>');
    expect(readTikTokStatus(doc, url()).blocked).toContain('autenticada');
    expect(click).not.toHaveBeenCalled();
  });
});
