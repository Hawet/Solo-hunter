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

  function formatISK(isk) {
    if (!isk) return '0 ISK';
    if (isk >= 1000000000) return (isk / 1000000000).toFixed(2) + 'B ISK';
    if (isk >= 1000000) return (isk / 1000000).toFixed(2) + 'M ISK';
    if (isk >= 1000) return (isk / 1000).toFixed(2) + 'K ISK';
    return isk.toLocaleString() + ' ISK';
  }
</script>

<div class="kill-list">
  <div class="header">
    <h2>Recent Kills</h2>
    <span class="count-badge">{kills.length}</span>
  </div>

  {#if kills.length === 0}
    <div class="empty">
      <div class="empty-icon">⚡</div>
      <p>Waiting for PvP activity...</p>
    </div>
  {:else}
    <div class="kills">
      {#each kills as kill (kill.killmail_id)}
        <article class="kill-card">
          <!-- Header with timestamp and link -->
          <div class="card-header">
            <time class="timestamp">{formatTime(kill.killmail_time)}</time>
            <a 
              href={kill.zkill_url} 
              target="_blank" 
              rel="noopener noreferrer"
              class="external-link"
              title="View on zKillboard"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>

          <!-- Main content: Victim vs Attacker -->
          <div class="combatants">
            <!-- Victim -->
            {#if kill.victim}
              <div class="combatant victim">
                <div class="combatant-header">
                  <span class="role-badge victim-badge">Victim</span>
                  <div class="header-stats">
                    <span class="damage-stat">damage taken: {formatNumber(kill.victim.damage_taken)}</span>
                    {#if kill.zkb && kill.zkb.total_value}
                      <span class="isk-value">{formatISK(kill.zkb.total_value)}</span>
                    {/if}
                  </div>
                </div>
                <div class="combatant-body">
                  {#if kill.victim.ship_icon}
                    <div class="ship-container">
                      <img 
                        src={kill.victim.ship_icon} 
                        alt={kill.victim.ship_name || 'Ship'}
                        class="ship-image"
                        on:error={(e) => e.target.style.display = 'none'}
                      />
                    </div>
                  {/if}
                  <div class="combatant-info">
                    <div class="ship-name">{kill.victim.ship_name || `Ship ${kill.victim.ship_type_id || 'Unknown'}`}</div>
                    <div class="pilot-name">{kill.victim.character_name || `Character ${kill.victim.character_id || 'Unknown'}`}</div>
                    {#if kill.victim.corporation_name}
                      <div class="corp-name">{kill.victim.corporation_name}</div>
                    {/if}
                  </div>
                </div>
                {#if kill.victim.fit && kill.victim.fit.length > 0}
                  <div class="fit-section">
                    <div class="fit-header">Fit:</div>
                    <div class="fit-items">
                      {#each ['high', 'mid', 'low', 'rig'] as slotType}
                        {@const slotItems = kill.victim.fit.filter(item => item.slot === slotType)}
                        {#if slotItems.length > 0}
                          <div class="fit-slot">
                            <span class="slot-label">{slotType}:</span>
                            <div class="slot-items">
                              {#each slotItems as item}
                                <div class="item-icon-wrapper">
                                  <img 
                                    src={item.icon_url} 
                                    alt={item.name}
                                    class="item-icon"
                                    on:error={(e) => e.target.style.display = 'none'}
                                  />
                                  <span class="item-tooltip">{item.name}</span>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- VS Divider -->
            <div class="vs-divider">
              <span class="vs-text">VS</span>
            </div>

            <!-- Attacker -->
            {#if kill.attacker && kill.attacker.character_id}
              <div class="combatant attacker">
                <div class="combatant-header">
                  <div class="header-badges">
                    <span class="role-badge attacker-badge">Attacker</span>
                    {#if kill.zkb && kill.zkb.solo}
                      <span class="solo-badge">SOLO</span>
                    {/if}
                  </div>
                  <span class="damage-stat">damage done: {formatNumber(kill.attacker.damage_done)}</span>
                </div>
                <div class="combatant-body">
                  {#if kill.attacker.ship_icon}
                    <div class="ship-container">
                      <img 
                        src={kill.attacker.ship_icon} 
                        alt={kill.attacker.ship_name || 'Ship'}
                        class="ship-image"
                        on:error={(e) => e.target.style.display = 'none'}
                      />
                    </div>
                  {/if}
                  <div class="combatant-info">
                    <div class="ship-name">{kill.attacker.ship_name || `Ship ${kill.attacker.ship_type_id || 'Unknown'}`}</div>
                    <div class="pilot-name">{kill.attacker.character_name || `Character ${kill.attacker.character_id || 'Unknown'}`}</div>
                    {#if kill.attacker.corporation_name}
                      <div class="corp-name">{kill.attacker.corporation_name}</div>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Location footer -->
          <div class="location-footer">
            <svg class="location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            <span class="location-text">
              <strong>{kill.solar_system_name || `System ${kill.solar_system_id}`}</strong>
              {#if kill.region_name}
                <span class="region-separator">•</span>
                <span class="region-text">{kill.region_name}</span>
              {/if}
            </span>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .kill-list {
    width: 100%;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.02em;
  }

  .count-badge {
    background: rgba(102, 126, 234, 0.2);
    color: #667eea;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #888;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty p {
    margin: 0;
    font-size: 1rem;
    font-style: italic;
  }

  .kills {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .kill-card {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 0.7rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }

  .kill-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(102, 126, 234, 0.5), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .kill-card:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(102, 126, 234, 0.3);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }

  .kill-card:hover::before {
    opacity: 1;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
  }

  .timestamp {
    font-size: 0.7rem;
    color: #888;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .external-link {
    color: #888;
    display: flex;
    align-items: center;
    transition: color 0.2s ease;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .external-link:hover {
    color: #667eea;
    background: rgba(102, 126, 234, 0.1);
  }

  .combatants {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.6rem;
  }

  .combatant {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .combatant-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.3rem;
    gap: 0.5rem;
  }

  .header-badges {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .role-badge {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
  }

  .victim-badge {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
  }

  .attacker-badge {
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
  }

  .solo-badge {
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
    border: 1px solid rgba(255, 193, 7, 0.3);
  }

  .damage-stat {
    font-size: 0.7rem;
    color: #a0a0a0;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .header-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.2rem;
  }

  .isk-value {
    font-size: 0.65rem;
    color: #ffc107;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .combatant-body {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .ship-container {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .ship-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
  }

  .combatant-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .ship-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #fff;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pilot-name {
    font-size: 0.8rem;
    color: #e0e0e0;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .corp-name {
    font-size: 0.7rem;
    color: #888;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vs-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .vs-text {
    font-size: 0.6rem;
    font-weight: 800;
    color: #667eea;
    background: rgba(102, 126, 234, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 5px;
    letter-spacing: 0.08em;
    border: 1px solid rgba(102, 126, 234, 0.2);
  }

  .location-footer {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.75rem;
  }

  .location-icon {
    color: #667eea;
    flex-shrink: 0;
    opacity: 0.7;
    width: 12px;
    height: 12px;
  }

  .location-text {
    color: #a0a0a0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .location-text strong {
    color: #fff;
    font-weight: 600;
  }

  .region-separator {
    color: #666;
    margin: 0 0.25rem;
  }

  .region-text {
    color: #888;
    font-style: italic;
  }

  .fit-section {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .fit-header {
    font-size: 0.7rem;
    font-weight: 600;
    color: #a0a0a0;
    margin-bottom: 0.3rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .fit-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .fit-slot {
    font-size: 0.7rem;
    color: #888;
    display: flex;
    gap: 0.4rem;
  }

  .slot-label {
    font-weight: 600;
    color: #a0a0a0;
    min-width: 35px;
    text-transform: capitalize;
  }

  .slot-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    flex: 1;
  }

  .item-icon-wrapper {
    position: relative;
    width: 24px;
    height: 24px;
    cursor: pointer;
    transition: transform 0.2s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .item-icon-wrapper:hover {
    transform: scale(1.2);
    z-index: 10;
  }

  .item-icon-wrapper:hover .item-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
    transition-delay: 0.1s;
  }

  .item-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .item-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%) translateY(0);
    background: rgba(0, 0, 0, 0.95);
    color: #fff;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    font-size: 0.7rem;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0.15s;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.95);
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3));
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .combatants {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .vs-divider {
      transform: rotate(90deg);
      margin: 0.5rem 0;
    }

    .ship-container {
      width: 56px;
      height: 56px;
    }
  }
</style>
