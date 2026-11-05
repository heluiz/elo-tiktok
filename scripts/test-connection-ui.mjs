/** Reconexão do pacote real em Edge/Chromium descartável, apenas com HTML artificial. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const compiled = join(root, '.output', 'chrome-mv3');
const evidence = resolve(process.env.ELO_TEST_OUTPUT || join(root, '..', 'connection-evidence'));
await mkdir(evidence, { recursive: true });
const workspace = await mkdtemp(join(evidence, 'connection-'));
const manifest = JSON.parse(await readFile(join(compiled, 'manifest.json'), 'utf8'));
assert.ok(manifest.permissions.includes('scripting'), 'Compile a versão com recuperação por scripting antes deste teste.');
const packagedFiles = [...new Set((manifest.content_scripts ?? []).flatMap(script => script.js ?? []))];
assert.ok(packagedFiles.some(path => path.endsWith('tiktok.js')), 'Content script TikTok empacotado.');
const checks = [];
const errors = [];
const requests = [];
let actionClicks = 0;

async function javascriptFiles(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) files.push(...await javascriptFiles(path));
    else if (item.name.endsWith('.js')) files.push(path);
  }
  return files;
}

async function testCopy(name, denied = false) {
  const extension = join(workspace, name);
  await cp(compiled, extension, { recursive: true });
  const testingManifest = structuredClone(manifest);
  if (denied) {
    // Apenas o fixture de permissões: tabs revela a URL artificial, sem conceder acesso ao documento.
    testingManifest.permissions = [...new Set([...testingManifest.permissions, 'tabs'])];
    delete testingManifest.host_permissions;
    delete testingManifest.content_scripts;
  } else {
    // Simula a aba anterior à instalação: o navegador não injeta automaticamente neste documento.
    testingManifest.content_scripts = testingManifest.content_scripts.map(script => ({
      ...script, exclude_matches: [...new Set([...(script.exclude_matches ?? []), 'https://www.tiktok.com/*'])],
    }));
  }
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(testingManifest));
  for (const source of await javascriptFiles(compiled)) {
    const path = relative(compiled, source);
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest(await readFile(join(extension, path))), digest(await readFile(source)), `JavaScript compilado idêntico: ${path}`);
  }
  return extension;
}

async function launch(extension, name) {
  const profile = join(workspace, `${name}-profile`);
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.ELO_CHROME_EXECUTABLE ? { executablePath: process.env.ELO_CHROME_EXECUTABLE } : { channel: 'chromium' }),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', '--disable-background-networking', '--disable-sync'],
    viewport: { width: 1440, height: 1000 }, locale: 'pt-BR',
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.exposeBinding('fixtureAction', () => { actionClicks++; });
  await context.route('https://**/*', route => {
    const url = route.request().url();
    requests.push(url);
    if (url !== 'https://www.tiktok.com/@conexao.teste') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="pt-BR"><head><title>Fixture artificial de conexão</title></head><body><p>TESTE ARTIFICIAL. Nenhuma sessão ou conta real.</p><nav><a data-e2e="nav-profile" href="/@conexao.teste">Perfil</a></nav><span data-e2e="user-title">Apelido de teste</span><span data-e2e="user-subtitle">@conexao.teste</span><strong data-e2e="following-count">2</strong><section data-e2e="follow-info-popup" role="dialog" aria-label="Seguindo"><h2>Seguindo</h2>${['ana.teste', 'bruno.teste'].map(username => `<div data-e2e="follow-user"><a href="/@${username}">@${username}</a><button data-e2e="follow-button" onclick="window.fixtureAction()">Seguindo</button></div>`).join('')}</section></body></html>` });
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20_000 });
  const extensionId = new URL(worker.url()).hostname;
  const tiktok = await context.newPage();
  await tiktok.goto('https://www.tiktok.com/@conexao.teste');
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.tiktok.com/*' }))[0].id);
  assert.equal(typeof tabId, 'number');
  const missing = await worker.evaluate(async id => {
    try { await chrome.tabs.sendMessage(id, { type: 'tt-status' }); return null; }
    catch (error) { return error.message; }
  }, tabId);
  assert.match(missing, /Could not establish connection.*Receiving end does not exist/i);
  await worker.evaluate(() => {
    const original = chrome.scripting.executeScript.bind(chrome.scripting);
    globalThis.__eloConnectionTestInjections = 0;
    chrome.scripting.executeScript = details => {
      if (details.files?.length) globalThis.__eloConnectionTestInjections++;
      return original(details);
    };
  });
  const manager = await context.newPage();
  await manager.goto(`chrome-extension://${extensionId}/manager.html`);
  await manager.getByRole('button', { name: 'Conferir sessão', exact: true }).waitFor();
  return { context, worker, tiktok, manager, tabId };
}

