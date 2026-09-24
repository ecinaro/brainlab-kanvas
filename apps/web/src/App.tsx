import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { ConfirmRun, HaltBanner } from './components/ConfirmRun';
import { Inspector } from './components/Inspector';
import { JobTray } from './components/JobTray';
import { LeftRail } from './components/LeftRail';
import { ProjectsScreen } from './components/ProjectsScreen';
import { TopBar } from './components/TopBar';
import { startJobStream } from './lib/events';
import { goProjects, useRoute } from './lib/route';
import { useCanvas } from './store';

export function App() {
  const route = useRoute();
  const toast = useCanvas((s) => s.toast);

  useEffect(() => startJobStream(), []);

  return (
    <div className="flex h-full flex-col">
      <TopBar route={route} />
      <HaltBanner />
      <main className="relative min-h-0 flex-1">
        {route.view === 'projects' ? <ProjectsScreen /> : <CanvasScreen projectId={route.projectId} />}
        <ConfirmRun />
        {toast && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}

function CanvasScreen({ projectId }: { projectId: string }) {
  const loaded = useCanvas((s) => s.loaded && s.projectId === projectId);
  const loadError = useCanvas((s) => s.loadError);

  useEffect(() => {
    useCanvas.getState().load(projectId);
  }, [projectId]);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <span className="text-danger">Proje yüklenemedi: {loadError}</span>
        <span className="max-w-md text-center text-xs text-muted">
          Kayıtlı projenin üzerine yazılmaması için kanvas açılmadı.
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              useCanvas.setState({ projectId: null });
              useCanvas.getState().load(projectId);
            }}
            className="rounded-lg border border-line bg-raised px-3 py-1.5 text-xs hover:border-muted"
          >
            Tekrar dene
          </button>
          <button onClick={goProjects} className="rounded-lg border border-line bg-raised px-3 py-1.5 text-xs hover:border-muted">
            Projelere dön
          </button>
        </div>
      </div>
    );
  }
  if (!loaded) return <div className="flex h-full items-center justify-center text-sm text-muted">Yükleniyor…</div>;

  // key: proje değişince React Flow iç durumu (viewport vb.) sıfırlansın
  return (
    <ReactFlowProvider key={projectId}>
      <Canvas />
      <LeftRail />
      <Inspector />
      <JobTray />
    </ReactFlowProvider>
  );
}
