import { browser, type Browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { captureVisibleList, ensureTargets, performUnfollow, readTikTokStatus, requireRenderedProfile } from '../lib/tiktok';
import { errorText, type ContentMessage, type Reply } from '../lib/messages';
import { collectFollowing } from '../lib/collector';

export default defineContentScript({
  matches: ['https://www.tiktok.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    let cancelled = false;
    let running = false;
    const listener = async (message: ContentMessage, sender: Browser.runtime.MessageSender) => {
      if (ctx.isInvalid) return undefined;
      if (sender.id !== browser.runtime.id || sender.tab || !message || typeof message.type !== 'string') return undefined;
      try {
        switch (message.type) {
          case 'tt-status': {
            const status = readTikTokStatus(document, location.href);
            let renderedProfile = false;
            let profileProblem: string | undefined;
            try {
              if (status.profile) { requireRenderedProfile(document, location.href, status.profile); renderedProfile = true; }
            } catch (error) { profileProblem = errorText(error); }
            return { ok: true, status: { ...status, renderedProfile, ...(profileProblem ? { profileProblem } : {}) } };
          }
          case 'tt-capture': return { ok: true, ...captureVisibleList(document, location.href, message.kind) };
          case 'tt-review':
            ensureTargets(document, location.href, message.account, message.targets);
            return { ok: true };
          case 'tt-cancel':
            cancelled = true;
            return { ok: true };
          case 'tt-collect-following': {
            if (running) throw new Error('Já existe uma operação nesta aba.');
            running = true;
            cancelled = false;
            try {
              const result = await collectFollowing(document, () => location.href, message.account, {
                cancelled: () => cancelled || ctx.isInvalid,
                onProgress: async progress => {
                  if (cancelled || ctx.isInvalid) return;
                  const response = await browser.runtime.sendMessage({
                    type: 'tt-collection-progress', operationId: message.operationId, ...progress,
                  }) as Reply<Record<never, never>>;
                  if (!response?.ok && !cancelled) throw new Error(response?.error ?? 'A coleta perdeu a autorização.');
                },
              });
              return { ok: true, result };
            } finally { running = false; }
          }
          case 'tt-unfollow': {
            if (running) throw new Error('Já existe uma ação nesta aba.');
            running = true;
            cancelled = false;
            try {
              const result = await performUnfollow(document, () => location.href, message.account, message.target, {
                cancelled: () => cancelled || ctx.isInvalid,
                authorize: async () => {
                  if (cancelled || ctx.isInvalid) throw new Error('O contexto da extensão foi encerrado. Confira a operação antes de continuar.');
                  const authorization = await browser.runtime.sendMessage({
                    type: 'tt-authorize', operationId: message.operationId, account: message.account, target: message.target,
                  }) as Reply<Record<never, never>>;
                  if (!authorization?.ok) throw new Error(authorization?.error ?? 'A autorização da ação expirou.');
                },
              });
              return { ok: true, result };
            } finally { running = false; }
          }
          default: return undefined;
        }
      } catch (error) { return { ok: false, error: errorText(error) }; }
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => {
      cancelled = true;
      try { browser.runtime.onMessage.removeListener(listener); } catch { /* O navegador pode já ter encerrado a extensão antiga. */ }
    });
  },
});
