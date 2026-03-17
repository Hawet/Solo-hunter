<script>
  import { onMount, onDestroy } from 'svelte';

  export let allSystems = [];
  export let onSystemSelect = () => {};
  export let onClearSystem = () => {};
  export let activeFilter = null;
  export let disabled = false;

  let query = '';
  let results = [];
  let showDropdown = false;
  let highlightIndex = -1;
  let jumpRange = 10;
  let inputEl;
  let debounceTimer;

  function secStatusColor(sec) {
    if (sec >= 0.5) return '#4ade80';
    if (sec > 0.0) return '#fbbf24';
    return '#ef4444';
  }

  function filterLocal(q) {
    if (!q || q.length < 1) {
      results = [];
      return;
    }
    const lower = q.toLowerCase();
    const prefix = [];
    const substring = [];
    for (const sys of allSystems) {
      const nameLower = sys.name.toLowerCase();
      if (nameLower.startsWith(lower)) {
        prefix.push(sys);
      } else if (nameLower.includes(lower)) {
        substring.push(sys);
      }
      if (prefix.length + substring.length >= 12) break;
    }
    results = [...prefix, ...substring].slice(0, 12);
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      filterLocal(query);
      showDropdown = results.length > 0;
      highlightIndex = -1;
    }, 100);
  }

  function selectSystem(sys) {
    onSystemSelect({ systemId: sys.system_id, systemName: sys.name, jumps: jumpRange });
    query = '';
    results = [];
    showDropdown = false;
    highlightIndex = -1;
  }

  function handleKeydown(e) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIndex = Math.min(highlightIndex + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      selectSystem(results[highlightIndex]);
    } else if (e.key === 'Escape') {
      showDropdown = false;
      highlightIndex = -1;
    }
  }

  function handleRangeChange() {
    if (activeFilter) {
      onSystemSelect({ systemId: activeFilter.systemId, systemName: activeFilter.systemName, jumps: jumpRange });
    }
  }

  function handleClickOutside(e) {
    if (inputEl && !inputEl.closest('.system-search').contains(e.target)) {
      showDropdown = false;
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside, true);
  });

  onDestroy(() => {
    clearTimeout(debounceTimer);
    document.removeEventListener('click', handleClickOutside, true);
  });
</script>

<div class="system-search" class:disabled>
  <div class="search-header">
    <h3>System Search</h3>
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
        bind:this={inputEl}
        type="text"
        placeholder="Search solar system..."
        bind:value={query}
        on:input={handleInput}
        on:keydown={handleKeydown}
        on:focus={() => { if (results.length) showDropdown = true; }}
        {disabled}
        autocomplete="off"
        spellcheck="false"
      />
      {#if showDropdown && results.length > 0}
        <ul class="dropdown" role="listbox">
          {#each results as sys, i (sys.system_id)}
            <li
              class="dropdown-item"
              class:highlighted={i === highlightIndex}
              on:mousedown|preventDefault={() => selectSystem(sys)}
              on:mouseenter={() => { highlightIndex = i; }}
              role="option"
              aria-selected={i === highlightIndex}
            >
              <span class="sys-name">{sys.name}</span>
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
        {disabled}
      />
      <span class="range-unit">jumps</span>
    </div>
  </div>
</div>

<style>
  .system-search {
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

  .system-search.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .search-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .search-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.01em;
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
    padding: 0.6rem 0.85rem;
    background: rgba(10, 10, 18, 0.7);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 10px;
    color: #e0e0e0;
    font-size: 0.9rem;
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
    padding: 0.5rem 0.85rem;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: rgba(239, 68, 68, 0.12);
  }

  .sys-name {
    color: #e0e0e0;
    font-size: 0.88rem;
    font-weight: 500;
  }

  .sys-sec {
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
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
    padding: 0.55rem 0.4rem;
    background: rgba(10, 10, 18, 0.7);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 0.88rem;
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

</style>