let recovered;
let denied;
try {
  recovered = await launch(await testCopy('automatic-injection-disabled'), 'recovery');
  checks.push('Documento TikTok artificial abriu sem listener; o erro nativo de receiving end foi reproduzido antes da recuperação.');
  await recovered.manager.getByRole('button', { name: 'Conferir sessão', exact: true }).click();
  await recovered.manager.getByText('@conexao.teste · identidade reconhecida na página', { exact: true }).waitFor();
  const status = await recovered.manager.evaluate(id => chrome.runtime.sendMessage({ type: 'status', tabId: id }), recovered.tabId);
  assert.equal(status.ok, true);
  assert.equal(status.status.account, 'conexao.teste');
  assert.equal(status.status.renderedProfile, true, 'O handle user-subtitle deve prevalecer sobre o apelido em user-title.');
  assert.equal(await recovered.worker.evaluate(() => globalThis.__eloConnectionTestInjections), 1);
  assert.equal(await recovered.manager.getByRole('alert').count(), 0);
  checks.push('Conferir sessão injeta o content script compilado na aba sem listener e reconhece a identidade sem recarregar.');

  await recovered.manager.getByRole('button', { name: 'Conferir sessão', exact: true }).click();
  const captured = await recovered.manager.evaluate(id => chrome.runtime.sendMessage({ type: 'capture', tabId: id, kind: 'following' }), recovered.tabId);
  assert.equal(captured.ok, true);
  assert.deepEqual(captured.profiles.map(profile => profile.username), ['ana.teste', 'bruno.teste']);
  assert.equal(captured.complete, false);
  assert.equal(await recovered.worker.evaluate(() => globalThis.__eloConnectionTestInjections), 1);
  checks.push('Status posterior reutiliza o listener; a leitura de perfis funciona e não dispara nova injeção nem ações.');

  await recovered.worker.evaluate(async id => {
    await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [0] }, world: 'ISOLATED', func: () => {
      const event = chrome.runtime.onMessage;
      const add = event.addListener.bind(event);
      const remove = event.removeListener.bind(event);
      globalThis.__eloConnectionTestListeners = { additions: 0, removals: 0 };
      event.addListener = listener => { globalThis.__eloConnectionTestListeners.additions++; return add(listener); };
      event.removeListener = listener => { globalThis.__eloConnectionTestListeners.removals++; return remove(listener); };
      globalThis.__eloConnectionTestRestore = () => { event.addListener = add; event.removeListener = remove; };
    } });
  }, recovered.tabId);
  for (let injection = 1; injection <= 2; injection++) {
    await recovered.worker.evaluate(async ({ id, files }) => {
      await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [0] }, files, world: 'ISOLATED' });
    }, { id: recovered.tabId, files: packagedFiles });
    const listeners = await recovered.worker.evaluate(async id => {
      const results = await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [0] }, world: 'ISOLATED', func: () => globalThis.__eloConnectionTestListeners });
      return results[0].result;
    }, recovered.tabId);
    assert.deepEqual(listeners, { additions: injection, removals: injection }, 'Reinjeção substitui o listener anterior, mantendo somente um.');
  }
  await recovered.worker.evaluate(async id => {
    await chrome.scripting.executeScript({ target: { tabId: id, frameIds: [0] }, world: 'ISOLATED', func: () => globalThis.__eloConnectionTestRestore() });
  }, recovered.tabId);
  const afterReinjection = await recovered.manager.evaluate(id => chrome.runtime.sendMessage({ type: 'status', tabId: id }), recovered.tabId);
  assert.equal(afterReinjection.ok, true);
  assert.equal(afterReinjection.status.account, 'conexao.teste');
  checks.push('Duas reinjeções explícitas do arquivo idêntico removem o listener anterior e registram um único substituto por vez.');
  await recovered.manager.screenshot({ path: join(evidence, 'conexao-recuperada.png'), fullPage: true });
  await recovered.context.close();
  recovered = null;

  denied = await launch(await testCopy('host-access-denied', true), 'denied');
  const nativeDenied = await denied.worker.evaluate(async ({ id, files }) => {
    try { await chrome.scripting.executeScript({ target: { tabId: id }, files, world: 'ISOLATED' }); return null; }
    catch (error) { return error.message; }
  }, { id: denied.tabId, files: packagedFiles });
  assert.match(nativeDenied, /Cannot access|permission|not allowed/i, 'O próprio navegador deve negar acesso ao documento sem permissão de host.');
  await denied.manager.getByRole('button', { name: 'Conferir sessão', exact: true }).click();
  const alert = denied.manager.getByRole('alert');
  await alert.waitFor();
  const help = await alert.innerText();
  assert.match(help, /Não foi possível conectar|acesso|permissão/i);
  assert.match(help, /TikTok/i);
  assert.doesNotMatch(help, /Could not establish connection|Receiving end does not exist|Cannot access contents/i);
  const failed = await denied.manager.evaluate(id => chrome.runtime.sendMessage({ type: 'status', tabId: id }), denied.tabId);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /Não foi possível conectar|acesso|permissão/i);
  checks.push('Acesso de host negado pelo navegador produz ajuda acionável em português, sem expor o erro técnico em inglês.');
  await denied.manager.screenshot({ path: join(evidence, 'conexao-permissao-negada.png'), fullPage: true });
  assert.equal(actionClicks, 0, 'Nenhum botão de deixar de seguir foi clicado.');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url === 'https://www.tiktok.com/@conexao.teste'));
  checks.push('Nenhuma conta real, endpoint, alteração de relação ou perfil pessoal foi usado; todos os JavaScripts testados são byte a byte iguais ao compilado.');
  await writeFile(join(evidence, 'resultado-conexao.json'), JSON.stringify({ passed: true, checks, fixture: 'Somente HTML artificial em perfis descartáveis; manifest alterado apenas nas cópias de teste para simular listener ausente/permissão negada.' }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await recovered?.context.close();
  await denied?.context.close();
}
