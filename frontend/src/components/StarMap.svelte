<script>
  import { onMount, onDestroy } from 'svelte';
  
  export let activeSystems = [];
  export let apiUrl = 'http://localhost:8000';
  
  let mapContainer;
  let network = null;
  let Network = null;
  let loading = true;
  let error = null;
  let mapData = null;
  let nodes = [];
  let edges = [];
  
  onMount(async () => {
    // Load vis-network from CDN script tag
    try {
      // Wait a bit for CDN script to load if needed
      let retries = 0;
      while (!window.vis && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      if (!window.vis || !window.vis.Network) {
        throw new Error('vis-network not loaded. Please check the CDN script tag in index.html');
      }
      
      Network = window.vis.Network;
      await loadMapData();
      if (mapData && mapContainer && Network) {
        initializeMap();
      }
    } catch (err) {
      console.error('Error loading vis-network:', err);
      error = 'Failed to load visualization library: ' + (err.message || String(err));
      loading = false;
    }
  });
  
  onDestroy(() => {
    if (network) {
      network.destroy();
    }
  });
  
  async function loadMapData() {
    try {
      loading = true;
      const response = await fetch(`${apiUrl}/api/map/data`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      mapData = await response.json();
      error = null;
    } catch (err) {
      console.error('Error loading map data:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  function initializeMap() {
    if (!mapData || !mapContainer) return;
    
    // Create active systems lookup
    const activeSystemIds = new Set(activeSystems.map(s => s.system_id));
    const activeSystemKills = {};
    activeSystems.forEach(s => {
      activeSystemKills[s.system_id] = s.kill_count || 0;
    });
    
    // Prepare nodes (systems)
    const systems = mapData.systems || {};
    const systemNodes = [];
    
    // Use system positions if available, otherwise use a layout algorithm
    const hasPositions = Object.values(systems).some(s => s.position && s.position.x !== undefined);
    
    Object.values(systems).forEach(system => {
      const isActive = activeSystemIds.has(system.system_id);
      const killCount = activeSystemKills[system.system_id] || 0;
      
      // Determine color based on security status and activity
      let color = '#666666'; // Default gray
      if (isActive) {
        color = '#ef4444'; // Red for active systems
      } else if (system.security_status >= 0.5) {
        color = '#22c55e'; // Green for high sec
      } else if (system.security_status > 0) {
        color = '#fbbf24'; // Yellow for low sec
      } else {
        color = '#dc2626'; // Dark red for null sec
      }
      
      // Calculate position
      let x, y, z;
      if (hasPositions && system.position) {
        // Use actual EVE positions (scaled down)
        x = system.position.x / 1000000000; // Scale down
        y = system.position.y / 1000000000;
        z = system.position.z / 1000000000;
      } else {
        // Random position for now (will be improved with layout algorithm)
        x = (Math.random() - 0.5) * 1000;
        y = (Math.random() - 0.5) * 1000;
        z = (Math.random() - 0.5) * 1000;
      }
      
      systemNodes.push({
        id: system.system_id,
        label: system.name || `System ${system.system_id}`,
        x: x,
        y: y,
        z: z,
        color: {
          background: color,
          border: isActive ? '#ff0000' : '#333333',
          highlight: {
            background: isActive ? '#ff4444' : '#888888',
            border: '#ffffff'
          }
        },
        size: isActive ? 20 + (killCount * 2) : 10,
        font: {
          color: '#ffffff',
          size: isActive ? 14 : 12,
          face: 'Arial'
        },
        title: `${system.name || 'Unknown'}\nSecurity: ${system.security_status?.toFixed(2) || 'N/A'}\n${isActive ? `Kills: ${killCount}` : ''}`,
        systemData: system
      });
    });
    
    // Prepare edges (stargates)
    const stargates = mapData.stargates || {};
    const systemEdges = [];
    
    Object.values(stargates).forEach(stargate => {
      const fromId = stargate.from_system_id;
      const toId = stargate.to_system_id;
      
      if (fromId && toId && systems[fromId] && systems[toId]) {
        // Check if either system is active
        const fromActive = activeSystemIds.has(fromId);
        const toActive = activeSystemIds.has(toId);
        const isActive = fromActive || toActive;
        
        systemEdges.push({
          id: stargate.stargate_id,
          from: fromId,
          to: toId,
          color: {
            color: isActive ? '#ef4444' : '#444444',
            highlight: '#ffffff',
            opacity: isActive ? 0.8 : 0.3
          },
          width: isActive ? 2 : 1,
          smooth: {
            type: 'continuous',
            roundness: 0.5
          }
        });
      }
    });
    
    nodes = systemNodes;
    edges = systemEdges;
    
    // Create network
    const data = { nodes, edges };
    const options = {
      nodes: {
        shape: 'dot',
        shadow: true,
        font: {
          size: 12
        }
      },
      edges: {
        arrows: {
          to: {
            enabled: false
          }
        },
        smooth: {
          type: 'continuous'
        }
      },
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          iterations: 200
        },
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.1,
          springLength: 200,
          springConstant: 0.04,
          damping: 0.09
        }
      },
      interaction: {
        zoomView: true,
        dragView: true,
        hover: true,
        tooltipDelay: 100
      }
    };
    
    if (!Network) return;
    network = new Network(mapContainer, data, options);
    
    // Add event listeners
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const systemId = params.nodes[0];
        const system = systems[systemId];
        if (system) {
          console.log('Clicked system:', system.name, system);
          // You can emit an event or update state here
        }
      }
    });
    
    network.on('hoverNode', (params) => {
      mapContainer.style.cursor = 'pointer';
    });
    
    network.on('blurNode', () => {
      mapContainer.style.cursor = 'default';
    });
  }
  
  // Re-initialize when active systems change
  $: if (activeSystems && mapData && network) {
    initializeMap();
  }
</script>

<div class="star-map-container">
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading star map data...</p>
      <p class="loading-note">This may take a moment on first load</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Error loading map: {error}</p>
      <button on:click={loadMapData}>Retry</button>
    </div>
  {:else}
    <div class="map-header">
      <h3>EVE Online Star Map</h3>
      <div class="map-legend">
        <div class="legend-item">
          <span class="legend-color" style="background: #ef4444;"></span>
          <span>Active (Recent Kills)</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #22c55e;"></span>
          <span>High Sec</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #fbbf24;"></span>
          <span>Low Sec</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #dc2626;"></span>
          <span>Null Sec</span>
        </div>
      </div>
    </div>
    <div class="map-wrapper">
      <div bind:this={mapContainer} class="map-canvas"></div>
    </div>
  {/if}
</div>

<style>
  .star-map-container {
    width: 100%;
    height: 100%;
    background: rgba(10, 10, 15, 0.8);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
  }
  
  .loading, .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: #fff;
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
  
  .loading-note {
    font-size: 0.85rem;
    color: #888;
    margin-top: 0.5rem;
  }
  
  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 6px;
    color: #fca5a5;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .error button:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.7);
  }
  
  .map-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  }
  
  .map-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
  }
  
  .map-legend {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #a0a0a0;
  }
  
  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .map-wrapper {
    flex: 1;
    min-height: 600px;
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
  }
  
  .map-canvas {
    width: 100%;
    height: 100%;
    min-height: 600px;
  }
</style>

