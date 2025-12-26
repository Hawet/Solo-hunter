<script>
  import { onMount } from 'svelte';
  import StarMap from '../components/StarMap.svelte';
  
  let activeSystems = [];
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  
  onMount(async () => {
    // Fetch active systems for map
    try {
      const activeSystemsResponse = await fetch(`${API_URL}/api/map/active-systems`);
      if (activeSystemsResponse.ok) {
        const activeSystemsData = await activeSystemsResponse.json();
        activeSystems = activeSystemsData.systems || [];
      }
    } catch (err) {
      console.error('Error fetching active systems:', err);
    }
  });
</script>

<div class="map-page">
  <header class="map-header">
    <a href="#/" class="back-link">← Back to Killfeed</a>
    <h1>EVE Online Star Map</h1>
  </header>
  
  <div class="map-container">
    <StarMap {activeSystems} apiUrl={API_URL} />
  </div>
</div>

<style>
  .map-page {
    min-height: 100vh;
    background: #0a0a0f;
    color: #e0e0e0;
    padding: 2rem;
  }
  
  .map-header {
    text-align: center;
    margin-bottom: 2rem;
  }
  
  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    color: #ef4444;
    text-decoration: none;
    font-size: 0.9rem;
    transition: opacity 0.2s;
  }
  
  .back-link:hover {
    opacity: 0.8;
  }
  
  .map-header h1 {
    margin: 0;
    font-size: 2rem;
    color: #fff;
    text-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
  }
  
  .map-container {
    width: 100%;
    height: calc(100vh - 200px);
    min-height: 600px;
  }
</style>

