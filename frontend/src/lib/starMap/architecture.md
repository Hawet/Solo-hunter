# EVE Online Star Map - Production Architecture

## Technology Stack Decision

### Primary: WebGL via Three.js
**Rationale:**
- GPU-accelerated rendering (10k+ objects at 60fps)
- Instanced rendering for nodes (single draw call for thousands)
- Built-in camera system for pan/zoom
- Mature ecosystem, well-documented
- Easy to extend with shaders for effects

**Alternatives considered:**
- Canvas 2D: ❌ CPU-bound, ~100-200 objects max at 60fps
- Custom WebGL: ⚠️ Possible but 3-6 months of development
- PixiJS: ✅ Good alternative, but Three.js better for 3D spatial data

## Data Preprocessing Strategy

### 1. Coordinate Normalization
```javascript
// Scale from 1e17 range to [-1, 1] or [0, 1000] range
// Preserve relative distances and spatial relationships
const normalizeCoordinates = (systems) => {
  // Find bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  Object.values(systems).forEach(system => {
    const pos = system.position;
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minY = Math.min(minY, pos.y);
    maxY = Math.max(maxY, pos.y);
    minZ = Math.min(minZ, pos.z);
    maxZ = Math.max(maxZ, pos.z);
  });
  
  const scale = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const offset = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  
  // Normalize to [-1, 1] range
  Object.values(systems).forEach(system => {
    system.normalizedPosition = {
      x: ((system.position.x - offset.x) / scale) * 2,
      y: ((system.position.y - offset.y) / scale) * 2,
      z: ((system.position.z - offset.z) / scale) * 2
    };
  });
};
```

### 2. Spatial Indexing (Octree)
```javascript
// Build octree for O(log n) spatial queries
// Essential for:
// - View frustum culling
// - Mouse picking
// - Route finding
// - Proximity queries
```

### 3. Edge Preprocessing
```javascript
// Build bidirectional adjacency lists
// Pre-compute edge geometry
// Index by system_id for O(1) lookups
```

### 4. Memory Layout
```javascript
// Use TypedArrays for GPU-friendly data
// Float32Array for positions
// Uint16Array for indices
// Minimize object allocations in render loop
```

## Rendering Architecture

### Core Components

1. **StarMapRenderer** (WebGL/Three.js)
   - Manages Three.js scene, camera, renderer
   - Handles all GPU operations
   - Completely isolated from Svelte reactivity

2. **SpatialIndex** (Octree/Grid)
   - View frustum culling
   - LOD selection
   - Spatial queries

3. **CameraController**
   - Smooth pan/zoom
   - Boundary clamping
   - Camera interpolation

4. **NodeRenderer** (Instanced)
   - Single geometry, instanced by system count
   - Per-instance attributes: position, color, size
   - LOD: different detail levels at different zoom

5. **EdgeRenderer** (Line segments)
   - Use THREE.LineSegments or custom shader
   - Batch by visibility/zoom level
   - Fade out distant edges

### Performance Optimizations

1. **View Frustum Culling**
   - Only render nodes/edges in viewport
   - Reduces draw calls by 80-95%

2. **Level of Detail (LOD)**
   ```javascript
   // Zoom level thresholds
   const LOD_LEVELS = {
     HIGH: 0.5,    // Show all details, labels
     MEDIUM: 0.2,  // Hide labels, reduce edge opacity
     LOW: 0.05,    // Only active systems, minimal edges
     MINIMAL: 0.01 // Only active systems, no edges
   };
   ```

3. **Batching**
   - Group nodes by material/state
   - Single draw call per batch
   - Minimize state changes

4. **Occlusion Culling** (Future)
   - Skip nodes behind others
   - Requires depth buffer analysis

5. **Spatial Partitioning**
   - Divide space into cells
   - Only render visible cells
   - Essential for 10k+ objects

## Pan/Zoom Implementation

### Camera System
```javascript
// Use THREE.OrthographicCamera or PerspectiveCamera
// Orthographic: better for top-down view, no perspective distortion
// Perspective: more immersive, better depth perception

// Smooth interpolation
const lerp = (a, b, t) => a + (b - a) * t;
camera.position.lerp(targetPosition, 0.1);
camera.zoom = lerp(camera.zoom, targetZoom, 0.1);
```

### Input Handling
- Mouse wheel: zoom
- Mouse drag: pan
- Touch gestures: pinch zoom, drag pan
- Keyboard: WASD/arrows for pan, +/- for zoom

### Boundary Clamping
```javascript
// Prevent panning outside data bounds
// Smooth deceleration at boundaries
```

## Svelte Integration Pattern

### Key Principle: Reactivity Isolation

```javascript
// ❌ BAD: Svelte reactivity per node
{#each systems as system}
  <SystemNode {system} />
{/each}

// ✅ GOOD: Single WebGL canvas, event-driven updates
<canvas bind:this={canvasRef} />
<script>
  let renderer;
  
  onMount(() => {
    renderer = new StarMapRenderer(canvasRef);
    // Svelte only controls high-level state
    $: if (activeSystems) {
      renderer.updateActiveSystems(activeSystems);
    }
  });
</script>
```

### Update Strategy
- Svelte manages: active systems, filters, UI state
- Renderer manages: all GPU operations, rendering loop
- Communication: Event-driven or explicit update methods
- No reactive statements in render loop

## Implementation Structure

```
src/lib/starMap/
├── StarMapRenderer.js      # Main renderer class
├── SpatialIndex.js          # Octree/spatial queries
├── CameraController.js     # Pan/zoom logic
├── NodeRenderer.js         # Instanced node rendering
├── EdgeRenderer.js         # Edge/line rendering
├── DataPreprocessor.js     # Normalization, indexing
├── InputHandler.js         # Mouse/touch/keyboard
└── utils/
    ├── math.js            # Vector/matrix utilities
    ├── colors.js          # Security status colors
    └── constants.js        # LOD thresholds, etc.
```

## Memory Budget

- Systems: ~8k × 64 bytes = ~512 KB
- Edges: ~25k × 32 bytes = ~800 KB
- GPU buffers: ~2-4 MB
- Total: ~5-6 MB (very manageable)

## Performance Targets

- 60 FPS with 8k nodes, 25k edges
- <16ms frame time
- Smooth pan/zoom (no jank)
- <100ms initial load
- <50ms state updates (active systems, filters)

## Future Extensions

1. **Route Highlighting**
   - Pathfinding (A* on spatial graph)
   - Animated path rendering
   - Multi-segment routes

2. **Activity Overlays**
   - Heat maps (shader-based)
   - Particle effects for kills
   - Traffic visualization

3. **Advanced Features**
   - System search/filter
   - Region boundaries
   - Security status visualization
   - Jump range indicators

