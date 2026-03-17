<script>
  import { onMount, onDestroy } from 'svelte';

  export let allSystems = [];
  export let allShips = [];
  export let onSystemSelect = () => {};
  export let onClearSystem = () => {};
  export let onShipFilterChange = () => {};
  export let activeFilter = null;
  export let selectedShips = [];
  export let selectedTags = [];

  // --- System search state ---
  let sysQuery = '';
  let sysResults = [];
  let showSysDropdown = false;
  let sysHighlight = -1;
  let jumpRange = 10;
  let sysInputEl;
  let sysDebounce;

  // --- Ship search state ---
  let shipQuery = '';
  let shipResults = [];
  let showShipDropdown = false;
  let shipHighlight = -1;
  let shipInputEl;
  let shipDebounce;

  const TAG_OPTIONS = [
    { id: 'small', label: 'Small' },
    { id: 'medium', label: 'Medium' },
    { id: 'large', label: 'Large' },
    { id: 'capital', label: 'Capital' },
    { id: 't1', label: 'T1' },
    { id: 't2', label: 'T2' },
    { id: 't3', label: 'T3' },
    { id: 'faction', label: 'Faction' },
  ];

  function secStatusColor(sec) {
    if (sec >= 0.5) return '#4ade80';
    if (sec > 0.0) return '#fbbf24';
    return '#ef4444';
  }

  // --- System autocomplete ---
  function filterSystems(q) {
    if (!q || q.length < 1) { sysResults = []; return; }
    const lower = q.toLowerCase();
    const prefix = [];
    const substring = [];
    for (const sys of allSystems) {
      const n = sys.name.toLowerCase();
      if (n.startsWith(lower)) prefix.push(sys);
      else if (n.includes(lower)) substring.push(sys);
      if (prefix.length + substring.length >= 12) break;
    }
    sysResults = [...prefix, ...substring].slice(0, 12);
  }

  function handleSysInput() {
    clearTimeout(sysDebounce);
    sysDebounce = setTimeout(() => {
      filterSystems(sysQuery);
      showSysDropdown = sysResults.length > 0;
      sysHighlight = -1;
    }, 100);
  }

  function selectSystem(sys) {
    onSystemSelect({ systemId: sys.system_id, systemName: sys.name, jumps: jumpRange });
    sysQuery = '';
    sysResults = [];
    showSysDropdown = false;
    sysHighlight = -1;
  }

  function handleSysKeydown(e) {
    if (!showSysDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sysHighlight = Math.min(sysHighlight + 1, sysResults.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sysHighlight = Math.max(sysHighlight - 1, 0); }
    else if (e.key === 'Enter' && sysHighlight >= 0) { e.preventDefault(); selectSystem(sysResults[sysHighlight]); }
    else if (e.key === 'Escape') { showSysDropdown = false; sysHighlight = -1; }
  }

  function handleRangeChange() {
    if (activeFilter) {
      onSystemSelect({ systemId: activeFilter.systemId, systemName: activeFilter.systemName, jumps: jumpRange });
    }
  }

  // --- Ship autocomplete ---
  function filterShips(q) {
    if (!q || q.length < 1) { shipResults = []; return; }
    const lower = q.toLowerCase();
    const selectedIds = new Set(selectedShips.map(s => s.type_id));
    const prefix = [];
    const substring = [];
    for (const ship of allShips) {
      if (selectedIds.has(ship.type_id)) continue;
      const n = ship.name.toLowerCase();
      if (n.startsWith(lower)) prefix.push(ship);
      else if (n.includes(lower)) substring.push(ship);
      if (prefix.length + substring.length >= 12) break;
    }
    shipResults = [...prefix, ...substring].slice(0, 12);
  }

  function handleShipInput() {
    clearTimeout(shipDebounce);
    shipDebounce = setTimeout(() => {
      filterShips(shipQuery);
      showShipDropdown = shipResults.length > 0;
      shipHighlight = -1;
    }, 100);
  }

  function selectShip(ship) {
    const newSelected = [...selectedShips, ship];
    shipQuery = '';
    shipResults = [];
    showShipDropdown = false;
    shipHighlight = -1;
    onShipFilterChange({ ships: newSelected, tags: selectedTags });
  }

  function removeShip(typeId) {
    const newSelected = selectedShips.filter(s => s.type_id !== typeId);
    onShipFilterChange({ ships: newSelected, tags: selectedTags });
  }

  function handleShipKeydown(e) {
    if (!showShipDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); shipHighlight = Math.min(shipHighlight + 1, shipResults.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); shipHighlight = Math.max(shipHighlight - 1, 0); }
    else if (e.key === 'Enter' && shipHighlight >= 0) { e.preventDefault(); selectShip(shipResults[shipHighlight]); }
    else if (e.key === 'Escape') { showShipDropdown = false; shipHighlight = -1; }
  }

  // --- Tag quick-filters ---
  function toggleTag(tagId) {
    let newTags;
    if (selectedTags.includes(tagId)) {
      newTags = selectedTags.filter(t => t !== tagId);
    } else {
      newTags = [...selectedTags, tagId];
    }
    onShipFilterChange({ ships: selectedShips, tags: newTags });
  }

  function clearAllShipFilters() {
    onShipFilterChange({ ships: [], tags: [] });
    shipQuery = '';
    shipResults = [];
    showShipDropdown = false;
  }

  // --- Click outside ---
  function handleClickOutside(e) {
    if (sysInputEl && !sysInputEl.closest('.filter-section').contains(e.target)) {
      showSysDropdown = false;
    }
    if (shipInputEl && !shipInputEl.closest('.filter-section').contains(e.target)) {
      showShipDropdown = false;
    }
  }

  $: hasShipFilters = selectedShips.length > 0 || selectedTags.length > 0;

  onMount(() => {
    document.addEventListener('click', handleClickOutside, true);
  });

  onDestroy(() => {
    clearTimeout(sysDebounce);
    clearTimeout(shipDebounce);
    document.removeEventListener('click', handleClickOutside, true);
  });
