import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { LeftRail } from './components/LeftRail';
import { TopBar } from './components/TopBar';
import { startJobStream } from './lib/events';
import { useCanvas } from './store';

export function App() {
  const loaded = useCanvas((s) => s.loaded);
  const toast = useCanvas((s) => s.toast);
  const loadError = useCanvas((s) => s.loadError);

  useEffect(() => {
    useCanvas.getState().load();
    return startJobStream();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <main className="relative flex-1">
        <ReactFlowProvider>
          {loaded ? (
            <>
              <Canvas />
              <LeftRail />
              <Inspector />
            </>
          ) : loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
              <span className="text-danger">Proje yüklenemedi: {loadError}</span>
              <span className="max-w-md text-center text-xs text-muted">
                Kayıtlı projenin üzerine yazılmaması için kanvas açılmadı. Sunucunun çalıştığından emin olup tekrar dene.
              </span>
              <button
                onClick={() => useCanvas.getState().load()}
                className="rounded-lg border border-line bg-raised px-3 py-1.5 text-xs hover:border-muted"
              >
                Tekrar dene
              </button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">Yükleniyor…</div>
          )}
        </ReactFlowProvider>
        {toast && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
