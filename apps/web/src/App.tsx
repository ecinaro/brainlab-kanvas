import { ReactFlowProvider } from '@xyflow/react';
import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { CompareDialog, SelectionBar } from './components/CompareDialog';
import { ConfirmRun, HaltBanner } from './components/ConfirmRun';
import { GalleryScreen } from './components/GalleryScreen';
import { Inspector } from './components/Inspector';
import { JobTray } from './components/JobTray';
import { LeftRail } from './components/LeftRail';
import { ProjectsScreen } from './components/ProjectsScreen';
import { TopBar } from './components/TopBar';
import { startJobStream } from './lib/events';
import { rebuildFromGeneration, type SavedGeneration } from './lib/rebuild';
import { goProjects, takePendingInsert, useRoute } from './lib/route';
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
        {route.view === 'projects' && <ProjectsScreen />}
        {route.view === 'gallery' && <GalleryScreen />}
        {route.view === 'canvas' && <CanvasScreen projectId={route.projectId} />}
        <ConfirmRun />
        {toast && (
          <div className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}

/** Galeriden "Projeye kur" ile gelen üretimi, mevcut node'ların sağına yerleştirir. */
function insertPendingGeneration(projectId: string) {
  const gen = takePendingInsert(projectId) as SavedGeneration | null;
  if (!gen) return;
  const built = rebuildFromGeneration(gen);
  const s = useCanvas.getState();
  if (!built) {
    s.showToast('Bu modelin katalog kaydı yok; kanvasa kurulamadı');
    return;
  }
  const maxX = s.nodes.reduce((m, n) => Math.max(m, n.position.x + (n.measured?.width ?? 320)), -200);
  s.insertClip(built.clip, { x: maxX + 200, y: 0 });
  s.showToast(built.warnings.length ? `Kuruldu (${built.warnings.join('; ')})` : 'Üretim zinciriyle birlikte kanvasa kuruldu');
}

function CanvasScreen({ projectId }: { projectId: string }) {
  const loaded = useCanvas((s) => s.loaded && s.projectId === projectId);
  const loadError = useCanvas((s) => s.loadError);

  useEffect(() => {
    useCanvas.getState().load(projectId);
  }, [projectId]);

  useEffect(() => {
    if (loaded) insertPendingGeneration(projectId);
  }, [loaded, projectId]);

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
      <SelectionBar />
      <JobTray />
      <CompareDialog />
    </ReactFlowProvider>
  );
}
