/** Teste do pacote real em perfil descartável. Somente arquivos e páginas sintéticos. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const evidence = resolve(process.env.ELO_TEST_OUTPUT || join(root, '..', 'ui-evidence'));
await mkdir(evidence, { recursive: true });
const profile = await mkdtemp(join(evidence, 'profile-'));
const extension = join(root, '.output', 'chrome-mv3');
const checks = [];
const errors = [];
const localDate = value => {
  const date = new Date(value);
  return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};
const dates = [3,2,1].map(days => localDate(Date.now() - days * 86400000));
const fixture = (followers, following) => ({ 'Profile And Settings': {
  'Profile Information': { ProfileMap: { userName: 'conta.teste' } },
  'Follower': { FansList: followers.map(UserName => ({UserName, Date:'2025-01-01 12:00:00'})) },
  ...(following ? { 'Following': { Following: following.map(UserName => ({UserName, Date:'2025-01-01 12:00:00'})) } } : {}),
} });
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.ELO_CHROME_EXECUTABLE ? { executablePath: process.env.ELO_CHROME_EXECUTABLE } : { channel: 'chromium' }),
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run', '--disable-background-networking', '--disable-sync'],
    viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', colorScheme: 'light',
  });
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  // O teste nunca envia pedidos ao TikTok nem a outro site.
  await context.route('https://**/*', route => route.abort());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', {timeout:20000});
  const extensionId = new URL(worker.url()).hostname;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/manager.html`);
  await page.getByRole('heading', {name:'Não precisa baixar um arquivo para ler quem você segue.'}).waitFor();
  assert.equal(await page.locator('input[type=file]').count(),0);
  checks.push('Extensão MV3 real carrega gerenciador sem login ou dados pré-existentes');
  const importData = async (name, content, date, complete) => {
    if (!await page.locator('input[type=file]').isVisible()) await page.getByRole('button', {name:'＋ Importar análise',exact:true}).click();
    await page.locator('input[type=file]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(content))});
    await page.getByRole('heading',{name:'Confira antes de salvar'}).waitFor();
    await page.getByLabel('Data de referência do pacote', {exact:true}).fill(date);
    const checkbox = page.getByRole('checkbox',{name:/Conferi a conta/});
    if (complete) await checkbox.check(); else assert.equal(await checkbox.isEnabled(), false);
    await page.getByRole('button',{name:complete?'Salvar análise completa':'Salvar como parcial',exact:true}).click();
    await page.getByRole('heading',{name:'Confira antes de salvar'}).waitFor({state:'hidden'});
    assert.equal(await page.getByRole('alert').count(),0, await page.getByRole('alert').allTextContents().then(items => items.join('\n')));
  };
  await importData('primeiro.json', fixture(['ana','mateus'],['ana','bruno']),dates[0],true);
  await page.getByRole('link',{name:/@bruno/}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'Selecionar @bruno',exact:true}).isEnabled(),true);
  checks.push('Importação oficial sintética completa reconhece conta e calcula não recíprocos');
  await page.getByRole('button',{name:'Proteger @bruno',exact:true}).click();
  await page.getByRole('button',{name:'Desproteger @bruno',exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'Selecionar @bruno',exact:true}).isEnabled(),false);
  checks.push('Proteção persiste e impede seleção para ação');
  await importData('parcial.json',fixture(['ana'],null),dates[1],false);
  await page.getByRole('heading',{name:'Nenhum perfil nesta lista'}).waitFor();
  await page.getByRole('button',{name:'Análises e mudanças',exact:true}).click();
  assert.match(await page.locator('.history').innerText(),/Sem comparação/);
  checks.push('Parcial não calcula reciprocidade nem produz perdas');
  await importData('segundo.json',fixture(['ana','clara'],['ana','bruno']),dates[2],true);
  await page.getByRole('button',{name:'Análises e mudanças',exact:true}).click();
  const history = await page.locator('.history').innerText();
  assert.match(history,/\+1/); assert.match(history,/−1/);
  await page.getByText('Ver nomes detectados',{exact:true}).click();
  assert.match(await page.locator('.history').innerText(),/@clara/);
  assert.match(await page.locator('.history').innerText(),/@mateus/);
  checks.push('Segunda análise completa compara com a última completa, ignorando parcial como base');
  const select = page.getByLabel('Análise exibida',{exact:true});
  const options = await select.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  await select.selectOption(options.at(-1));
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:'CSV desta análise ↓',exact:true}).click();
  const csv = await readFile(await (await csvDownload).path(),'utf8');
  assert.match(csv,/mateus/); assert.doesNotMatch(csv,/clara/);
  checks.push('CSV corresponde à análise histórica selecionada');
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:'JSON com histórico ↓',exact:true}).click();
  const exported = JSON.parse(await readFile(await (await jsonDownload).path(),'utf8'));
  assert.equal(exported.schema,'elo-tiktok/1'); assert.equal(exported.snapshots.length,3);
  assert.deepEqual(exported.protected,['bruno']); assert.equal(exported.changes.length,1);
  checks.push('JSON exporta histórico, diferenças e protegidos');
  await page.reload();
  await page.getByRole('link',{name:/@bruno/}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'Selecionar @bruno',exact:true}).isEnabled(),false);
  checks.push('IndexedDB mantém conta, análises e protegidos após recarregar');
  await page.getByRole('button',{name:/Seguidores/}).click();
  await page.getByRole('searchbox',{name:'Buscar perfis'}).fill('clara');
  await page.getByRole('link',{name:/@clara/}).waitFor();
  assert.equal(await page.locator('tbody tr').count(),1);
  await page.getByRole('searchbox',{name:'Buscar perfis'}).fill('');
  checks.push('Busca filtra perfis da lista selecionada');
  await page.screenshot({path:join(evidence,'gerenciador-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(evidence,'gerenciador-estreito.png'),fullPage:true});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'layout sem overflow horizontal externo');
  checks.push('Interface em largura 390px sem transbordamento horizontal da página');
  await page.setViewportSize({width:1440,height:1000});
  // Conta nova sem qualquer arquivo importado. Todas as páginas vêm destas fixtures.
  const tiktokRequests = [];
  const following = new Set(['ana','bruno','carla']);
  const clicks = [];
  let openedLists = 0;
  await context.exposeBinding('fixtureUnfollow', (_source, target) => { following.delete(target); clicks.push(target); });
  await context.exposeBinding('fixtureOpenList', (_source, owner) => { if (owner === 'direta.teste') openedLists++; });
  const row = name => `<li style="height:55px;list-style:none"><a href="/@${name}"><span aria-hidden="true">◯</span></a><a href="/@${name}">@${name}</a><button data-e2e="follow-button" onclick="window.fixtureUnfollow('${name}')">Seguindo</button></li>`;
  await context.route('https://www.tiktok.com/**', async route => {
    const url = new URL(route.request().url());
    tiktokRequests.push(url.pathname);
    const target = url.pathname.slice(2);
    if (!['direta.teste','interacao.teste','ana','bruno','carla'].includes(target)) return route.abort();
    const own = ['direta.teste','interacao.teste'].includes(target);
    const owner = own ? target : 'direta.teste';
    const followersRows = row('seguidor.errado');
    const list = own ? `<button data-e2e="following-count" onclick="document.querySelector('section').hidden=false;window.fixtureOpenList('${owner}')">${following.size}</button><section data-e2e="follow-info-popup" hidden><h2>@${owner}</h2><div style="display:flex;gap:25px"><div data-fixture-tab="followers" tabindex="0" onclick="document.getElementById('rows').innerHTML=${JSON.stringify(followersRows).replace(/"/g,'&quot;')}">Seguidores</div><div data-fixture-tab="following" tabindex="0">Seguindo</div></div><div id="scroller" style="height:90px;overflow-y:auto"><ul id="rows" style="margin:0;padding:0">${[...following].slice(0,2).map(row).join('')}</ul><div style="height:500px"></div></div></section><script>document.getElementById('scroller').addEventListener('scroll',function(){if(this.scrollTop>0&&!this.dataset.loaded){this.dataset.loaded='true';document.getElementById('rows').innerHTML=${JSON.stringify([...following].slice(2).map(row).join(''))};}});</script>` : `<button data-e2e="follow-button" onclick="window.fixtureUnfollow('${target}').then(()=>this.textContent='Seguir')">${following.has(target)?'Seguindo':'Seguir'}</button>`;
    return route.fulfill({ contentType:'text/html', body:`<!doctype html><html lang="pt-BR"><head><title>TikTok artificial — teste elo</title></head><body><p>FIXTURE SINTÉTICA. Nenhuma conta real.</p><nav><a data-e2e="nav-profile" href="/@${owner}">Perfil</a></nav><span data-e2e="user-title">Nome de Exibição</span><span data-e2e="user-subtitle">@${target}</span>${list}</body></html>` });
  });
  const tiktok = await context.newPage();
  await tiktok.goto('https://www.tiktok.com/@interacao.teste');
  await page.bringToFront();
  await page.getByRole('button',{name:'Ler quem sigo no TikTok',exact:true}).click();
  const popup = tiktok.locator('[data-e2e="follow-info-popup"]');
  await popup.waitFor({state:'visible',timeout:20000});
  const waitCollection = async (accept, description) => {
    const deadline = Date.now() + 20000;
    let last = null;
    while (Date.now() < deadline) {
      const response = await page.evaluate(() => chrome.runtime.sendMessage({type:'status-collection'}));
      assert.equal(response.ok,true,JSON.stringify(response));
      last = response.collection;
      if (accept(last)) return last;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    throw new Error(`${description}: ${JSON.stringify(last)}`);
  };
  await waitCollection(collection => collection?.account === 'interacao.teste' && collection.state === 'running' && collection.collected === 2, 'Aguardando dois perfis antes da interação');
  await popup.locator('[data-fixture-tab="followers"]').click();
  const interrupted = await waitCollection(collection => collection?.account === 'interacao.teste' && collection.state !== 'running', 'Aguardando interrupção após troca para Seguidores');
  assert.equal(interrupted.complete,false);
  assert.equal(interrupted.state,'stopped');
  assert.ok(interrupted.result, 'Interrupção preserva somente os perfis já lidos');
  assert.ok(!interrupted.result.profiles.some(profile => profile.username === 'seguidor.errado'), 'Seguidores não podem ser mesclados à lista de seguindo');
  assert.equal(await popup.locator('[href="/@seguidor.errado"]').count(),2, 'A fixture realmente trocou para seguidores e mantém avatar e identificador do mesmo perfil');
  assert.deepEqual(clicks,[]);
  await page.getByRole('combobox',{name:'Conta da análise',exact:true}).locator('option[value="interacao.teste"]').waitFor({state:'attached'});
  checks.push('Interação na aba Seguidores interrompe a leitura causal antes de misturar listas; nenhuma relação é alterada');
  await tiktok.goto('https://www.tiktok.com/@direta.teste');
  await page.bringToFront();
  await page.getByRole('button',{name:'Ler quem sigo no TikTok',exact:true}).click();
  await page.getByRole('button',{name:'Revisar todos que sigo (3)',exact:true}).waitFor({timeout:20000}).catch(async error => {
    console.log(await page.locator('body').innerText());
    console.log(await page.evaluate(() => chrome.runtime.sendMessage({type:'status-collection'})));
    throw error;
  });
  assert.equal(openedLists,1);
  assert.equal(await page.getByRole('combobox',{name:'Conta da análise',exact:true}).inputValue(),'direta.teste');
  assert.equal(await page.locator('tbody tr').count(),3);
  assert.deepEqual(clicks,[]);
  checks.push('Conta nova lê Seguindo sem arquivo e sem título de lista: popup com @usuário, abas div sem ARIA e três perfis virtualizados');
  const liveDownload = page.waitForEvent('download');
  await page.getByRole('button',{name:'JSON com histórico ↓',exact:true}).click();
  const liveData = JSON.parse(await readFile(await (await liveDownload).path(),'utf8'));
  assert.equal(liveData.snapshots.length,1); assert.equal(liveData.snapshots[0].complete,false);
  assert.deepEqual(liveData.snapshots[0].followingCollection,{complete:true,expected:3});
  assert.deepEqual(liveData.changes,[]);
  checks.push('Prova de Seguindo completo não inventa seguidores, reciprocidade ou perdas');
  await page.getByRole('button',{name:'Proteger @bruno',exact:true}).click();
  await page.getByRole('button',{name:'Revisar todos que sigo (2)',exact:true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.match(await dialog.locator('ul').innerText(),/@ana/);
  assert.match(await dialog.locator('ul').innerText(),/@carla/);
  assert.doesNotMatch(await dialog.locator('ul').innerText(),/@bruno/);
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.deepEqual(clicks,[]);
  checks.push('Revisar todos exclui protegido e cancelar revisão não altera relações');
  await page.getByRole('button',{name:'Desproteger @bruno',exact:true}).click();
  await page.screenshot({path:join(evidence,'gerenciador-direto.png'),fullPage:true});
  await page.getByRole('button',{name:'Revisar todos que sigo (3)',exact:true}).click();
  await dialog.getByRole('checkbox',{name:/Revisei todos os nomes/}).check();
  await dialog.getByRole('textbox',{name:'Confirmar conta para ação'}).fill('@conta.errada');
  assert.equal(await dialog.getByRole('button',{name:'Confirmar e deixar de seguir',exact:true}).isEnabled(),false);
  await dialog.getByRole('textbox',{name:'Confirmar conta para ação'}).fill('@direta.teste');
  await dialog.getByRole('button',{name:'Confirmar e deixar de seguir',exact:true}).click();
  await page.getByText(/Última operação: 3\/3/).waitFor({timeout:30000});
  assert.deepEqual(clicks,['ana','bruno','carla']); assert.equal(following.size,0);
  await page.getByRole('button',{name:'Histórico de ações',exact:true}).click();
  assert.equal(await page.getByText('Interface confirmou',{exact:true}).count(),3);
  checks.push('Uma revisão de todos navega por três perfis, confirma visualmente e registra sem repetir');
  await page.getByRole('button',{name:/^Seguindo/}).click();
  for (const name of ['ana','bruno','carla']) assert.equal(await page.getByRole('checkbox',{name:`Selecionar @${name}`,exact:true}).isEnabled(),false);
  checks.push('Todos os perfis já processados ficam fora de novo envio');
  assert.ok(tiktokRequests.every(path => /^\/@(direta\.teste|interacao\.teste|ana|bruno|carla)$/.test(path)));
  checks.push('Só navegações de perfis artificiais: nenhum endpoint TikTok solicitado');
  const otherAccount = fixture(['fan.teste'],['alvo.teste']);
  otherAccount['Profile And Settings']['Profile Information'].ProfileMap.userName = 'outra.conta';
  await importData('outra-conta.json',otherAccount,dates[0],true);
  await page.getByRole('link',{name:/@alvo.teste/}).waitFor();
  assert.equal(await page.getByRole('link',{name:/@bruno/}).count(),0);
  await page.getByRole('checkbox',{name:'Selecionar @alvo.teste',exact:true}).check();
  assert.equal(await page.getByRole('button',{name:'Revisar para deixar de seguir',exact:true}).isEnabled(),false);
  await page.getByRole('button',{name:'Proteger @alvo.teste',exact:true}).click();
  await page.getByRole('button',{name:'Desproteger @alvo.teste',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Conta da análise',exact:true}).selectOption('direta.teste');
  await page.getByRole('link',{name:/@bruno/}).waitFor();
  assert.equal(await page.getByRole('link',{name:/@alvo.teste/}).count(),0);
  await page.getByRole('button',{name:/^Protegidos/}).click();
  assert.equal(await page.locator('tbody tr').count(),0);
  checks.push('Troca de conta isola listas e protegidos; sessão de outra conta bloqueia revisão de ações');
  assert.deepEqual(errors,[]);
  checks.push('Nenhum erro JavaScript durante os fluxos');
  await writeFile(join(evidence,'resultado-ui.json'),JSON.stringify({passed:true,checks,fixture:'Todos os nomes e arquivos são sintéticos. Nenhuma chamada ao TikTok foi permitida.'},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
} finally { await context?.close(); }
