<script>
  export let regions = [];

  // Find max count for scaling
  $: maxCount = regions.length > 0 ? Math.max(...regions.map(r => r.count)) : 1;
</script>

<div class="region-stats">
  <div class="stats-header">
    <h3>Active Regions</h3>
    <span class="session-label">Current Session</span>
  </div>
  <div class="regions-grid">
    {#each regions as region (region.region_id)}
      <div class="region-card" style="--activity: {region.count / maxCount}">
        <div class="region-content">
          <div class="region-info">
            <span class="region-name">{region.name}</span>
            <span class="region-count">{region.count}</span>
          </div>
          <div class="activity-bar">
            <div 
              class="activity-fill" 
              style="width: {Math.max(8, (region.count / maxCount) * 100)}%"
            ></div>
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .region-stats {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .stats-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .session-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  .regions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .region-card {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 0.75rem;
    transition: all 0.2s ease;
    overflow: hidden;
    position: relative;
  }

  .region-card:hover {
    background: rgba(0, 0, 0, 0.3);
    border-color: rgba(102, 126, 234, 0.3);
    transform: translateY(-1px);
  }

  .region-content {
    position: relative;
    z-index: 1;
  }

  .region-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .region-name {
    font-size: 0.9rem;
    font-weight: 500;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 0.5rem;
  }

  .region-count {
    font-size: 0.85rem;
    font-weight: 700;
    color: #667eea;
    background: rgba(102, 126, 234, 0.15);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .activity-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 2px;
    overflow: hidden;
  }

  .activity-fill {
    height: 100%;
    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
    border-radius: 2px;
    transition: width 0.3s ease;
    min-width: 8px;
  }

  @media (max-width: 768px) {
    .regions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
