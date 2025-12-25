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
          
          <div class="kill-content">
            {#if kill.victim}
              <div class="participant victim">
                <div class="participant-header">
                  <span class="participant-label">Victim</span>
                  <span class="damage">Damage: {formatNumber(kill.victim.damage_taken)}</span>
                </div>
                <div class="participant-info">
                  {#if kill.victim.ship_icon}
                    <img 
                      src={kill.victim.ship_icon} 
                      alt={kill.victim.ship_name || 'Ship'}
                      class="ship-icon"
                      on:error={(e) => e.target.style.display = 'none'}
                    />
                  {/if}
                  <div class="participant-details">
                    <div class="ship-name">
                      {kill.victim.ship_name || `Ship ${kill.victim.ship_type_id || 'Unknown'}`}
                    </div>
                    <div class="character-name">
                      {kill.victim.character_name || `Character ${kill.victim.character_id || 'Unknown'}`}
                    </div>
                    {#if kill.victim.corporation_name}
                      <div class="corporation-name">
                        {kill.victim.corporation_name}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
            
            {#if kill.attacker && kill.attacker.character_id}
              <div class="participant attacker">
                <div class="participant-header">
                  <span class="participant-label">Attacker</span>
                  <span class="damage">Damage: {formatNumber(kill.attacker.damage_done)}</span>
                </div>
                <div class="participant-info">
                  {#if kill.attacker.ship_icon}
                    <img 
                      src={kill.attacker.ship_icon} 
                      alt={kill.attacker.ship_name || 'Ship'}
                      class="ship-icon"
                      on:error={(e) => e.target.style.display = 'none'}
                    />
                  {/if}
                  <div class="participant-details">
                    <div class="ship-name">
                      {kill.attacker.ship_name || `Ship ${kill.attacker.ship_type_id || 'Unknown'}`}
                    </div>
                    <div class="character-name">
                      {kill.attacker.character_name || `Character ${kill.attacker.character_id || 'Unknown'}`}
                    </div>
                    {#if kill.attacker.corporation_name}
                      <div class="corporation-name">
                        {kill.attacker.corporation_name}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
            
            <div class="system-info">
              <span class="system-label">System:</span>
              <span class="system-name">
                {kill.solar_system_name || `System ${kill.solar_system_id}`}
              </span>
              {#if kill.region_name}
                <span class="region-name">• {kill.region_name}</span>
              {/if}
            </div>
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
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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

  .kill-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .participant {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    padding: 0.75rem;
    border-left: 3px solid;
  }

  .participant.victim {
    border-left-color: #ef4444;
  }

  .participant.attacker {
    border-left-color: #22c55e;
  }

  .participant-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .participant-label {
    font-weight: 600;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .participant.victim .participant-label {
    color: #ef4444;
  }

  .participant.attacker .participant-label {
    color: #22c55e;
  }

  .damage {
    font-size: 0.8rem;
    color: #a0a0a0;
  }

  .participant-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .ship-icon {
    width: 48px;
    height: 48px;
    object-fit: contain;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    padding: 4px;
  }

  .participant-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .ship-name {
    font-weight: 600;
    font-size: 1rem;
    color: #fff;
  }

  .character-name {
    font-size: 0.9rem;
    color: #e0e0e0;
  }

  .corporation-name {
    font-size: 0.8rem;
    color: #a0a0a0;
    font-style: italic;
  }

  .system-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.85rem;
    flex-wrap: wrap;
  }

  .system-label {
    color: #a0a0a0;
    font-weight: 500;
  }

  .system-name {
    color: #fff;
    font-weight: 600;
  }

  .region-name {
    color: #a0a0a0;
    font-style: italic;
  }
</style>
