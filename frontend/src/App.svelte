<script>
  import { onMount, onDestroy } from 'svelte';
  import KillList from './components/KillList.svelte';
  import RegionStats from './components/RegionStats.svelte';
  import SystemSearch from './components/SystemSearch.svelte';

  let kills = [];
  let regions = [];
  let loading = true;
  let error = null;
  let pollInterval;
  let connectionStatus = 'disconnected';
  let isPaused = false;
  let currentPage = 'home';
  let selectedRegionId = null;

  let allSystems = [];
  let systemFilter = null;

  $: filteredKills = systemFilter
    ? kills.filter(k => systemFilter.systemIds.has(k.solar_system_id))
    : selectedRegionId
      ? kills.filter(k => k.region_id === selectedRegionId)
      : kills;

  function handleRegionSelect(regionId) {
    selectedRegionId = selectedRegionId === regionId ? null : regionId;
  }

  async function handleSystemSelect({ systemId, systemName, jumps }) {
    try {
      const resp = await fetch(`${API_URL}/api/systems/range?system_id=${systemId}&jumps=${jumps}`);
      if (!resp.ok) return;
      const data = await resp.json();
      systemFilter = {
        systemId,
        systemName,
        jumps,
        systemIds: new Set(data.systems || []),
      };
      selectedRegionId = null;
    } catch (err) {
      console.error('Error fetching system range:', err);
    }
  }

  function handleClearSystem() {
    systemFilter = null;
  }

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  // Simple hash-based routing
  function handleHashChange() {
    currentPage = 'home';
  }

  // Generate static star positions once
  const staticStars = Array.from({ length: 50 }, () => ({
    size: ['small', 'medium', 'large'][Math.floor(Math.random() * 3)],
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 3
  }));

  async function fetchKills() {
    try {
      const response = await fetch(`${API_URL}/api/kills`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      kills = data.kills || [];
      loading = false;
      error = null;
      
      // Fetch region stats
      const regionsResponse = await fetch(`${API_URL}/api/regions`);
      if (regionsResponse.ok) {
        const regionsData = await regionsResponse.json();
        regions = regionsData.regions || [];
      }
      
      // Check connection status
      const healthResponse = await fetch(`${API_URL}/api/health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        connectionStatus = healthData.redisq_connected ? 'connected' : 'disconnected';
        isPaused = healthData.paused || false;
      }
    } catch (err) {
      console.error('Error fetching kills:', err);
      error = err.message;
      loading = false;
      connectionStatus = 'error';
    }
  }

  async function fetchSystemNames() {
    try {
      const resp = await fetch(`${API_URL}/api/systems/names`);
      if (resp.ok) {
        const data = await resp.json();
        allSystems = data.systems || [];
      }
    } catch (err) {
      console.error('Error fetching system names:', err);
    }
  }

  onMount(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    
    fetchKills();
    fetchSystemNames();
    pollInterval = setInterval(fetchKills, 2000);
  });

  onDestroy(() => {
    window.removeEventListener('hashchange', handleHashChange);
    if (pollInterval) {
      clearInterval(pollInterval);
    }
  });

  async function toggleParsing() {
    try {
      const endpoint = isPaused ? '/api/resume' : '/api/pause';
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        isPaused = !isPaused;
        console.log(data.message);
      } else {
        console.error('Failed to toggle parsing');
      }
    } catch (err) {
      console.error('Error toggling parsing:', err);
    }
  }
</script>

<!-- Static glowing stars background -->
<div class="static-stars">
  {#each staticStars as star}
    <div 
      class="static-star {star.size}" 
      style="left: {star.left}%; top: {star.top}%; animation-delay: {star.delay}s;"
    ></div>
  {/each}
</div>

<main>
  <header>
    <div class="logo-container">
      <svg class="logo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <!-- Crosshair circle -->
        <circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="4" fill="none"/>
        <!-- Crosshair ticks -->
        <line x1="32" y1="4" x2="32" y2="12" stroke="currentColor" stroke-width="4"/>
        <line x1="32" y1="52" x2="32" y2="60" stroke="currentColor" stroke-width="4"/>
        <line x1="4" y1="32" x2="12" y2="32" stroke="currentColor" stroke-width="4"/>
        <line x1="52" y1="32" x2="60" y2="32" stroke="currentColor" stroke-width="4"/>
        <!-- Ship -->
        <path d="M36 26 L46 32 L36 38 L38 32 Z" fill="currentColor"/>
      </svg>
      <h1>Solo Hunter</h1>
    </div>
    <p class="subtitle">EVE Online PvP Activity Monitor</p>
      <div class="status-controls">
        <div class="status-indicator">
          <span class="status-dot" class:connected={connectionStatus === 'connected'} class:disconnected={connectionStatus !== 'connected'}></span>
          <span class="status-text">
            {connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'disconnected' ? 'Connecting...' : 'Connection error'}
          </span>
        </div>
        <button 
          class="toggle-btn" 
          class:paused={isPaused}
          on:click={toggleParsing}
          disabled={connectionStatus !== 'connected'}
          title={isPaused ? 'Resume parsing' : 'Pause parsing'}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>
  </header>

    {#if loading}
      <div class="container">
        <div class="loading">Loading recent kills...</div>
      </div>
    {:else if error}
      <div class="container">
        <div class="error">Error: {error}</div>
      </div>
    {:else}
      <div class="page-layout">
        <aside class="sidebar">
          <SystemSearch
            {allSystems}
            onSystemSelect={handleSystemSelect}
            onClearSystem={handleClearSystem}
            activeFilter={systemFilter}
          />

          {#if regions.length > 0}
            <RegionStats {regions} {selectedRegionId} onRegionSelect={handleRegionSelect} disabled={!!systemFilter} />
          {/if}
        </aside>

        <div class="main-content">
          <KillList kills={filteredKills} />
        </div>
      </div>
    {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: #0a0a0f;
    color: #e0e0e0;
    min-height: 100vh;
    overflow-x: hidden;
    position: relative;
  }

  :global(body::before) {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: 
      radial-gradient(ellipse at 20% 50%, rgba(239, 68, 68, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, rgba(220, 38, 38, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 40% 20%, rgba(239, 68, 68, 0.05) 0%, transparent 50%);
    z-index: 0;
    pointer-events: none;
  }

  :global(body::after) {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      radial-gradient(2px 2px at 20% 30%, #fff, transparent),
      radial-gradient(2px 2px at 60% 70%, rgba(255, 255, 255, 0.8), transparent),
      radial-gradient(1px 1px at 50% 50%, rgba(255, 255, 255, 0.6), transparent),
      radial-gradient(1px 1px at 80% 10%, rgba(255, 255, 255, 0.7), transparent),
      radial-gradient(2px 2px at 90% 40%, rgba(255, 255, 255, 0.9), transparent),
      radial-gradient(1px 1px at 33% 60%, rgba(255, 255, 255, 0.5), transparent),
      radial-gradient(1px 1px at 15% 80%, rgba(255, 255, 255, 0.6), transparent),
      radial-gradient(2px 2px at 70% 20%, rgba(255, 255, 255, 0.8), transparent),
      radial-gradient(1px 1px at 25% 50%, rgba(255, 255, 255, 0.5), transparent),
      radial-gradient(1px 1px at 85% 60%, rgba(255, 255, 255, 0.6), transparent);
    background-repeat: repeat;
    background-size: 200% 200%;
    animation: starfield 200s linear infinite;
    z-index: 0;
    pointer-events: none;
    opacity: 0.4;
  }

  /* Static glowing stars */
  .static-stars {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .static-star {
    position: absolute;
    border-radius: 50%;
    background: #fff;
    box-shadow: 
      0 0 4px rgba(255, 255, 255, 0.8),
      0 0 8px rgba(255, 255, 255, 0.6),
      0 0 12px rgba(239, 68, 68, 0.4),
      0 0 16px rgba(239, 68, 68, 0.3);
    animation: starGlow 3s ease-in-out infinite alternate;
  }

  .static-star.small {
    width: 2px;
    height: 2px;
  }

  .static-star.medium {
    width: 3px;
    height: 3px;
    box-shadow: 
      0 0 6px rgba(255, 255, 255, 0.9),
      0 0 12px rgba(255, 255, 255, 0.7),
      0 0 18px rgba(239, 68, 68, 0.5),
      0 0 24px rgba(239, 68, 68, 0.4);
  }

  .static-star.large {
    width: 4px;
    height: 4px;
    box-shadow: 
      0 0 8px rgba(255, 255, 255, 1),
      0 0 16px rgba(255, 255, 255, 0.8),
      0 0 24px rgba(239, 68, 68, 0.6),
      0 0 32px rgba(239, 68, 68, 0.5);
  }

  @keyframes starGlow {
    0% {
      opacity: 0.6;
      transform: scale(1);
    }
    100% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  @keyframes starfield {
    from { transform: translate(0, 0); }
    to { transform: translate(-50%, -50%); }
  }

  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
    position: relative;
    z-index: 1;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .logo-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  .logo {
    width: 90px;
    height: 90px;
    color: #ef4444;
    filter: 
      drop-shadow(0 0 10px rgba(239, 68, 68, 0.8))
      drop-shadow(0 0 20px rgba(239, 68, 68, 0.6))
      drop-shadow(0 0 30px rgba(239, 68, 68, 0.4))
      drop-shadow(0 0 40px rgba(239, 68, 68, 0.3));
    animation: logoPulse 3s ease-in-out infinite;
  }

  @keyframes logoPulse {
    0%, 100% { 
      filter: 
        drop-shadow(0 0 10px rgba(239, 68, 68, 0.8))
        drop-shadow(0 0 20px rgba(239, 68, 68, 0.6))
        drop-shadow(0 0 30px rgba(239, 68, 68, 0.4))
        drop-shadow(0 0 40px rgba(239, 68, 68, 0.3));
      transform: scale(1);
    }
    50% { 
      filter: 
        drop-shadow(0 0 15px rgba(239, 68, 68, 1))
        drop-shadow(0 0 30px rgba(239, 68, 68, 0.8))
        drop-shadow(0 0 45px rgba(239, 68, 68, 0.6))
        drop-shadow(0 0 60px rgba(239, 68, 68, 0.5));
      transform: scale(1.05);
    }
  }

  h1 {
    font-size: 3rem;
    margin: 0;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 0 20px rgba(239, 68, 68, 0.3));
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: #9ca3af;
    font-size: 1.2rem;
    margin-top: 0.5rem;
    font-weight: 300;
    letter-spacing: 0.02em;
  }

  .status-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #888;
    transition: background 0.3s ease;
  }

  .status-dot.connected {
    background: #4ade80;
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
  }

  .status-dot.disconnected {
    background: #fbbf24;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-text {
    color: #9ca3af;
    font-weight: 500;
  }

  .toggle-btn {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px;
    color: white;
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    position: relative;
    overflow: hidden;
  }

  .toggle-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
    transition: left 0.5s ease;
  }

  .toggle-btn:hover:not(:disabled)::before {
    left: 100%;
  }

  .toggle-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
  }

  .toggle-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .toggle-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }

  .toggle-btn.paused {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: rgba(16, 185, 129, 0.3);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .toggle-btn.paused:hover:not(:disabled) {
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
    border-color: rgba(16, 185, 129, 0.5);
  }
  
  .map-link {
    padding: 0.5rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    color: #fca5a5;
    text-decoration: none;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }
  
  .map-link:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    color: #ef4444;
  }

  .container {
    background: rgba(15, 15, 23, 0.7);
    border-radius: 16px;
    padding: 1.5rem;
    backdrop-filter: blur(20px);
    border: 1px solid rgba(239, 68, 68, 0.15);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .page-layout {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .sidebar {
    width: 320px;
    flex-shrink: 0;
    position: sticky;
    top: 1.5rem;
    z-index: 10;
  }

  .main-content {
    flex: 1;
    min-width: 0;
    background: rgba(15, 15, 23, 0.7);
    border-radius: 16px;
    padding: 1.5rem;
    backdrop-filter: blur(20px);
    border: 1px solid rgba(239, 68, 68, 0.15);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  @media (max-width: 900px) {
    .page-layout {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      position: static;
      max-height: none;
    }
  }

  .loading,
  .error {
    text-align: center;
    padding: 2rem;
    font-size: 1.2rem;
  }

  .error {
    color: #ff6b6b;
  }
</style>

