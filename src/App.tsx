import { Canvas } from './components/Canvas';
import { BlockShell } from './components/BlockShell';
import { BlockRenderer } from './components/Blocks';
import { Toolbar } from './components/Toolbar';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { ContextMenu } from './components/ContextMenu';
import { PropertyToolbar } from './components/PropertyToolbar';
import { useBoardStore } from './store';

function App() {
  const blocks = useBoardStore((state) => state.blocks);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-50">
      <KeyboardShortcuts />
      <ContextMenu />
      <Canvas>
        {Object.values(blocks).map((block) => (
          <BlockShell key={block.id} block={block}>
            <BlockRenderer block={block} />
          </BlockShell>
        ))}
      </Canvas>
      <Toolbar />
      <PropertyToolbar />
    </div>
  );
}

export default App;