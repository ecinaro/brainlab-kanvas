import { getModel } from '@brainlab-kanvas/catalog';
import { useEffect } from 'react';
import type { ModelData } from '../lib/types';
import { useCanvas } from '../store';

const REASON_LABEL = { forced: 'yeniden üretilecek', changed: 'girdisi değişti', upstream: 'yukarı akış yenileniyor' } as const;
const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** Tahmini maliyet eşiği aşınca çalıştırmadan önce gösterilen onay penceresi. */
export function ConfirmRun() {
  const confirm = useCanvas((s) => s.confirm);
  const nodes = useCanvas((s) => s.nodes);
  const credits = useCanvas((s) => s.credits);
  const resolve = useCanvas((s) => s.resolveConfirm);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, resolve]);

  if (!confirm) return null;
  const { estimate, reasons } = confirm;
  const insufficient = credits !== null && estimate.total > credits;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-[420px] max-w-[calc(100%-32px)] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">Çalıştırmadan önce onay</h2>
          <ul className="mt-2 space-y-1 text-[11px] text-muted">
            {reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>

        <ul className="max-h-64 divide-y divide-line overflow-y-auto px-5">
          {estimate.items.map((it) => {
            const d = nodes.find((n) => n.id === it.nodeId)?.data as unknown as ModelData | undefined;
            const name = (d && getModel(d.modelId)?.name) ?? it.nodeId;
            return (
              <li key={it.nodeId} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate">{name}</span>
                  <span className="text-[10px] text-muted">{REASON_LABEL[it.reason]}</span>
                </span>
                <span className="shrink-0 tabular-nums">{it.credits === null ? '? kredi' : `~${fmt(it.credits)} kredi`}</span>
              </li>
            );
          })}
        </ul>

        <div className="space-y-1 border-t border-line px-5 py-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Tahmini toplam</span>
            <span className="font-semibold tabular-nums">
              ~{fmt(estimate.total)} kredi{estimate.unknown ? ` + ${estimate.unknown} bilinmeyen` : ''}{' '}
              <span className="font-normal text-muted">(≈${(estimate.total * 0.005).toFixed(2)})</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Bakiye</span>
            <span className={`tabular-nums ${insufficient ? 'text-danger' : ''}`}>{credits === null ? 'bilinmiyor' : `${fmt(credits)} kredi`}</span>
          </div>
          <p className="pt-1 text-[10px] text-muted">Tahminler kie.ai fiyat tablosuna dayanır; gerçek harcama görev bitince gösterilir.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button onClick={() => resolve(false)} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-xs hover:border-muted">
            İptal
          </button>
          <button
            autoFocus
            onClick={() => resolve(true)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          >
            Yine de çalıştır
          </button>
        </div>
      </div>
    </div>
  );
}

/** Key geçersiz / kredi bitti gibi tüm kuyruğu durduran hatalar için bant. */
export function HaltBanner() {
  const halt = useCanvas((s) => s.halt);
  const clearHalt = useCanvas((s) => s.clearHalt);
  const refreshCredits = useCanvas((s) => s.refreshCredits);
  if (!halt) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger" role="alert">
      <span>
        <strong className="font-semibold">Çalıştırma durduruldu ({halt.code}).</strong> {halt.message}
      </span>
      <span className="flex shrink-0 gap-2">
        {halt.code === '402' && (
          <a href="https://kie.ai/billing" target="_blank" rel="noreferrer" className="underline hover:no-underline">
            Bakiye yükle
          </a>
        )}
        <button onClick={() => refreshCredits()} className="underline hover:no-underline">
          Bakiyeyi yenile
        </button>
        <button onClick={clearHalt} title="Kapat" className="px-1">
          ✕
        </button>
      </span>
    </div>
  );
}
