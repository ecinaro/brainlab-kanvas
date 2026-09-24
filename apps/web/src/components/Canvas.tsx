import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type IsValidConnection,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect } from 'react';
import { parseClip } from '../lib/clipboard';
import { checkConnection } from '../lib/connections';
import { firstImageFile, uploadIntoNode } from '../lib/upload';
import type { AppEdge, AppNode } from '../lib/types';
import { ModelNode } from '../nodes/ModelNode';
import { NoteNode } from '../nodes/NoteNode';
import { PreviewNode } from '../nodes/PreviewNode';
import { PromptNode } from '../nodes/PromptNode';
import { UploadNode } from '../nodes/UploadNode';
import { useCanvas } from '../store';

const nodeTypes = {
  prompt: PromptNode,
  upload: UploadNode,
  model: ModelNode,
  preview: PreviewNode,
  note: NoteNode,
};

function isTyping() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

export function Canvas() {
  const nodes = useCanvas((s) => s.nodes);
  const edges = useCanvas((s) => s.edges);
  const viewport = useCanvas((s) => s.viewport);
  const { onNodesChange, onEdgesChange, onConnect, addNode, setViewport, runNode } = useCanvas.getState();
  const flow = useReactFlow<AppNode, AppEdge>();

  const isValidConnection: IsValidConnection<AppEdge> = useCallback(
    (c) => checkConnection(useCanvas.getState().nodes, useCanvas.getState().edges, c as Connection).ok,
    [],
  );

  // Ctrl+V ile görsel yapıştırma → yeni Görsel Yükle node'u
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping()) return;
      // Önce kanvastan kopyalanmış node'lar, yoksa görsel.
      const clip = parseClip(e.clipboardData?.getData('text/plain'));
      if (clip) {
        e.preventDefault();
        useCanvas.getState().paste(clip);
        return;
      }
      const file = firstImageFile(e.clipboardData?.items);
      if (!file) {
        // Sistem panosuna yazılamadıysa (izin yok vb.) uygulama içi kopya yapıştırılır;
        // panoda başka bir metin varsa eski node'lar yapıştırılmaz.
        if (!e.clipboardData?.getData('text/plain')) useCanvas.getState().paste();
        return;
      }
      e.preventDefault();
      const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      uploadIntoNode(addNode('upload', center), file);
    };
    // Ctrl+Enter: seçili model node'larını çalıştır
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const s = useCanvas.getState();
      // Metin kutularında tarayıcının kendi geri al/kopyala davranışı korunur.
      if (mod && !isTyping()) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          s.undo();
          return;
        }
        if ((k === 'z' && e.shiftKey) || k === 'y') {
          e.preventDefault();
          s.redo();
          return;
        }
        if (k === 'c') {
          if (s.copySelection()) e.preventDefault();
          return;
        }
        if (k === 'd') {
          e.preventDefault();
          s.duplicateSelection();
          return;
        }
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          useCanvas.getState().runAll();
          return;
        }
        for (const n of useCanvas.getState().nodes) if (n.selected && n.type === 'model') runNode(n.id);
      }
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, [flow, addNode, runNode]);

  return (
    <ReactFlow<AppNode, AppEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      defaultViewport={viewport}
      fitView={!viewport}
      fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      onMoveEnd={(_, v) => setViewport(v)}
      minZoom={0.15}
      maxZoom={2.5}
      colorMode="dark"
      deleteKeyCode={['Backspace', 'Delete']}
      attributionPosition="top-right"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = firstImageFile(e.dataTransfer.files);
        if (!file) return;
        const pos = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        uploadIntoNode(addNode('upload', pos), file);
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap pannable zoomable position="bottom-right" nodeColor="#2a2a2e" maskColor="rgba(0,0,0,0.6)" />
    </ReactFlow>
  );
}
