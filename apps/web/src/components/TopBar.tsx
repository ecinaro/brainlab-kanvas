import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useCanvas } from '../store';

type CreditState =
  | { status: 'loading' }
  | { status: 'ok'; credits: number }
  | { status: 'error'; message: string };

const SAVE_LABEL = { idle: '', saving: 'Kaydediliyor…', saved: 'Kaydedildi', error: 'Kaydedilemedi' } as const;

export function TopBar() {
  const [credit, setCredit] = useState<CreditState>({ status: 'loading' });
  const creditsVersion = useCanvas((s) => s.creditsVersion);
  const saveState = useCanvas((s) => s.saveState);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    api<{ mock?: boolean }>('/health')
      .then((h) => setMock(!!h.mock))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { credits } = await api<{ credits: number }>('/credits');
      setCredit({ status: 'ok', credits });
    } catch (err) {
      setCredit({ status: 'error', message: (err as Error).message });
    }
  }, []);

  // İlk açılışta ve her görev bittiğinde bakiye yenilenir.
  useEffect(() => {
    refresh();
  }, [refresh, creditsVersion]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="text-sm font-semibold tracking-tight">BrainLab Kanvas</span>
        </div>
        {mock && (
          <span
            className="rounded-md border border-danger/50 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger"
            title="Gerçek Kie kullanılmıyor, kredi harcanmaz. Sonuçlar örnek dosyalardır."
          >
            Sahte mod
          </span>
        )}
        <span className={`text-[11px] ${saveState === 'error' ? 'text-danger' : 'text-muted'}`}>{SAVE_LABEL[saveState]}</span>
      </div>
      <div className="flex items-center gap-2">
      <RunAllButton />
      <button
        onClick={refresh}
        title="Bakiyeyi yenile"
        className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs hover:border-muted"
      >
        <span className="text-muted">Kredi</span>
        {credit.status === 'loading' && <span className="text-muted">…</span>}
        {credit.status === 'ok' && (
          <span data-testid="credits" className="font-semibold tabular-nums">
            {credit.credits.toLocaleString('tr-TR')}
          </span>
        )}
        {credit.status === 'error' && (
          <span className="max-w-64 truncate text-danger" title={credit.message}>
            {credit.message}
          </span>
        )}
      </button>
      </div>
    </header>
  );
}

function RunAllButton() {
  const busy = useCanvas((s) => Object.values(s.runStatus).some((r) => r.state === 'pending'));
  const runAll = useCanvas((s) => s.runAll);
  return (
    <button
      onClick={() => runAll()}
      disabled={busy}
      title="Tüm zinciri sırayla çalıştırır; girdisi değişmemiş node'lar yeniden üretilmez (Ctrl+Shift+Enter)"
      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
    >
      {busy ? 'Zincir çalışıyor…' : 'Tümünü çalıştır'}
    </button>
  );
}
