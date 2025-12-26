<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { StarMapRenderer } from '../lib/starMap/StarMapRenderer.js';
  
  let canvasContainer;
  let renderer = null;
  let loading = true;
  let error = null;
  let dataLoaded = false;
  let currentRegion = null; // Currently selected region
  let stats = {
    systems: 0,
    edges: 0,
    fps: 0
  };
  
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  onMount(async () => {
    try {
      loading = true;
      
      // Load map data first
      const response = await fetch(`${API_URL}/api/map/data`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const mapData = data.map_data || data;
      
      stats.systems = Object.keys(mapData.systems || {}).length;
      stats.edges = Object.keys(mapData.stargates || {}).length;
      
      console.log('Map data loaded:', stats);
      dataLoaded = true;
      
      // Wait for DOM to update and container to be rendered
      await tick();
      
      // Wait a bit more to ensure container has dimensions
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Initialize renderer
      if (!canvasContainer) {
        throw new Error('Canvas container not found. Make sure the container is rendered.');
      }
      
      if (canvasContainer.clientWidth === 0 || canvasContainer.clientHeight === 0) {
        console.warn('Container has no dimensions, waiting...');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      renderer = new StarMapRenderer(canvasContainer, {
        backgroundColor: 0x0a0a0f,
        nodeSize: 0.05, // Increased node size for better visibility
        edgeOpacity: 0.4 // Slightly increased opacity for better visibility
      });
      
      await renderer.initialize(mapData);
      
      // Setup region click callback
      renderer.onRegionClick = (region) => {
        currentRegion = region;
      };
      
      // Start FPS tracking
      startFpsTracking();
      
      loading = false;
      error = null;
    } catch (err) {
      console.error('Error initializing renderer:', err);
      error = err.message;
      loading = false;
    }
  });
  
  onDestroy(() => {
    if (renderer) {
      renderer.destroy();
    }
  });
  
  function startFpsTracking() {
    const trackFps = () => {
      if (renderer) {
        stats.fps = renderer.getFps();
        requestAnimationFrame(trackFps);
      }
    };
    
    requestAnimationFrame(trackFps);
  }
  
  async function updateActiveSystems() {
    if (!renderer) return;
    
    try {
      const response = await fetch(`${API_URL}/api/map/active-systems`);
      if (response.ok) {
        const data = await response.json();
        const activeSystems = data.systems || [];
        renderer.updateActiveSystems(activeSystems);
        console.log('Updated active systems:', activeSystems.length);
      }
    } catch (err) {
      console.error('Error fetching active systems:', err);
    }
  }
  
  function resetCamera() {
    if (renderer && renderer.cameraController) {
      renderer.cameraController.targetPosition.set(0, 0, 5);
      renderer.cameraController.targetZoom = 1;
    }
  }
  
  function goBackToRegions() {
    if (renderer) {
      renderer.viewAllRegions();
      currentRegion = null;
    }
  }
</script>

<div class="map-page">
  <header class="map-header">
    <div class="header-content">
      <a href="#/" class="back-link">← Back to Killfeed</a>
      <h1>EVE Online Star Map</h1>
      <div class="controls">
        {#if currentRegion}
          <button on:click={goBackToRegions} class="btn btn-back">← Back to Regions</button>
        {/if}
        <button on:click={updateActiveSystems} class="btn">Update Active Systems</button>
        <button on:click={resetCamera} class="btn">Reset Camera</button>
      </div>
    </div>
    
    {#if currentRegion}
      <div class="breadcrumb">
        <span class="breadcrumb-item">Regions</span>
        <span class="breadcrumb-separator">→</span>
        <span class="breadcrumb-item active">{currentRegion.name}</span>
        <span class="breadcrumb-meta">({currentRegion.systemCount} systems)</span>
      </div>
    {:else}
      <div class="breadcrumb">
        <span class="breadcrumb-item active">All Regions</span>
        <span class="breadcrumb-hint">Click on a region to view its systems</span>
      </div>
    {/if}
    
    <div class="stats">
      <div class="stat-item">
        <span class="stat-label">Systems:</span>
        <span class="stat-value">{stats.systems.toLocaleString()}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Edges:</span>
        <span class="stat-value">{stats.edges.toLocaleString()}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">FPS:</span>
        <span class="stat-value" class:low-fps={stats.fps < 55}>{stats.fps}</span>
      </div>
    </div>
  </header>
  
  <div class="canvas-container">
    {#if loading && !dataLoaded}
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading map data...</p>
        <p class="loading-note">This may take a moment</p>
      </div>
    {:else if error}
      <div class="error">
        <p>Error: {error}</p>
        <p class="error-note">Make sure Three.js is installed: npm install three</p>
      </div>
    {:else}
      <div bind:this={canvasContainer} class="canvas-wrapper"></div>
      {#if loading}
        <div class="loading-overlay">
          <div class="spinner"></div>
          <p>Initializing WebGL renderer...</p>
        </div>
      {/if}
      <div class="instructions">
        <p><strong>Controls:</strong></p>
        <ul>
          <li>Mouse wheel: Zoom in/out</li>
          <li>Mouse drag: Pan</li>
          <li>Click region name: View systems</li>
        </ul>
      </div>
    {/if}
  </div>
</div>

<style>
  .map-page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
  }
  
  .map-header {
    padding: 1.5rem 2rem;
    background: rgba(15, 15, 23, 0.8);
    border-bottom: 1px solid rgba(239, 68, 68, 0.2);
    backdrop-filter: blur(10px);
  }
  
  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  
  .back-link {
    color: #ef4444;
    text-decoration: none;
    font-size: 0.9rem;
    transition: opacity 0.2s;
  }
  
  .back-link:hover {
    opacity: 0.8;
  }
  
  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #fff;
    flex: 1;
  }
  
  .controls {
    display: flex;
    gap: 0.5rem;
  }
  
  .btn {
    padding: 0.5rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #fca5a5;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }
  
  .btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    color: #ef4444;
  }
  
  .btn-back {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    color: #93c5fd;
  }
  
  .btn-back:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: #60a5fa;
  }
  
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(239, 68, 68, 0.1);
    font-size: 0.9rem;
  }
  
  .breadcrumb-item {
    color: #9ca3af;
  }
  
  .breadcrumb-item.active {
    color: #ef4444;
    font-weight: 600;
  }
  
  .breadcrumb-separator {
    color: #6b7280;
  }
  
  .breadcrumb-meta {
    color: #6b7280;
    font-size: 0.85rem;
    margin-left: 0.5rem;
  }
  
  .breadcrumb-hint {
    color: #6b7280;
    font-size: 0.85rem;
    margin-left: auto;
    font-style: italic;
  }
  
  .stats {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
  
  .stat-item {
    display: flex;
    gap: 0.5rem;
    font-size: 0.9rem;
  }
  
  .stat-label {
    color: #9ca3af;
  }
  
  .stat-value {
    color: #fff;
    font-weight: 600;
  }
  
  .stat-value.low-fps {
    color: #fbbf24;
  }
  
  .canvas-container {
    flex: 1;
    position: relative;
    min-height: 600px;
  }
  
  .canvas-wrapper {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    min-height: 600px;
  }
  
  .canvas-wrapper canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 15, 0.9);
    z-index: 10;
  }
  
  .loading, .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: #fff;
    height: 100%;
  }
  
  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(239, 68, 68, 0.2);
    border-top-color: #ef4444;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .loading-note, .error-note {
    font-size: 0.85rem;
    color: #888;
    margin-top: 0.5rem;
  }
  
  .error {
    color: #ff6b6b;
  }
  
  .instructions {
    position: absolute;
    bottom: 1rem;
    left: 1rem;
    background: rgba(15, 15, 23, 0.9);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.2);
    font-size: 0.85rem;
    max-width: 300px;
  }
  
  .instructions p {
    margin: 0 0 0.5rem 0;
    color: #fff;
  }
  
  .instructions ul {
    margin: 0;
    padding-left: 1.5rem;
    color: #9ca3af;
  }
  
  .instructions li {
    margin: 0.25rem 0;
  }
</style>
