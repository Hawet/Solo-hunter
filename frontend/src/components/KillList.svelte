<script>
  export let kills = [];

  function formatTime(timeString) {
    if (!timeString) return 'Unknown';
    try {
      const date = new Date(timeString);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return timeString;
    }
  }

  function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
</script>

<div class="kill-list">
  <div class="header">
    <h2>Recent Kills ({kills.length})</h2>
    <p class="description">Most recent PvP activity in EVE Online</p>
  </div>

  {#if kills.length === 0}
    <div class="empty">No kills received yet. Waiting for activity...</div>
  {:else}
    <div class="kills">
      {#each kills as kill (kill.killmail_id)}
        <div class="kill-item">
          <div class="kill-header">
            <a 
              href={kill.zkill_url} 
              target="_blank" 
              rel="noopener noreferrer"
              class="kill-link"
            >
              Kill #{kill.killmail_id}
            </a>
            <span class="time">{formatTime(kill.killmail_time)}</span>
          </div>
          
          <div class="kill-details">
            <div class="detail-row">
              <span class="label">System ID:</span>
              <span class="value">{kill.solar_system_id}</span>
            </div>
            
            {#if kill.victim}
              <div class="detail-row">
                <span class="label">Victim:</span>
                <span class="value">
                  {kill.victim.character_id ? `Char: ${kill.victim.character_id}` : 'Unknown'}
                  {kill.victim.ship_type_id ? ` | Ship: ${kill.victim.ship_type_id}` : ''}
                </span>
              </div>
              <div class="detail-row">
                <span class="label">Damage Taken:</span>
                <span class="value">{formatNumber(kill.victim.damage_taken)}</span>
              </div>
            {/if}
            
            {#if kill.attacker && kill.attacker.character_id}
              <div class="detail-row">
                <span class="label">Attacker:</span>
                <span class="value">
                  Char: {kill.attacker.character_id}
                  {kill.attacker.ship_type_id ? ` | Ship: ${kill.attacker.ship_type_id}` : ''}
                </span>
              </div>
              <div class="detail-row">
                <span class="label">Damage Done:</span>
                <span class="value">{formatNumber(kill.attacker.damage_done)}</span>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .kill-list {
    width: 100%;
  }

  .header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  }

  .header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.8rem;
    color: #fff;
  }

  .description {
    margin: 0;
    color: #a0a0a0;
    font-size: 0.9rem;
  }

  .empty {
    text-align: center;
    padding: 3rem;
    color: #888;
    font-style: italic;
  }

  .kills {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .kill-item {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 1rem;
    transition: all 0.2s ease;
  }

  .kill-item:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(102, 126, 234, 0.5);
    transform: translateX(4px);
  }

  .kill-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .kill-link {
    color: #667eea;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    transition: color 0.2s ease;
  }

  .kill-link:hover {
    color: #764ba2;
    text-decoration: underline;
  }

  .time {
    color: #888;
    font-size: 0.85rem;
  }

  .kill-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-row {
    display: flex;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .label {
    color: #a0a0a0;
    min-width: 120px;
    font-weight: 500;
  }

  .value {
    color: #e0e0e0;
    flex: 1;
  }
</style>

