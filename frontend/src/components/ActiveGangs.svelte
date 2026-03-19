<script>
  export let gangs = [];
  export let selectedGang = null;
  export let onGangSelect = () => {};
</script>

<div class="active-gangs">
  <div class="gangs-header">
    <h3>Active Gangs</h3>
    <div class="header-right">
      {#if selectedGang}
        <span class="filter-badge">
          Showing: {selectedGang.epithet}
          <button
            class="clear-filter"
            on:click={() => onGangSelect(selectedGang)}
            aria-label="Clear gang filter"
          >&times;</button>
        </span>
      {:else}
        <span class="session-label">
          {gangs.length > 0 ? `${gangs.length} detected` : 'Monitoring'}
        </span>
      {/if}
    </div>
  </div>

  {#if gangs.length === 0}
    <div class="empty-state">No active gangs detected</div>
  {:else}
    <div class="gangs-list">
      {#each gangs as gang (gang.roster.join(','))}
        <button
          class="gang-card"
          class:selected={selectedGang && selectedGang.roster.join(',') === gang.roster.join(',')}
          class:dimmed={selectedGang && selectedGang.roster.join(',') !== gang.roster.join(',')}
          on:click={() => onGangSelect(gang)}
          title={selectedGang && selectedGang.roster.join(',') === gang.roster.join(',') ? 'Click to clear filter' : `Filter kills by ${gang.epithet}`}
        >
          <div class="gang-name">{gang.name}</div>
          <div class="gang-details">
            <div class="gang-row">
              <span class="detail-label">Region</span>
              <span class="detail-value">{gang.active_region_name || 'Unknown'}</span>
            </div>
            <div class="gang-row">
              <span class="detail-label">Last seen</span>
              <span class="detail-value">{gang.last_solar_system_name || 'Unknown'}</span>
            </div>
            <div class="gang-meta">
              <span class="meta-badge pilots" title="Roster size">{gang.attacker_count} pilots</span>
              <span class="meta-badge kills" title="Kills in feed">{gang.kill_count} kills</span>
            </div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .active-gangs {
    background: rgba(20, 20, 30, 0.6);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .gangs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .gangs-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .session-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  .filter-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 8px;
    padding: 0.25rem 0.6rem;
  }

  .clear-filter {
    all: unset;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    color: #fca5a5;
    padding: 0 0.15rem;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .clear-filter:hover {
    color: #fff;
    background: rgba(239, 68, 68, 0.3);
  }

  .empty-state {
    text-align: center;
    color: #666;
    font-size: 0.85rem;
    padding: 0.75rem 0;
  }

  .gangs-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .gang-card {
    all: unset;
    box-sizing: border-box;
    display: block;
    width: 100%;
    cursor: pointer;
    background: rgba(15, 15, 23, 0.5);
    border: 1px solid rgba(239, 68, 68, 0.1);
    border-radius: 10px;
    padding: 0.75rem;
    transition: all 0.2s ease;
    text-align: left;
  }

  .gang-card:hover {
    background: rgba(25, 25, 35, 0.7);
    border-color: rgba(239, 68, 68, 0.4);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
  }

  .gang-card:focus-visible {
    outline: 2px solid rgba(239, 68, 68, 0.6);
    outline-offset: 2px;
  }

  .gang-card.selected {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.6);
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.25), inset 0 0 12px rgba(239, 68, 68, 0.08);
  }

  .gang-card.dimmed {
    opacity: 0.45;
  }

  .gang-card.dimmed:hover {
    opacity: 0.75;
  }

  .gang-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #fca5a5;
    margin-bottom: 0.5rem;
    line-height: 1.3;
  }

  .gang-details {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .gang-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .detail-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }

  .detail-value {
    font-size: 0.8rem;
    color: #e0e0e0;
    font-weight: 500;
  }

  .gang-meta {
    display: flex;
    gap: 0.5rem;
  }

  .meta-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 5px;
    font-variant-numeric: tabular-nums;
  }

  .meta-badge.pilots {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.25);
  }

  .meta-badge.kills {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
</style>
