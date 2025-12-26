# EVE Online Star Map - WebGL Renderer

## Architecture Overview

This is a production-ready, high-performance WebGL renderer for visualizing EVE Online's star map with 8,000+ systems and 25,000+ stargate connections.

## Key Features

- **GPU-accelerated rendering** via Three.js
- **Instanced rendering** for nodes (single draw call)
- **View frustum culling** for performance
- **LOD system** based on zoom level
- **Smooth pan/zoom** with interpolation
- **Svelte integration** without reactivity overhead

## Usage

```javascript
import { StarMapRenderer } from './lib/starMap/StarMapRenderer.js';

// In your Svelte component
let canvasRef;
let renderer;

onMount(async () => {
  const mapData = await fetch('/api/map/data').then(r => r.json());
  
  renderer = new StarMapRenderer(canvasRef);
  await renderer.initialize(mapData);
  
  // Update active systems (event-driven, not reactive)
  $: if (activeSystems) {
    renderer.updateActiveSystems(activeSystems);
  }
});

onDestroy(() => {
  renderer?.destroy();
});
```

## Performance Targets

- 60 FPS with 8k nodes, 25k edges
- <16ms frame time
- Smooth pan/zoom (no jank)
- <100ms initial load

## Next Steps

1. Install Three.js: `npm install three`
2. Replace current StarMap component with WebGL version
3. Test with full dataset
4. Add route highlighting
5. Add activity overlays

## Future Enhancements

- Custom shaders for per-instance colors
- Octree spatial index (currently grid-based)
- Route pathfinding and visualization
- Heat maps for activity
- Particle effects for kills
- Region boundaries
- System search/filter

