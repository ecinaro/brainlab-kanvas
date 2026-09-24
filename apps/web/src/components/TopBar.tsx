import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { goProjects, type Route } from '../lib/route';
import { useCanvas } from '../store';

type CreditState =
  | { status: 'loading' }
  | { status: 'ok'; credits: number }
  | { status: 'error'; message: string };

const SAVE_LABEL = { idle: '', saving: 'Kaydediliyor…', saved: 'Kaydedildi', error: 'Kaydedilemedi' } as const;

export function TopBar({ route }: { route: Route }) {
  const [credit, setCredit] = useState<CreditState>({ status: 'loading' });
  const creditsVersion = useCanvas((s) => s.creditsVersion);
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

  const inCanvas = route.view === 'canvas';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={goProjects} className="flex shrink-0 items-center gap-2" title="Projeler">
          <div className="h-2.5 w-2.5 rounded-full bg-accent" />
          <span className="text-sm font-semibold tracking-tight">BrainLab Kanvas</span>
        </button>
        {mock && (
          <span
            className="shrink-0 rounded-md border border-danger/50 bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger"
            title="Gerçek Kie kullanılmıyor, kredi harcanmaz. Sonuçlar örnek dosyalardır."
          >
            Sahte mod
          </span>
        )}
        {inCanvas && <ProjectTitle />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {inCanvas && <CanvasActions />}
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

function ProjectTitle() {
  const name = useCanvas((s) => s.projectName);
  const saveState = useCanvas((s) => s.saveState);
  const rename = useCanvas((s) => s.rename);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-muted">/</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          // Değer doğrudan alandan okunur; state güncellemesini beklemeden Enter'a basılsa da doğru ad kaydedilir.
          const value = e.currentTarget.value;
          if (value.trim()) rename(value);
          else setDraft(name);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        title="Proje adını değiştirmek için tıkla"
        className="min-w-0 max-w-64 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm outline-none hover:border-line focus:border-muted"
      />
      <span className={`shrink-0 text-[11px] ${saveState === 'error' ? 'text-danger' : 'text-muted'}`}>{SAVE_LABEL[saveState]}</span>
    </div>
  );
}

function CanvasActions() {
  useCanvas((s) => s.historyVersion); // geri al/yinele durumları değişince yeniden çiz
  const { undo, redo, canUndo, canRedo, exportProject } = useCanvas.getState();
  const busy = useCanvas((s) => Object.values(s.runStatus).some((r) => r.state === 'pending'));
  const runAll = useCanvas((s) => s.runAll);

  const iconBtn =
    'rounded-lg border border-line bg-raised px-2 py-1.5 text-xs text-muted hover:border-muted hover:text-fg disabled:opacity-30 disabled:hover:border-line disabled:hover:text-muted';

  return (
    <>
      <button onClick={undo} disabled={!canUndo()} title="Geri al (Ctrl+Z)" className={iconBtn}>
        ↶
      </button>
      <button onClick={redo} disabled={!canRedo()} title="Yinele (Ctrl+Shift+Z / Ctrl+Y)" className={iconBtn}>
        ↷
      </button>
      <button
        onClick={() => {
          const { name, data } = exportProject();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
          a.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'proje'}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }}
        title="Projeyi JSON olarak indir. Medya dosyaları yol olarak eklenir; aynı bilgisayarda içe aktarınca çıktılar görünür."
        className={iconBtn}
      >
        Dışa aktar
      </button>
      <button
        onClick={() => runAll()}
        disabled={busy}
        title="Tüm zinciri sırayla çalıştırır; girdisi değişmemiş node'lar yeniden üretilmez (Ctrl+Shift+Enter)"
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Zincir çalışıyor…' : 'Tümünü çalıştır'}
      </button>
    </>
  );
}
