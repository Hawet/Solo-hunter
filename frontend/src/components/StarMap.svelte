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
      
      // Wait a bit for the container to be rendered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (mapData && mapContainer && Network) {
        // Ensure container has dimensions
        if (mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
          console.warn('Map container has no dimensions, waiting...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        await initializeMap(true); // Pass true to use cache if available
      } else {
        console.log('Missing requirements:', { mapData: !!mapData, mapContainer: !!mapContainer, Network: !!Network });
      }
    } catch (err) {
      console.error('Error loading vis-network:', err);
      error = 'Failed to load visualization library: ' + (err.message || String(err));
      loading = false;
    }
  });
  
  onDestroy(() => {
    if (reinitTimeout) {
      clearTimeout(reinitTimeout);
    }
    if (network) {
      network.destroy();
    }
  });
  
  async function loadMapData() {
    try {
      // Only show loading if we don't have data yet
      if (!mapData) {
        loading = true;
      }
      
      const response = await fetch(`${apiUrl}/api/map/data`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Handle both direct map_data response and wrapped response
      mapData = data.map_data || data;
      console.log('Map data loaded:', {
        systems: Object.keys(mapData.systems || {}).length,
        stargates: Object.keys(mapData.stargates || {}).length,
        regions: Object.keys(mapData.regions || {}).length
      });
      
      // Try to load cached positions
      await loadCachedPositions();
      
      error = null;
    } catch (err) {
      console.error('Error loading map data:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }
  
  async function loadCachedPositions() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.version === CACHE_VERSION && parsed.positions) {
          cachedPositions = parsed.positions;
          console.log('Loaded cached positions for', Object.keys(cachedPositions).length, 'systems');
          return true;
        }
      }
    } catch (err) {
      console.warn('Error loading cached positions:', err);
    }
    return false;
  }
  
  function saveCachedPositions(positions) {
    try {
      const data = {
        version: CACHE_VERSION,
        positions: positions,
        timestamp: Date.now()
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      console.log('Saved cached positions for', Object.keys(positions).length, 'systems');
    } catch (err) {
      console.warn('Error saving cached positions:', err);
      // If localStorage is full, try to clear old cache
      try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch (e) {
        console.error('Failed to save cache even after clearing:', e);
      }
    }
  }
  
  async function initializeMap(useCache = true) {
    if (!mapData || !mapContainer || !Network) {
      console.log('Cannot initialize map:', { mapData: !!mapData, mapContainer: !!mapContainer, Network: !!Network });
      return;
    }
    
    // Create active systems lookup
    const activeSystemIds = new Set(activeSystems.map(s => s.system_id));
    const activeSystemKills = {};
    activeSystems.forEach(s => {
      activeSystemKills[s.system_id] = s.kill_count || 0;
    });
    
    // Prepare nodes (systems) - SHOW ALL SYSTEMS
    const allSystems = mapData.systems || {};
    console.log('Total systems to render:', Object.keys(allSystems).length);
    
    if (Object.keys(allSystems).length === 0) {
      console.warn('No systems found in map data');
      error = 'No systems found in map data. The cache may be empty.';
      return;
    }
    
    rendering = true;
    const systemNodes = [];
    const systems = {};
    
    // Use system positions if available
    const hasPositions = Object.values(allSystems).some(s => s.position && s.position.x !== undefined);
    
    // Process ALL systems in batches to avoid blocking
    const systemArray = Object.keys(allSystems);
    const batchSize = 100; // Larger batches since we're doing async
    
    console.log('Building nodes for', systemArray.length, 'systems...');
    
    for (let i = 0; i < systemArray.length; i += batchSize) {
      const batch = systemArray.slice(i, i + batchSize);
      
      batch.forEach(systemIdStr => {
        const system = allSystems[systemIdStr];
        if (!system) return;
        
        const systemId = typeof system.system_id === 'string' ? parseInt(system.system_id, 10) : system.system_id;
        systems[systemId] = system;
        const isActive = activeSystemIds.has(systemId);
        const killCount = activeSystemKills[systemId] || 0;
        
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
        
        // Calculate position - use cached if available, otherwise use EVE positions or random
        let x, y, z;
        if (useCache && cachedPositions && cachedPositions[systemId]) {
          // Use cached position
          const cached = cachedPositions[systemId];
          x = cached.x;
          y = cached.y;
          z = cached.z;
        } else if (hasPositions && system.position) {
          // Use actual EVE positions (scaled down)
          x = system.position.x / 1000000000;
          y = system.position.y / 1000000000;
          z = system.position.z / 1000000000;
        } else {
          // Random position (will be replaced by physics layout)
          x = (Math.random() - 0.5) * 1000;
          y = (Math.random() - 0.5) * 1000;
          z = (Math.random() - 0.5) * 1000;
        }
        
        systemNodes.push({
          id: systemId,
          label: isActive ? (system.name || `System ${systemId}`) : '', // Only show labels for active systems
          x: x,
          y: y,
          z: z,
          fixed: useCache && cachedPositions && cachedPositions[systemId] ? { x: true, y: true, z: true } : false, // Fix position if from cache
          color: {
            background: color,
            border: isActive ? '#ff0000' : '#333333',
            highlight: {
              background: isActive ? '#ff4444' : '#888888',
              border: '#ffffff'
            }
          },
          size: isActive ? 20 + (killCount * 2) : 6, // Smaller size for non-active to reduce visual clutter
          font: {
            color: '#ffffff',
            size: isActive ? 14 : 0, // No font for non-active to reduce rendering
            face: 'Arial'
          },
          title: `${system.name || 'Unknown'}\nSecurity: ${system.security_status?.toFixed(2) || 'N/A'}\n${isActive ? `Kills: ${killCount}` : ''}`,
          systemData: system
        });
      });
      
      // Yield to browser between batches
      if (i + batchSize < systemArray.length) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    
    // Prepare edges (stargates) - show ALL connections
    const systemEdges = [];
    const allSystemIds = new Set(Object.keys(allSystems).map(id => parseInt(id, 10)));
    
    console.log('Building edges for', Object.keys(stargates).length, 'stargates...');
    
    // Process edges in batches too
    const stargateArray = Object.values(stargates);
    const edgeBatchSize = 500;
    
    for (let i = 0; i < stargateArray.length; i += edgeBatchSize) {
      const batch = stargateArray.slice(i, i + edgeBatchSize);
      
      batch.forEach(stargate => {
        // Ensure IDs are numbers
        const fromId = typeof stargate.from_system_id === 'string' ? parseInt(stargate.from_system_id, 10) : stargate.from_system_id;
        const toId = typeof stargate.to_system_id === 'string' ? parseInt(stargate.to_system_id, 10) : stargate.to_system_id;
        
        // Only add edge if both systems exist
        if (fromId && toId && allSystemIds.has(fromId) && allSystemIds.has(toId)) {
          // Check if either system is active
          const fromActive = activeSystemIds.has(fromId);
          const toActive = activeSystemIds.has(toId);
          const isActive = fromActive || toActive;
          
          systemEdges.push({
            id: stargate.stargate_id,
            from: fromId,
            to: toId,
            color: {
              color: isActive ? '#ef4444' : '#333333',
              highlight: '#ffffff',
              opacity: isActive ? 0.8 : 0.1 // Very low opacity for non-active edges
            },
            width: isActive ? 2 : 0.5, // Very thin for non-active
            smooth: {
              type: 'continuous',
              roundness: 0.5
            }
          });
        }
      });
      
      // Yield to browser between batches
      if (i + edgeBatchSize < stargateArray.length) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    
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
        enabled: !(useCache && cachedPositions), // Disable physics if we have cached positions
        stabilization: {
          enabled: !(useCache && cachedPositions), // Don't stabilize if using cache
          iterations: 150, // More iterations for better layout when calculating
          fit: true,
          updateInterval: 25
        },
        barnesHut: {
          gravitationalConstant: -2000,
          centralGravity: 0.1,
          springLength: 200,
          springConstant: 0.04,
          damping: 0.09,
          avoidOverlap: 0.5
        },
        solver: 'barnesHut'
      },
      interaction: {
        zoomView: true,
        dragView: true,
        hover: true,
        tooltipDelay: 100
      }
    };
    
    if (!Network) {
      console.error('Network class not available');
      return;
    }
    
    try {
      network = new Network(mapContainer, data, options);
      console.log('Map initialized successfully with', nodes.length, 'nodes and', edges.length, 'edges');
      
      // If we don't have cached positions, calculate layout and cache it
      if (!useCache || !cachedPositions) {
        console.log('Calculating layout (this may take a while)...');
        rendering = true;
        
        // Disable physics after stabilization and cache the positions
        network.once('stabilizationEnd', () => {
          if (network) {
            console.log('Layout calculation complete, caching positions...');
            
            // Extract positions from all nodes
            const positions = {};
            network.getPositions().forEach((pos, nodeId) => {
              positions[nodeId] = {
                x: pos.x,
                y: pos.y,
                z: pos.z || 0
              };
            });
            
            // Save to cache
            saveCachedPositions(positions);
            cachedPositions = positions;
            
            // Disable physics to prevent continuous computation
            network.setOptions({ physics: { enabled: false } });
            console.log('Physics disabled after stabilization, positions cached');
            rendering = false;
          }
        });
        
        // Also handle stabilization progress to show user feedback
        network.on('stabilizationProgress', (params) => {
          const progress = Math.round(params.iterations / params.total * 100);
          if (progress % 10 === 0) { // Log every 10%
            console.log(`Layout calculation: ${progress}%`);
          }
        });
      } else {
        console.log('Using cached positions, skipping physics calculation');
        rendering = false;
      }
      
      // Add event listeners
      network.on('click', (params) => {
        if (params.nodes.length > 0) {
          const systemId = params.nodes[0];
          const system = systems[systemId] || systems[String(systemId)];
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
    } catch (err) {
      console.error('Error creating network:', err);
      error = 'Failed to create map visualization: ' + err.message;
      return;
    }
  }
  
  // Re-initialize when active systems change (debounced to prevent excessive re-renders)
  let reinitTimeout;
  $: if (activeSystems && mapData && network) {
    clearTimeout(reinitTimeout);
    reinitTimeout = setTimeout(async () => {
      if (network) {
        network.destroy();
        network = null;
      }
      await initializeMap(true); // Always use cache when re-initializing
    }, 500); // Debounce by 500ms
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
  {:else if rendering}
    <div class="loading">
      <div class="spinner"></div>
      <p>Calculating map layout...</p>
      <p class="loading-note">This only happens once, positions will be cached</p>
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

