<script>
  import { onMount, onDestroy } from 'svelte';
  import KillList from './components/KillList.svelte';
  import RegionStats from './components/RegionStats.svelte';

  let kills = [];
  let regions = [];
  let loading = true;
  let error = null;
  let pollInterval;
  let connectionStatus = 'disconnected';
  let isPaused = false;

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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

  onMount(() => {
    fetchKills();
    // Poll every 2 seconds for new kills
    pollInterval = setInterval(fetchKills, 2000);
  });

  onDestroy(() => {
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

<main>
  <header>
    <h1>🛸 Solo Hunter</h1>
    <p class="subtitle">EVE Online PvP Activity Monitor</p>
    <div class="status-controls">
      <div class="status-indicator">
        <span class="status-dot" class:connected={connectionStatus === 'connected'} class:disconnected={connectionStatus !== 'connected'}></span>
        <span class="status-text">
          {connectionStatus === 'connected' ? 'Connected to RedisQ' : 
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

  <div class="container">
    {#if loading}
      <div class="loading">Loading recent kills...</div>
    {:else if error}
      <div class="error">Error: {error}</div>
    {:else}
      {#if regions.length > 0}
        <RegionStats {regions} />
      {/if}
      <KillList {kills} />
    {/if}
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
    color: #e0e0e0;
    min-height: 100vh;
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 3rem;
    margin: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: #a0a0a0;
    font-size: 1.2rem;
    margin-top: 0.5rem;
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
    color: #a0a0a0;
  }

  .toggle-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 8px;
    color: white;
    padding: 0.6rem 1.2rem;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .toggle-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(102, 126, 234, 0.3);
  }

  .toggle-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .toggle-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-btn.paused {
    background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  }

  .container {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1.5rem;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
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

