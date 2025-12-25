<script>
  export let regions = [];

  // Find max count for scaling
  $: maxCount = regions.length > 0 ? Math.max(...regions.map(r => r.count)) : 1;
</script>

<div class="region-stats">
  <div class="stats-header">
    <h3>Most Active Regions</h3>
  </div>
  <div class="regions-list">
    {#each regions as region (region.region_id)}
      <div class="region-item" style="--activity: {region.count / maxCount}">
        <div class="region-bar" style="width: {Math.max(10, (region.count / maxCount) * 100)}%"></div>
        <div class="region-content">
          <span class="region-name">{region.name}</span>
          <span class="region-count">{region.count}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .region-stats {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .stats-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .stats-header h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #fff;
    font-weight: 600;
  }

  .stats-subtitle {
    font-size: 0.85rem;
    color: #a0a0a0;
  }

  .regions-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .region-item {
    position: relative;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    overflow: hidden;
    transition: transform 0.2s ease;
  }

  .region-item:hover {
    transform: translateX(4px);
  }

  .region-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, rgba(102, 126, 234, 0.6) 0%, rgba(118, 75, 162, 0.6) 100%);
    transition: width 0.3s ease;
    min-width: 10px;
  }

  .region-content {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.75rem;
    z-index: 1;
  }

  .region-name {
    font-weight: 500;
    color: #fff;
    font-size: 0.9rem;
  }

  .region-count {
    font-weight: 700;
    color: #fff;
    font-size: 1rem;
    background: rgba(0, 0, 0, 0.3);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    min-width: 2rem;
    text-align: center;
  }
</style>

