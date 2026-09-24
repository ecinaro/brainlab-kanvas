import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { goGallery, goProjects, type Route } from '../lib/route';
import { useCanvas } from '../store';

const SAVE_LABEL = { idle: '', saving: 'Kaydediliyor…', saved: 'Kaydedildi', error: 'Kaydedilemedi' } as const;

export function TopBar({ route }: { route: Route }) {
  const credits = useCanvas((s) => s.credits);
  const creditsError = useCanvas((s) => s.creditsError);
  const creditsVersion = useCanvas((s) => s.creditsVersion);
  const refresh = useCanvas((s) => s.refreshCredits);
  const [mock, setMock] = useState(false);

  useEffect(() => {
    api<{ mock?: boolean }>('/health')
      .then((h) => setMock(!!h.mock))
      .catch(() => {});
    useCanvas.getState().loadSettings();
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
        <nav className="flex shrink-0 items-center gap-1 text-xs">
          <button
            onClick={goProjects}
            className={`rounded-md px-2 py-1 ${route.view === 'projects' ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}
          >
            Projeler
          </button>
          <button
            onClick={goGallery}
            className={`rounded-md px-2 py-1 ${route.view === 'gallery' ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}
          >
            Galeri
          </button>
        </nav>
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
          {creditsError ? (
            <span className="max-w-64 truncate text-danger" title={creditsError}>
              {creditsError}
            </span>
          ) : credits === null ? (
            <span className="text-muted">…</span>
          ) : (
            <span data-testid="credits" className="font-semibold tabular-nums">
              {credits.toLocaleString('tr-TR')}
            </span>
          )}
        </button>
        <SettingsMenu />
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

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const threshold = useCanvas((s) => s.settings.costConfirmThreshold);
  const save = useCanvas((s) => s.saveSettings);
  const [draft, setDraft] = useState(String(threshold));
  useEffect(() => setDraft(String(threshold)), [threshold, open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ayarlar"
        className="rounded-lg border border-line bg-raised px-2 py-1.5 text-xs text-muted hover:border-muted hover:text-fg"
      >
        ⚙
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-72 rounded-xl border border-line bg-surface p-4 shadow-2xl">
          <label className="block text-xs">
            <span className="font-medium">Onay eşiği (kredi)</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Bir çalıştırmanın tahmini toplamı bu değeri aşarsa önce onay istenir. Fiyatı bilinmeyen modeller ve
              yetersiz bakiye her zaman onay ister. 0 = her üretimde sor.
            </span>
            <input
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-2 w-full rounded-md border border-line bg-bg px-2 py-1 text-xs outline-none focus:border-muted"
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-xs text-muted hover:text-fg">
              Kapat
            </button>
            <button
              onClick={async () => {
                await save({ costConfirmThreshold: Number(draft) });
                setOpen(false);
              }}
              className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:brightness-110"
            >
              Kaydet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Tümünü çalıştır" basılırsa üretilecek node'ların tahmini toplamı (önbellekten gelecekler hariç). */
function useRunAllEstimate() {
  const nodes = useCanvas((s) => s.nodes);
  const edges = useCanvas((s) => s.edges);
  const jobs = useCanvas((s) => s.jobs);
  return useMemo(() => {
    const ids = nodes.filter((n) => n.type === 'model').map((n) => n.id);
    return ids.length ? useCanvas.getState().estimate(ids, false) : null;
  }, [nodes, edges, jobs]);
}

function CanvasActions() {
  useCanvas((s) => s.historyVersion); // geri al/yinele durumları değişince yeniden çiz
  const { undo, redo, canUndo, canRedo, exportProject } = useCanvas.getState();
  const busy = useCanvas((s) => Object.values(s.runStatus).some((r) => r.state === 'pending'));
  const runAll = useCanvas((s) => s.runAll);
  const est = useRunAllEstimate();
  const estLabel = !est
    ? ''
    : est.items.length === 0
      ? 'güncel'
      : `~${est.total.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kr${est.unknown ? ' + ?' : ''}`;

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
        {!busy && estLabel && <span className="ml-1.5 font-normal opacity-80" data-testid="run-estimate">· {estLabel}</span>}
      </button>
    </>
  );
}
