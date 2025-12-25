<script>
  import { onMount, onDestroy } from 'svelte';
  
  export let kills = [];

  let expandedKills = new Set();

  function toggleKill(killId) {
    if (expandedKills.has(killId)) {
      expandedKills.delete(killId);
    } else {
      expandedKills.add(killId);
    }
    expandedKills = expandedKills; // Trigger reactivity
  }

  let tooltipElement = null;
  let tooltip = {
    visible: false,
    text: '',
    x: 0,
    y: 0
  };

  function showTooltip(event, text) {
    tooltip = {
      visible: true,
      text: text,
      x: event.clientX,
      y: event.clientY
    };
    updateTooltipDOM();
  }

  function updateTooltipPosition(event) {
    if (tooltip.visible) {
      tooltip.x = event.clientX;
      tooltip.y = event.clientY;
      updateTooltipDOM();
    }
  }

  function hideTooltip() {
    tooltip.visible = false;
    updateTooltipDOM();
  }

  function updateTooltipDOM() {
    if (!tooltipElement) return;
    
    if (tooltip.visible) {
      tooltipElement.style.display = 'block';
      tooltipElement.style.left = `${tooltip.x}px`;
      tooltipElement.style.top = `${tooltip.y}px`;
      tooltipElement.textContent = tooltip.text;
    } else {
      tooltipElement.style.display = 'none';
    }
  }

  onMount(() => {
    // Create tooltip element and append to body
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'global-tooltip';
    tooltipElement.style.display = 'none';
    tooltipElement.style.position = 'fixed';
    tooltipElement.style.pointerEvents = 'none';
    tooltipElement.style.zIndex = '99999';
    document.body.appendChild(tooltipElement);
    
    // Add mousemove listener
    window.addEventListener('mousemove', updateTooltipPosition);
  });

  onDestroy(() => {
    // Remove tooltip element and event listener
    if (tooltipElement && tooltipElement.parentNode) {
      tooltipElement.parentNode.removeChild(tooltipElement);
    }
    window.removeEventListener('mousemove', updateTooltipPosition);
  });

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
        <div 
          class="kill-card" 
          class:expanded={expandedKills.has(kill.killmail_id)}
          on:click={() => toggleKill(kill.killmail_id)}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === 'Enter' && toggleKill(kill.killmail_id)}
        >
          <!-- Header with timestamp and link -->
          <div class="card-header">
            <time class="timestamp">{formatTime(kill.killmail_time)}</time>
            <a 
              href={kill.zkill_url} 
              target="_blank" 
              rel="noopener noreferrer"
              class="external-link"
              title="View full killmail on zKillboard"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span class="link-text">View on zKillboard</span>
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
                    {#if kill.victim.character_id}
                      <a 
                        href={`https://zkillboard.com/character/${kill.victim.character_id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="pilot-name pilot-link"
                      >
                        {kill.victim.character_name || 'Unknown Character'}
                      </a>
                    {:else}
                      <div class="pilot-name">{kill.victim.character_name || 'Unknown'}</div>
                    {/if}
                    {#if kill.victim.corporation_name}
                      <div class="corp-name">
                        {kill.victim.corporation_name}
                        {#if kill.victim.alliance_name}
                          <span class="alliance-separator">•</span>
                          <span class="alliance-name">{kill.victim.alliance_name}</span>
                        {/if}
                      </div>
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
                                <div 
                                  class="item-icon-wrapper"
                                  role="img"
                                  aria-label={item.name}
                                  on:mouseenter={(e) => showTooltip(e, item.name)}
                                  on:mousemove={(e) => updateTooltipPosition(e)}
                                  on:mouseleave={hideTooltip}
                                >
                                  <img 
                                    src={item.icon_url} 
                                    alt={item.name}
                                    class="item-icon"
                                    on:error={(e) => e.target.style.display = 'none'}
                                  />
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
              <svg class="swords-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- First sword (diagonal from top-left to bottom-right) -->
                <path d="M6 3 L18 15 M6 3 L4 5 M6 3 L8 5 M18 15 L16 17 M18 15 L20 17" 
                      stroke="currentColor" 
                      stroke-width="2.5" 
                      stroke-linecap="round" 
                      stroke-linejoin="round"/>
                <!-- Second sword (diagonal from top-right to bottom-left) -->
                <path d="M18 3 L6 15 M18 3 L20 5 M18 3 L16 5 M6 15 L8 17 M6 15 L4 17" 
                      stroke="currentColor" 
                      stroke-width="2.5" 
                      stroke-linecap="round" 
                      stroke-linejoin="round"/>
                <!-- Cross point/guard -->
                <circle cx="12" cy="9" r="2" fill="currentColor" opacity="0.9"/>
              </svg>
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
                    {#if kill.attacker.character_id}
                      <a 
                        href={`https://zkillboard.com/character/${kill.attacker.character_id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="pilot-name pilot-link"
                      >
                        {kill.attacker.character_name || 'Unknown Character'}
                      </a>
                    {:else}
                      <div class="pilot-name">{kill.attacker.character_name || 'Unknown'}</div>
                    {/if}
                    {#if kill.attacker.corporation_name}
                      <div class="corp-name">
                        {kill.attacker.corporation_name}
                        {#if kill.attacker.alliance_name}
                          <span class="alliance-separator">•</span>
                          <span class="alliance-name">{kill.attacker.alliance_name}</span>
                        {/if}
                      </div>
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

          <!-- Expanded view: All attackers -->
          {#if expandedKills.has(kill.killmail_id) && kill.all_attackers && kill.all_attackers.length > 0}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="expanded-content" on:click|stopPropagation role="region" aria-label="All attackers">
              <div class="expanded-header">
                <h3>All Attackers ({kill.all_attackers.length})</h3>
                <span class="expand-indicator">▼</span>
              </div>
              <div class="attackers-list">
                {#each kill.all_attackers as attacker, index}
                  <div class="attacker-entry" class:final-blow={attacker.final_blow}>
                    <div class="attacker-rank">#{index + 1}</div>
                    <div class="attacker-main">
                      <div class="attacker-header-row">
                        {#if attacker.ship_icon}
                          <img 
                            src={attacker.ship_icon} 
                            alt={attacker.ship_name || 'Ship'}
                            class="attacker-ship-icon"
                            on:error={(e) => e.target.style.display = 'none'}
                          />
                        {/if}
                        <div class="attacker-info">
                          {#if attacker.character_id}
                            <a 
                              href={`https://zkillboard.com/character/${attacker.character_id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="attacker-name-link"
                              on:click|stopPropagation
                            >
                              {attacker.character_name || 'Unknown Character'}
                            </a>
                          {:else}
                            <span class="attacker-name">{attacker.character_name || 'Unknown'}</span>
                          {/if}
                          {#if attacker.final_blow}
                            <span class="final-blow-badge">Final Blow</span>
                          {/if}
                        </div>
                        <div class="attacker-damage">
                          {formatNumber(attacker.damage_done)} dmg
                        </div>
                      </div>
                      <div class="attacker-details">
                        <div class="attacker-ship">{attacker.ship_name || `Ship ${attacker.ship_type_id || 'Unknown'}`}</div>
                        <div class="attacker-corp-alliance">
                          {#if attacker.corporation_name}
                            <span class="attacker-corp">{attacker.corporation_name}</span>
                            {#if attacker.alliance_name}
                              <span class="alliance-separator">•</span>
                              <span class="attacker-alliance">{attacker.alliance_name}</span>
                            {/if}
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {:else if expandedKills.has(kill.killmail_id)}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="expanded-content" on:click|stopPropagation role="region" aria-label="All attackers">
              <div class="expanded-header">
                <h3>All Attackers</h3>
                <span class="expand-indicator">▼</span>
              </div>
              <div class="no-attackers">No additional attacker data available</div>
            </div>
          {/if}
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  }

  .header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.02em;
    text-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
  }

  .count-badge {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 600;
    border: 1px solid rgba(239, 68, 68, 0.3);
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.2);
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
    background: rgba(20, 20, 30, 0.6);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(239, 68, 68, 0.12);
    border-radius: 12px;
    padding: 0.7rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    cursor: pointer;
  }

  .kill-card.expanded {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .kill-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.6), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .kill-card:hover {
    background: rgba(25, 25, 35, 0.8);
    border-color: rgba(239, 68, 68, 0.4);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(239, 68, 68, 0.2), 0 4px 12px rgba(0, 0, 0, 0.4);
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
    color: #6b7280;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .external-link {
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: all 0.2s ease;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    text-decoration: none;
    font-size: 0.75rem;
    font-weight: 500;
    position: relative;
    z-index: 10;
  }

  .external-link:hover {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    transform: scale(1.05);
  }

  .link-text {
    white-space: nowrap;
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
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.2);
  }

  .attacker-badge {
    background: rgba(34, 197, 94, 0.2);
    color: #86efac;
    border: 1px solid rgba(34, 197, 94, 0.3);
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.2);
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

  .pilot-link {
    color: #fca5a5;
    text-decoration: none;
    transition: all 0.2s ease;
    display: inline-block;
  }

  .pilot-link:hover {
    color: #ef4444;
    text-decoration: underline;
    text-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  }

  .corp-name {
    font-size: 0.7rem;
    color: #888;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .alliance-separator {
    color: #666;
    margin: 0 0.2rem;
  }

  .alliance-name {
    color: #999;
    font-weight: 500;
  }

  .vs-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0.25rem;
  }

  .swords-icon {
    width: 32px;
    height: 32px;
    color: #ef4444;
    filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.8)) 
            drop-shadow(0 0 12px rgba(239, 68, 68, 0.6))
            drop-shadow(0 0 16px rgba(239, 68, 68, 0.4));
    animation: swordsGlow 2s ease-in-out infinite alternate;
  }

  @keyframes swordsGlow {
    0% {
      filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.6)) 
              drop-shadow(0 0 10px rgba(239, 68, 68, 0.4))
              drop-shadow(0 0 14px rgba(239, 68, 68, 0.3));
    }
    100% {
      filter: drop-shadow(0 0 10px rgba(239, 68, 68, 1)) 
              drop-shadow(0 0 16px rgba(239, 68, 68, 0.8))
              drop-shadow(0 0 20px rgba(239, 68, 68, 0.6));
    }
  }

  .location-footer {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(139, 92, 246, 0.15);
    font-size: 0.75rem;
  }

  .location-icon {
    color: #fca5a5;
    flex-shrink: 0;
    opacity: 0.8;
    width: 12px;
    height: 12px;
    filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.4));
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

  .item-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  :global(.global-tooltip) {
    position: fixed !important;
    transform: translate(-50%, calc(-100% - 12px));
    background: rgba(0, 0, 0, 0.95);
    color: #fff;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    font-size: 0.7rem;
    white-space: nowrap;
    pointer-events: none;
    z-index: 99999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    animation: tooltipFadeIn 0.1s ease-out;
    isolation: isolate;
  }

  :global(.global-tooltip::after) {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.95);
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3));
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, calc(-100% - 12px)) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, calc(-100% - 12px)) scale(1);
    }
  }

  /* Expanded content styles */
  .expanded-content {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(239, 68, 68, 0.2);
    animation: expandFadeIn 0.3s ease-out;
  }

  @keyframes expandFadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .expanded-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .expanded-header h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .expand-indicator {
    color: #fca5a5;
    font-size: 0.8rem;
  }

  .attackers-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .attacker-entry {
    background: rgba(15, 15, 23, 0.5);
    border: 1px solid rgba(239, 68, 68, 0.1);
    border-radius: 8px;
    padding: 0.6rem;
    display: flex;
    gap: 0.6rem;
    transition: all 0.2s ease;
  }

  .attacker-entry:hover {
    background: rgba(20, 20, 30, 0.7);
    border-color: rgba(239, 68, 68, 0.2);
  }

  .attacker-entry.final-blow {
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.05);
  }

  .attacker-rank {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    color: #fca5a5;
  }

  .attacker-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .attacker-header-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .attacker-ship-icon {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    object-fit: contain;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .attacker-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .attacker-name-link {
    color: #fca5a5;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 600;
    transition: all 0.2s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attacker-name-link:hover {
    color: #ef4444;
    text-decoration: underline;
    text-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  }

  .attacker-name {
    color: #e0e0e0;
    font-size: 0.8rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .final-blow-badge {
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    background: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.5);
  }

  .attacker-damage {
    font-size: 0.75rem;
    color: #ffc107;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .attacker-details {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-left: 42px; /* Align with ship icon */
  }

  .attacker-ship {
    font-size: 0.75rem;
    color: #a0a0a0;
    font-weight: 500;
  }

  .attacker-corp-alliance {
    font-size: 0.7rem;
    color: #888;
    font-style: italic;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .attacker-corp {
    color: #888;
  }

  .attacker-alliance {
    color: #999;
    font-weight: 500;
  }

  .no-attackers {
    text-align: center;
    padding: 1rem;
    color: #888;
    font-style: italic;
    font-size: 0.85rem;
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

    .attacker-details {
      margin-left: 0;
    }
  }
</style>
