import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { computeRelationships } from '../../lib/diff';
import { makeSnapshot, parseOfficialFiles } from '../../lib/import';
import { exportCsv, exportData } from '../../lib/export';
import { TrackerStore } from '../../lib/store';
import type { AccountData, ImportDraft, Profile, Snapshot } from '../../lib/types';
import type { CollectionJob } from '../../lib/messages';
import './style.css';

type Tab = 'notFollowingBack' | 'followers' | 'following' | 'fans' | 'mutuals' | 'protected' | 'history' | 'actions';
interface Status { tabId: number; account: string | null; blocked: string | null; profile: string | null; canUnfollow: boolean }
interface Review { token: string; account: string; targets: string[]; expiresAt: number; tabId: number }
interface Job { id: string; account: string; total: number; completed: number; state: string; current?: string; message: string }
const labels: Record<Tab, string> = { notFollowingBack: 'Não seguem de volta', followers: 'Seguidores', following: 'Seguindo', fans: 'Fãs', mutuals: 'Mútuos', protected: 'Protegidos', history: 'Análises e mudanças', actions: 'Histórico de ações' };
const storePromise = TrackerStore.open();
const number = (n: number) => n.toLocaleString('pt-BR');
const date = (n: number) => new Date(n).toLocaleString('pt-BR');
const localDate = (n: number) => { const d = new Date(n); return new Date(n - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

async function request<T>(payload: object): Promise<T> {
  const response = await browser.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || 'Não foi possível comunicar com a extensão. Recarregue a página.');
  return response as T;
}

function download(text: string, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function App() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState('');
  const [storedData, setData] = useState<AccountData | null>(null);
  const data = storedData?.account === account ? storedData : null;
  const [snapshotId, setSnapshotId] = useState('');
  const [tab, setTab] = useState<Tab>('notFollowingBack');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [draftSource, setDraftSource] = useState<'file' | 'browser'>('file');
  const [draftAccount, setDraftAccount] = useState('');
  const [capturedAt, setCapturedAt] = useState('');
  const [complete, setComplete] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [confirmAccount, setConfirmAccount] = useState('');
  const [confirmReview, setConfirmReview] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [collection, setCollection] = useState<CollectionJob | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestSequence = useRef(0);
  const cancelImport = useRef(false);
  const lastJobState = useRef('');
  const lastCollection = useRef('');
  const run = async (label: string, work: () => Promise<void>) => {
    setError(''); setNotice(''); setBusy(label);
    try { await work(); } catch (e) { setError(message(e)); } finally { setBusy(''); }
  };
  const refresh = async (name: string) => {
    const seq = ++requestSequence.current;
    const store = await storePromise;
    const [names, next] = await Promise.all([store.listAccounts(), name ? store.getData(name) : Promise.resolve(null)]);
    if (seq !== requestSequence.current) return;
    setAccounts(names); setData(next);
    if (!name && names.length) setAccount(names[0]!);
  };
  useEffect(() => { void refresh(account).catch(e => setError(message(e))); setSelected(new Set()); setSnapshotId(''); setPage(0); }, [account]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [tab, query, snapshotId]);
  useEffect(() => {
    if (review) dialog.current?.showModal(); else dialog.current?.close();
  }, [review]);
  useEffect(() => {
    let disposed = false;
    let polling = false;
    const tick = async () => {
      if (polling) return;
      polling = true;
      try {
        const [response, live] = await Promise.all([
          request<{ job: Job | null }>({ type: 'status-job' }),
          request<{ collection: CollectionJob | null }>({ type: 'status-collection' }),
        ]);
        if (!disposed) {
          setJob(response.job);
          setCollection(live.collection);
          const finished = live.collection;
          if (finished && finished.state !== 'running' && finished.result && lastCollection.current !== finished.id) {
            lastCollection.current = finished.id;
            const result = finished.result;
            if (result.profiles.length || result.complete) {
              const store = await storePromise;
              const existing = await store.getData(result.account);
              if (!existing.snapshots.some(s => s.id === finished.id)) {
                const next = await makeSnapshot({account: result.account, followers: null, following: result.profiles, source: 'official-json', warnings: [result.notice]}, {account: result.account, capturedAt: result.capturedAt, confirmedComplete: false});
                try {
                  await store.saveSnapshot({...next, id: finished.id, source: 'browser', followingCollection: {complete: result.complete, expected: result.expected}});
                } catch (e) {
                  if (!(await store.getData(result.account)).snapshots.some(s => s.id === finished.id)) throw e;
                }
              }
              setAccount(result.account); await refresh(result.account); setSnapshotId(''); setTab('following'); setQuery('');
            }
            setNotice(result.notice);
          }
          const version = response.job ? `${response.job.id}:${response.job.state}` : '';
          if (response.job && response.job.state !== 'running' && lastJobState.current !== version) await refresh(account);
          lastJobState.current = version;
        }
      } catch (e) { if (!disposed) setError(message(e)); } finally { polling = false; }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, 2000);
    return () => { disposed = true; clearInterval(timer); };
  }, [account]);

  const snapshot: Snapshot | undefined = data?.snapshots.find(s => s.id === snapshotId) ?? data?.snapshots.at(-1);
  const keep = new Set(data?.protected ?? []);
  const profiles = useMemo(() => new Map<string, Profile>([...(snapshot?.followers ?? []), ...(snapshot?.following ?? [])].map(p => [p.username, p])), [snapshot]);
  const relations = useMemo(() => snapshot?.complete ? computeRelationships({ followerIds: snapshot.followers.map(p => p.username), followingIds: snapshot.following.map(p => p.username) }) : null, [snapshot]);
  const lists = {
    followers: snapshot?.followers.map(p => p.username) ?? [], following: snapshot?.following.map(p => p.username) ?? [],
    notFollowingBack: relations?.notFollowingBack ?? [], fans: relations?.fans ?? [], mutuals: relations?.mutuals ?? [], protected: data?.protected ?? [],
  };
  const ids = (tab in lists ? lists[tab as keyof typeof lists] : []).filter(id => `${id} ${profiles.get(id)?.displayName ?? ''}`.toLowerCase().includes(query.toLowerCase())).slice().sort((a, b) => a.localeCompare(b));
  const visible = ids.slice(page * 100, (page + 1) * 100);
  useEffect(() => { setPage(current => Math.min(current, Math.max(0, Math.ceil(ids.length / 100) - 1))); }, [ids.length]);
  const actionable = (id: string) => !keep.has(id) && !(data?.actions.some(a => a.target === id && ['attempting', 'uncertain', 'verified'].includes(a.status))) && lists.following.includes(id);
  const isList = tab in lists;
  const running = job?.state === 'running';
  const collecting = collection?.state === 'running';
  const locked = !!busy || !!running || collecting || (!!account && !data);
  const eligibleFollowing = lists.following.filter(actionable);
  const followingComplete = snapshot?.complete || snapshot?.followingCollection?.complete;

  const readFiles = (files: FileList | null) => {
    if (!files?.length) return;
    cancelImport.current = false;
    void run('Lendo arquivos…', async () => {
      if ([...files].some(f => f.size > 80 * 1024 * 1024) || [...files].reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) throw new Error('Selecione até 100 MB no total, no máximo 80 MB por arquivo. Extraia apenas as listas e o perfil do ZIP oficial.');
      const inputs: {name: string; text: string}[] = [];
      for (const file of files) { if (cancelImport.current) return; inputs.push({ name: file.name, text: await file.text() }); }
      if (cancelImport.current) return;
      const result = parseOfficialFiles(inputs);
      if (cancelImport.current) return;
      setDraft(result); setDraftSource('file'); setDraftAccount(result.account ?? account); setComplete(false);
      setCapturedAt(result.capturedAt ? localDate(result.capturedAt) : ''); setShowImport(true);
    });
  };
  const save = () => void run('Salvando análise local…', async () => {
    if (!draft || !capturedAt) throw new Error('Informe a data de referência do pacote.');
    const next = await makeSnapshot(draft, { account: draftAccount, capturedAt: new Date(capturedAt).getTime(), confirmedComplete: draftSource === 'file' && complete });
    await (await storePromise).saveSnapshot(draftSource === 'browser' ? { ...next, source: 'browser', complete: false } : next);
    setAccount(next.account); await refresh(next.account); setSnapshotId(''); setDraft(null); setShowImport(false);
    setNotice(next.complete ? 'Análise salva. Mudanças são comparadas apenas com outra análise completa da mesma conta.' : 'Captura parcial salva. Ela não produz conclusões sobre perdas ou reciprocidade.');
  });
  const inspect = () => void run('Conferindo a sessão do TikTok…', async () => {
    const response = await request<{ status: Status }>({ type: 'status' });
    setStatus(response.status);
    if (!response.status.account) setNotice('Abra seu perfil no TikTok, com a sessão iniciada, e deixe visível o link Perfil do menu. Depois confira novamente.');
  });
  const readFollowing = () => void run('Iniciando leitura do TikTok aberto…', async () => {
    const live = await request<{status: Status}>({type: 'status'});
    setStatus(live.status);
    if (!live.status.account || live.status.blocked) throw new Error(live.status.blocked || 'Abra o TikTok autenticado no mesmo Chrome e recarregue a página para a extensão reconhecer seu perfil.');
    const result = await request<{collection: CollectionJob}>({type: 'collect-following', tabId: live.status.tabId, account: live.status.account});
    setCollection(result.collection); setShowImport(false); setDraft(null);
  });
  const capture = (kind: 'followers' | 'following') => void run('Lendo a lista aberta…', async () => {
    if (!status?.account) throw new Error('Confira primeiro a sessão do TikTok.');
    const response = await request<{profiles: Profile[]; account: string; complete: false; notice: string}>({ type: 'capture', tabId: status.tabId, kind });
    const previous = draftSource === 'browser' && draft?.account === response.account ? draft : { account: response.account, followers: null, following: null, warnings: [], source: 'official-json' as const };
    setDraft({ ...previous, [kind]: response.profiles, warnings: [response.notice] }); setDraftSource('browser');
    setDraftAccount(response.account); setCapturedAt(localDate(Date.now())); setComplete(false); setShowImport(true);
  });
  const protect = (username: string) => void run('Atualizando proteção…', async () => {
    if (!data || data.account !== account) throw new Error('Aguarde o carregamento da conta antes de alterar a proteção.');
    await (await storePromise).setProtected(account, username, !keep.has(username));
    setSelected(new Set([...selected].filter(id => id !== username))); await refresh(account);
  });
  const beginReview = (targets = [...selected]) => void run('Conferindo seleção e protegidos…', async () => {
    if (!data || snapshot?.id !== data.snapshots.at(-1)?.id) throw new Error('Exiba a análise mais recente antes de revisar ações.');
    const live = await request<{status: Status}>({type: 'status', ...(status ? {tabId: status.tabId} : {})});
    setStatus(live.status);
    if (live.status.account !== account || live.status.blocked) throw new Error('A conta conectada deve ser a mesma conta da análise. Confira a sessão.');
    const response = await request<{review: Review}>({ type: 'review', tabId: live.status.tabId, account, targets });
    setConfirmAccount(''); setConfirmReview(false); setReview(response.review);
  });
  const execute = () => void run('Iniciando operação revisada…', async () => {
    if (!review || !confirmReview) return;
    const response = await request<{job: Job}>({ type: 'execute', token: review.token, confirmedAccount: confirmAccount });
    setJob(response.job); setReview(null); setSelected(new Set());
  });

  return <div class="app">
    <aside class="sidebar">
      <a class="brand" href="#"><span class="logo" aria-hidden="true">e</span><span>elo <small>TikTok</small></span></a>
      <span class="eyebrow">SEUS RELACIONAMENTOS</span>
      <label class="account-label">Conta da análise<select aria-label="Conta da análise" value={account} disabled={locked} onChange={e => setAccount(e.currentTarget.value)}>{!accounts.length && <option value="">Nenhuma conta importada</option>}{accounts.map(name => <option key={name} value={name}>@{name}</option>)}</select></label>
      <nav aria-label="Seções">{(Object.keys(labels) as Tab[]).map(key => <button key={key} class={tab === key ? 'nav active' : 'nav'} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{labels[key]}{key in lists && <span>{number(lists[key as keyof typeof lists].length)}</span>}</button>)}</nav>
      <div class="sidebar-foot"><span class="dot"/> Somente neste navegador<p>Gratuito · Código aberto · MIT<br/>Seus dados ficam no seu computador.</p><button class="text-button" onClick={() => setShowImport(!showImport)}>Como importar seus dados</button></div>
    </aside>
    <main>
      <header class="top"><div><span class="eyebrow">UM POUCO MAIS DE CLAREZA</span><h1>Seus vínculos, de perto<span>.</span></h1><p>Leia sua conta aberta no TikTok e revise quem deseja deixar de seguir.</p></div><div class="button-row"><button class="primary" disabled={locked} onClick={readFollowing}>Ler quem sigo no TikTok</button><button disabled={locked} onClick={() => setShowImport(true)}>＋ Importar análise</button></div></header>
      <div aria-live="polite" aria-atomic="true">{busy && <div class="banner progress"><span class="spinner"/>{busy}{busy === 'Lendo arquivos…' && <button onClick={() => {cancelImport.current = true; setNotice('Importação cancelada. Nenhum dado foi salvo.');}}>Cancelar</button>}</div>}{notice && <div class="banner success" role="status">{notice}</div>}</div>
      {error && <div class="banner error" role="alert">{error}<button aria-label="Fechar mensagem de erro" onClick={() => setError('')}>×</button></div>}
      <section class="stats" aria-label="Resumo da análise"><div><span>Seguidores</span><strong>{snapshot && !snapshot.followingCollection ? number(snapshot.followers.length) : '—'}</strong><small>quem acompanha você</small></div><div><span>Seguindo</span><strong>{snapshot ? number(snapshot.following.length) : '—'}</strong><small>quem você acompanha</small></div><div><span>Mútuos</span><strong>{relations ? number(relations.mutuals.length) : '—'}</strong><small>conexões de mão dupla</small></div><div class="stat-accent"><span>Protegidos</span><strong>{number(keep.size)}</strong><small>fora de qualquer ação</small></div></section>
      <section class="connection card" aria-label="Conexão com o TikTok"><div><strong>Sessão no navegador</strong><p>{status?.account ? `@${status.account}${status.blocked ? ` · ${status.blocked}` : ' · identidade reconhecida na página'}` : 'Abra o TikTok com sua sessão iniciada para conferir a conta.'}</p></div><div class="button-row"><button disabled={locked} onClick={() => void browser.tabs.create({url: 'https://www.tiktok.com/'})}>Abrir TikTok ↗</button><button disabled={locked} onClick={inspect}>Conferir sessão</button></div><details><summary>Capturar listas abertas · experimental</summary><p>No seu próprio perfil, abra a lista Seguidores ou Seguindo e carregue as linhas desejadas. A extensão lê apenas os perfis já visíveis nessa lista; a captura será sempre parcial.</p><div class="button-row"><button disabled={locked || !status?.account || !!status.blocked} onClick={() => capture('followers')}>Ler seguidores abertos</button><button disabled={locked || !status?.account || !!status.blocked} onClick={() => capture('following')}>Ler seguindo abertos</button></div></details></section>
      {!snapshot && !showImport && <section class="card welcome"><span class="eyebrow">COMECE PELO TIKTOK ABERTO</span><h2>Não precisa baixar um arquivo para ler quem você segue.</h2><p>Com sua conta aberta neste navegador, clique em <b>Ler quem sigo no TikTok</b>. O elo abre seu perfil, percorre a lista Seguindo e prepara os nomes para revisão. A leitura não deixa de seguir ninguém.</p><p class="small">Depois, escolha revisar todos ou apenas alguns perfis. Protegidos e tentativas anteriores ficam fora. A compatibilidade com a página atual ainda é experimental.</p></section>}
      {collecting && <section class="card job" aria-live="polite"><h2>Lendo quem você segue · @{collection.account}</h2><progress {...(collection.expected === null ? {} : {max: Math.max(1, collection.expected), value: collection.collected})}/><p>{number(collection.collected)} {collection.expected === null ? 'perfis lidos' : `de ${number(collection.expected)} perfis`} · {collection.message}</p><button class="danger" onClick={() => void run('Interrompendo leitura…', async () => {await request({type:'cancel'});})}>Cancelar leitura</button><p class="small">O TikTok será trazido para frente. Mantenha a aba visível. Nenhuma conta será deixada de seguir durante a leitura.</p></section>}
      {collection && !collecting && !collection.result && <div class="banner">Leitura: {collection.message}</div>}
      {showImport && <section class="card import" aria-label="Importação de dados"><div class="section-heading"><div><span class="eyebrow">ALTERNATIVA POR ARQUIVO</span><h2>Uma análise, sem entregar sua senha.</h2></div><button aria-label="Fechar importação" disabled={!!busy} onClick={() => { setShowImport(false); setDraft(null); }}>×</button></div><p>No aplicativo TikTok: <b>Perfil → ☰ → Configurações e privacidade → Conta → Baixar seus dados</b>. Solicite os dados do perfil e as listas em <b>JSON</b>. Quando estiverem prontos, baixe e extraia o ZIP.</p><label class="upload">Escolher JSON ou arquivos TXT<input type="file" accept=".json,.txt" multiple disabled={locked} onChange={e => {readFiles(e.currentTarget.files); e.currentTarget.value = '';}}/><span>Selecione o JSON completo ou os TXT de seguidores, seguindo e perfil juntos.</span></label><p class="small">Leitura local. Nenhuma senha, cookie ou chave de API é solicitada. Não selecione o ZIP.</p>
        {draft && <div class="import-review"><h3>Confira antes de salvar</h3><p><b>{draft.followers === null ? 'Seguidores: seção ausente' : `${number(draft.followers.length)} seguidores`}</b> · <b>{draft.following === null ? 'Seguindo: seção ausente' : `${number(draft.following.length)} seguindo`}</b> · {draftSource === 'browser' ? 'Captura parcial do navegador' : 'Arquivo local'}</p>{draft.warnings.map((warning, i) => <p class="warning" key={i}>{warning}</p>)}<div class="fields"><label>Conta proprietária dos dados<input aria-label="Conta proprietária dos dados" value={draftAccount} disabled={!!draft.account} placeholder="@seu.usuario" onInput={e => setDraftAccount(e.currentTarget.value)}/></label><label>Data de referência do pacote<input aria-label="Data de referência do pacote" type="datetime-local" value={capturedAt} onInput={e => setCapturedAt(e.currentTarget.value)}/></label></div><p class="small">Informe a data em que os dados foram gerados, não a data em que alguém seguiu você. O TikTok pode omitir alterações das últimas 24–48 horas. A análise usa nomes de usuário: renomeações podem parecer entradas e saídas.</p>{draftSource === 'file' && <label class="check"><input type="checkbox" checked={complete} disabled={draft.followers === null || draft.following === null || draft.completionBlocked} onChange={e => setComplete(e.currentTarget.checked)}/>Conferi a conta, a data e que ambas as listas são completas no pacote oficial. Autorizo comparações entre estes arquivos.</label>}<div class="button-row"><button class="primary" disabled={locked || !draftAccount || !capturedAt} onClick={save}>Salvar {complete && draftSource === 'file' ? 'análise completa' : 'como parcial'}</button><button disabled={locked} onClick={() => setDraft(null)}>Descartar leitura</button></div></div>}
      </section>}
      {running && <section class="card job" aria-live="polite"><h2>Operação em andamento · @{job.account}</h2><progress max={job.total} value={job.completed}/><p>{job.completed} de {job.total} · {job.current ? `@${job.current}` : ''} · {job.message}</p><button class="danger" onClick={() => void run('Interrompendo…', async () => {await request({type:'cancel'});})}>Cancelar operação</button><p class="small">Cancelamento impede o próximo clique. Uma alteração já enviada pode ter ocorrido e será registrada como incerta se não puder ser confirmada.</p></section>}
      {job && !running && <div class="banner">Última operação: {job.completed}/{job.total} · {job.message}</div>}
      <section class="card content"><div class="section-heading"><div><span class="eyebrow">{account ? `@${account}` : 'SUA CONTA'}</span><h2>{labels[tab]}</h2></div>{data && <div class="button-row"><button disabled={locked} onClick={() => download(exportCsv({ ...data, snapshots: snapshot ? [snapshot] : [] }), `elo-tiktok-${account}.csv`, 'text/csv;charset=utf-8')}>CSV desta análise ↓</button><button disabled={locked} onClick={() => download(exportData(data), `elo-tiktok-${account}.json`, 'application/json')}>JSON com histórico ↓</button></div>}</div>
        {snapshot && <div class="snapshot-bar"><label>Análise exibida<select aria-label="Análise exibida" value={snapshot.id} disabled={locked} onChange={e => setSnapshotId(e.currentTarget.value)}>{[...(data?.snapshots ?? [])].reverse().map(s => <option key={s.id} value={s.id}>{date(s.capturedAt)} · {s.complete ? 'completa declarada' : s.followingCollection?.complete ? 'Seguindo conferido' : 'parcial'}</option>)}</select></label><span class={snapshot.complete ? 'pill' : 'pill warn'}>{snapshot.complete ? 'Listas completas declaradas' : snapshot.followingCollection?.complete ? 'Seguindo conferido pelo total' : 'Captura parcial'}</span></div>}
        {tab === 'following' && snapshot && <div class="all-following"><div><h3>Deixar de seguir todos</h3><p>{number(eligibleFollowing.length)} perfis podem entrar na revisão. {number(lists.following.length - eligibleFollowing.length)} protegidos ou com tentativa anterior ficarão de fora.</p>{!followingComplete && <p class="warning">A leitura é parcial: só os nomes encontrados podem ser revisados. Ainda não foi confirmado que esta lista contém todo mundo.</p>}</div><button class="danger" disabled={locked || !eligibleFollowing.length || snapshot.id !== data?.snapshots.at(-1)?.id} onClick={() => {setSelected(new Set(eligibleFollowing)); void beginReview(eligibleFollowing);}}>{snapshot.followingCollection?.complete ? 'Revisar todos que sigo' : snapshot.complete ? 'Revisar todos da análise' : 'Revisar perfis lidos'} ({number(eligibleFollowing.length)})</button></div>}
        {snapshot && !snapshot.complete && <p class="warning">Esta análise não tem ambas as listas completas. Reciprocidade e perdas ficam indisponíveis; a lista Seguindo pode ser usada para revisar ações.</p>}
        {isList && <><div class="list-tools"><label class="search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar perfis" placeholder="Buscar por @usuário ou nome" value={query} onInput={e => setQuery(e.currentTarget.value)}/></label><span>{number(ids.length)} perfis</span></div>{selected.size > 0 && <div class="selection-bar"><strong>{selected.size} selecionado(s)</strong><button disabled={locked || !status?.account || status.account !== account || !!status.blocked} class="danger" onClick={() => beginReview()}>Revisar para deixar de seguir</button><button onClick={() => setSelected(new Set())}>Limpar seleção</button></div>}
          {visible.length > 0 ? <div class="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Selecionar esta página, exceto protegidos e tentativas anteriores" checked={visible.some(actionable) && visible.filter(actionable).every(id => selected.has(id))} disabled={locked || !visible.some(actionable)} onChange={e => {const next = new Set(selected); visible.filter(actionable).forEach(id => e.currentTarget.checked ? next.add(id) : next.delete(id)); setSelected(next);}}/></th><th>Perfil</th><th>Relação</th><th>Proteção</th></tr></thead><tbody>{visible.map(id => <tr key={id}><td><input type="checkbox" aria-label={`Selecionar @${id}`} disabled={locked || !actionable(id)} checked={selected.has(id)} onChange={e => {const next = new Set(selected); if(e.currentTarget.checked) next.add(id); else next.delete(id); setSelected(next);}}/></td><td><a class="profile" href={`https://www.tiktok.com/@${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer"><span class="avatar" aria-hidden="true">{id.slice(0,2).toUpperCase()}</span><span><b>@{id}</b>{profiles.get(id)?.displayName && <small>{profiles.get(id)?.displayName}</small>}</span><span class="external" aria-hidden="true">↗</span></a></td><td class="relation">{relations?.mutuals.includes(id) ? 'Mútuo' : relations?.fans.includes(id) ? 'Fã' : relations?.notFollowingBack.includes(id) ? 'Não segue de volta' : '—'}</td><td><button class={keep.has(id) ? 'keep kept' : 'keep'} aria-label={`${keep.has(id) ? 'Desproteger' : 'Proteger'} @${id}`} aria-pressed={keep.has(id)} disabled={locked} onClick={() => protect(id)}>{keep.has(id) ? '◆ Protegido' : '◇ Proteger'}</button></td></tr>)}</tbody></table></div> : <div class="empty"><span aria-hidden="true">◎</span><h3>{snapshot ? 'Nenhum perfil nesta lista' : 'O primeiro elo começa aqui'}</h3><p>{query ? 'Tente outro nome ou limpe a busca.' : snapshot ? 'As relações aparecem quando ambas as listas estão completas.' : 'Importe seus dados para ver seus relacionamentos.'}</p></div>}{ids.length > 100 && <div class="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Anterior</button><span>Página {page + 1} de {Math.ceil(ids.length / 100)}</span><button disabled={(page + 1) * 100 >= ids.length} onClick={() => setPage(page + 1)}>Próxima →</button></div>}<p class="small footnote">Perfis protegidos e tentativas anteriores não entram na seleção de ações. Remover seguidores está indisponível nesta versão: falta um método verificável no TikTok web.</p></>}
        {tab === 'history' && <div class="history"><p>As datas abaixo indicam quando a diferença foi detectada entre arquivos. Elas não indicam o instante em que alguém deixou de seguir.</p>{!data?.snapshots.length && <p>Nenhuma análise salva.</p>}{[...(data?.snapshots ?? [])].reverse().map(s => {const changes = data?.changes.find(c => c.snapshotId === s.id); return <article key={s.id}><time>{date(s.importedAt)}</time><div><h3>{s.complete ? 'Análise completa declarada' : 'Análise parcial'} · {number(s.followers.length)} seguidores / {number(s.following.length)} seguindo</h3><p>Referência do pacote: {date(s.capturedAt)} · Origem: {s.source}</p>{changes ? <><p><b>+{changes.followersGained.length}</b> novos nomes · <b>−{changes.followersLost.length}</b> ausentes na lista de seguidores · {changes.followingAdded.length} entradas / {changes.followingRemoved.length} saídas em seguindo</p><details><summary>Ver nomes detectados</summary><p>Novos seguidores: {changes.followersGained.map(n => '@'+n).join(', ') || 'nenhum'}</p><p>Ausentes: {changes.followersLost.map(n => '@'+n).join(', ') || 'nenhum'}</p><p>Seguindo, entradas: {changes.followingAdded.map(n => '@'+n).join(', ') || 'nenhuma'}</p><p>Seguindo, saídas: {changes.followingRemoved.map(n => '@'+n).join(', ') || 'nenhuma'}</p></details></> : <p>Sem comparação: primeira base completa ou captura parcial.</p>}</div></article>;})}</div>}
        {tab === 'actions' && <div class="history"><p>Uma tentativa incerta nunca é repetida pela extensão. Confira o estado manualmente no TikTok. Análises importadas continuam representando a data de referência do pacote.</p>{!data?.actions.length && <div class="empty"><h3>Nenhuma ação registrada</h3><p>A extensão só age após revisão nominal e confirmação da conta.</p></div>}{[...(data?.actions ?? [])].reverse().map(a => <article key={a.id}><time>{date(a.at)}</time><div><h3>@{a.target} <span class="pill">{{attempting:'Enviado / pendente',verified:'Interface confirmou',uncertain:'Resultado incerto',blocked:'Bloqueado',cancelled:'Cancelado'}[a.status]}</span></h3><p>{a.message}</p></div></article>)}</div>}
      </section>
      <footer>elo TikTok 0.2.2 · Independente do TikTok / ByteDance · Baseado em componentes do elo Instagram e IgDiff (MIT).<br/>Dados do pacote podem estar desatualizados. Testes automatizados não substituem a validação na sua versão do TikTok.</footer>
    </main>
    <dialog ref={dialog} onCancel={() => setReview(null)} aria-labelledby="review-title"><div class="dialog-content"><span class="eyebrow">REVISÃO OBRIGATÓRIA</span><h2 id="review-title">Deixar de seguir {review?.targets.length} perfil(is)</h2><p>Conta que executará a ação: <b>@{review?.account}</b>. O TikTok será alterado após a confirmação. Nenhuma ação será repetida se houver dúvida.</p><ul class="review-targets">{review?.targets.map(id => <li key={id}>@{id}</li>)}</ul><p class="warning">Recurso experimental, validado apenas com páginas de teste. A extensão abrirá cada perfil da revisão e enviará no máximo uma tentativa para cada nome. Uma mudança na página, bloqueio ou desafio de segurança interrompe o lote.</p><label class="check"><input type="checkbox" checked={confirmReview} onChange={e => setConfirmReview(e.currentTarget.checked)}/>Revisei todos os nomes e quero deixar de seguir estes perfis.</label><label>Digite @{review?.account} para confirmar<input aria-label="Confirmar conta para ação" value={confirmAccount} autoComplete="off" onInput={e => setConfirmAccount(e.currentTarget.value)}/></label><div class="button-row"><button onClick={() => setReview(null)} disabled={!!busy}>Cancelar</button><button class="danger solid" disabled={!!busy || !confirmReview || !review || confirmAccount.trim().replace(/^@/, '').toLowerCase() !== review.account || Date.now() > review.expiresAt} onClick={execute}>Confirmar e deixar de seguir</button></div></div></dialog>
  </div>;
}

// Render failures stay visible even if local storage is unavailable.
void storePromise.catch(error => { document.getElementById('app')!.textContent = `Não foi possível abrir o armazenamento local: ${message(error)}. Confira se o navegador permite IndexedDB para extensões.`; });
render(<App/>, document.getElementById('app')!);