</script>

<div class="filters-container">
  <div class="filters-header">
    <h3>Filters</h3>
  </div>

  <!-- System Search Section -->
  <div class="filter-section">
    <div class="section-header">
      <span class="section-title">Solar System</span>
      {#if activeFilter}
        <span class="filter-badge">
          {activeFilter.systemName} ({activeFilter.jumps}j)
          <button class="clear-btn" on:click={onClearSystem} aria-label="Clear system filter">&times;</button>
        </span>
      {/if}
    </div>

    <div class="search-row">
      <div class="input-wrapper">
        <input
          bind:this={sysInputEl}
          type="text"
          placeholder="Search solar system..."
          bind:value={sysQuery}
          on:input={handleSysInput}
          on:keydown={handleSysKeydown}
          on:focus={() => { if (sysResults.length) showSysDropdown = true; }}
          autocomplete="off"
          spellcheck="false"
        />
        {#if showSysDropdown && sysResults.length > 0}
          <ul class="dropdown" role="listbox">
            {#each sysResults as sys, i (sys.system_id)}
              <li
                class="dropdown-item"
                class:highlighted={i === sysHighlight}
                on:mousedown|preventDefault={() => selectSystem(sys)}
                on:mouseenter={() => { sysHighlight = i; }}
                role="option"
                aria-selected={i === sysHighlight}
              >
                <span class="item-name">{sys.name}</span>
                <span class="sys-sec" style="color: {secStatusColor(sys.security_status)}">
                  {sys.security_status.toFixed(1)}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="range-control">
        <label for="jump-range">Range</label>
        <input
          id="jump-range"
          type="number"
          min="1"
          max="25"
          bind:value={jumpRange}
          on:change={handleRangeChange}
        />
        <span class="range-unit">jumps</span>
      </div>
    </div>
  </div>

  <!-- Divider -->
  <div class="section-divider"></div>

  <!-- Ship Filter Section -->
  <div class="filter-section">
    <div class="section-header">
      <span class="section-title">Ships</span>
      {#if hasShipFilters}
        <button class="clear-all-btn" on:click={clearAllShipFilters}>Clear all</button>
      {/if}
    </div>
    <p class="filter-note">Matches the final blow attacker's ship</p>

    <!-- Tag quick-filters -->
    <div class="tag-filters">
      <div class="tag-group">
        <span class="tag-group-label">Size</span>
        <div class="tag-chips">
          {#each TAG_OPTIONS.filter(t => ['small','medium','large','capital'].includes(t.id)) as tag (tag.id)}
            <button
              class="tag-chip"
              class:active={selectedTags.includes(tag.id)}
              on:click={() => toggleTag(tag.id)}
            >{tag.label}</button>
          {/each}
        </div>
      </div>
      <div class="tag-group">
        <span class="tag-group-label">Tier</span>
        <div class="tag-chips">
          {#each TAG_OPTIONS.filter(t => ['t1','t2','t3','faction'].includes(t.id)) as tag (tag.id)}
            <button
              class="tag-chip"
              class:active={selectedTags.includes(tag.id)}
              on:click={() => toggleTag(tag.id)}
            >{tag.label}</button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Ship autocomplete -->
    <div class="input-wrapper">
      <input
        bind:this={shipInputEl}
        type="text"
        placeholder="Search ship name..."
        bind:value={shipQuery}
        on:input={handleShipInput}
        on:keydown={handleShipKeydown}
        on:focus={() => { if (shipResults.length) showShipDropdown = true; }}
        autocomplete="off"
        spellcheck="false"
      />
      {#if showShipDropdown && shipResults.length > 0}
        <ul class="dropdown" role="listbox">
          {#each shipResults as ship, i (ship.type_id)}
            <li
              class="dropdown-item"
              class:highlighted={i === shipHighlight}
              on:mousedown|preventDefault={() => selectShip(ship)}
              on:mouseenter={() => { shipHighlight = i; }}
              role="option"
              aria-selected={i === shipHighlight}
            >
              <span class="item-name">{ship.name}</span>
              {#if ship.tags && ship.tags.length > 0}
                <span class="ship-tags-hint">
                  {ship.tags.join(' ')}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Selected ship chips -->
    {#if selectedShips.length > 0}
      <div class="selected-ships">
        {#each selectedShips as ship (ship.type_id)}
          <span class="ship-chip">
            {ship.name}
            <button class="chip-remove" on:click={() => removeShip(ship.type_id)} aria-label="Remove {ship.name}">&times;</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .filters-container {
    background: rgba(20, 20, 30, 0.6);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 16px;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    position: relative;
    z-index: 20;
  }

  .filters-header {
    margin-bottom: 1rem;
  }

  .filters-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .filter-section {
    position: relative;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.6rem;
  }

  .section-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-divider {
    height: 1px;
    background: rgba(239, 68, 68, 0.12);
    margin: 1rem 0;
  }

  .filter-note {
    margin: 0 0 0.5rem 0;
    font-size: 0.68rem;
    color: #6b7280;
    font-style: italic;
  }

  .filter-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 8px;
    padding: 0.2rem 0.5rem;
  }

  .clear-btn {
    all: unset;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    color: #fca5a5;
    padding: 0 0.15rem;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .clear-btn:hover {
    color: #fff;
    background: rgba(239, 68, 68, 0.3);
  }

  .clear-all-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 500;
    color: #fca5a5;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .clear-all-btn:hover {
    color: #fff;
    background: rgba(239, 68, 68, 0.25);
  }

  .search-row {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .input-wrapper {
    flex: 1;
    position: relative;
  }

  input[type="text"] {
    width: 100%;
    box-sizing: border-box;
    padding: 0.55rem 0.8rem;
    background: rgba(10, 10, 18, 0.7);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 10px;
    color: #e0e0e0;
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  input[type="text"]::placeholder {
    color: #666;
  }

  input[type="text"]:focus {
    border-color: rgba(239, 68, 68, 0.5);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.15);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    background: rgba(15, 15, 23, 0.98);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
    z-index: 9999;
    max-height: 280px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.8rem;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: rgba(239, 68, 68, 0.12);
  }

  .item-name {
    color: #e0e0e0;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .sys-sec {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .ship-tags-hint {
    font-size: 0.68rem;
    color: #888;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .range-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .range-control label {
    font-size: 0.8rem;
    color: #888;
    font-weight: 500;
  }

  .range-control input[type="number"] {
    width: 52px;
    padding: 0.5rem 0.4rem;
    background: rgba(10, 10, 18, 0.7);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 0.85rem;
    text-align: center;
    outline: none;
    transition: border-color 0.2s ease;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .range-control input[type="number"]::-webkit-inner-spin-button,
  .range-control input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
  }

  .range-control input[type="number"]:focus {
    border-color: rgba(239, 68, 68, 0.5);
  }

  .range-unit {
    font-size: 0.78rem;
    color: #666;
    font-weight: 500;
  }

  /* Tag quick-filters */
  .tag-filters {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  .tag-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .tag-group-label {
    font-size: 0.68rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    min-width: 30px;
  }

  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .tag-chip {
    all: unset;
    cursor: pointer;
    font-size: 0.68rem;
    font-weight: 600;
    padding: 0.2rem 0.45rem;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #9ca3af;
    transition: all 0.15s ease;
    user-select: none;
  }

  .tag-chip:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }

  .tag-chip.active {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fca5a5;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.2);
  }

  /* Selected ships */
  .selected-ships {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.5rem;
  }

  .ship-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 6px;
    padding: 0.18rem 0.45rem;
  }

  .chip-remove {
    all: unset;
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    color: #fca5a5;
    padding: 0 0.1rem;
    border-radius: 3px;
    transition: color 0.12s ease, background 0.12s ease;
  }

  .chip-remove:hover {
    color: #fff;
    background: rgba(239, 68, 68, 0.35);
  }
</style>
