/**
 * Preprocesses raw EVE Online map data for efficient rendering
 * - Normalizes coordinates
 * - Builds efficient data structures
 * - Pre-computes bounds
 */

export class DataPreprocessor {
  process(mapData) {
    const { systems: rawSystems, stargates: rawStargates, regions: rawRegions } = mapData;
    
    // Step 1: Normalize coordinates
    const bounds = this._calculateBounds(rawSystems);
    const normalizedSystems = this._normalizeCoordinates(rawSystems, bounds);
    
    // Step 2: Build system map (filter out VR and wormhole systems)
    const systems = new Map();
    Object.values(normalizedSystems).forEach(system => {
      // Filter out systems from VR and wormhole regions
      if (!this._shouldFilterRegion(system.region_id, rawRegions)) {
        systems.set(system.system_id, system);
      }
    });
    
    // Step 3: Build edge map (filter out edges connected to VR/wormhole systems)
    const edges = new Map();
    Object.values(rawStargates).forEach(stargate => {
      if (stargate.from_system_id && stargate.to_system_id) {
        // Get system data to check their regions
        const fromSystem = rawSystems[stargate.from_system_id];
        const toSystem = rawSystems[stargate.to_system_id];
        
        // Only include edges if both systems are not in filtered regions
        if (fromSystem && toSystem &&
            !this._shouldFilterRegion(fromSystem.region_id, rawRegions) &&
            !this._shouldFilterRegion(toSystem.region_id, rawRegions)) {
          edges.set(stargate.stargate_id, {
            stargate_id: stargate.stargate_id,
            from_system_id: stargate.from_system_id,
            to_system_id: stargate.to_system_id,
            to_stargate_id: stargate.to_stargate_id
          });
        }
      }
    });
    
    // Step 4: Group systems by region and calculate region positions
    const regions = this._processRegions(rawRegions, normalizedSystems);
    
    return {
      systems,
      edges,
      regions,
      bounds
    };
  }
  
  /**
   * Process regions: group systems by region and calculate region centroids
   * Then apply spacing algorithm to prevent overlaps
   */
  _processRegions(rawRegions, normalizedSystems) {
    const regions = new Map();
    const systemsByRegion = new Map(); // region_id -> [system_ids]
    
    // Group systems by region
    Object.values(normalizedSystems).forEach(system => {
      const regionId = system.region_id;
      if (regionId) {
        if (!systemsByRegion.has(regionId)) {
          systemsByRegion.set(regionId, []);
        }
        systemsByRegion.get(regionId).push(system.system_id);
      }
    });
    
    // Calculate region positions (centroid of systems in region) and bounds
    const regionPositions = [];
    systemsByRegion.forEach((systemIds, regionId) => {
      // Filter out VR (Victory Road) regions and wormhole regions
      if (this._shouldFilterRegion(regionId, rawRegions)) {
        return; // Skip this region
      }
      
      const regionSystems = systemIds
        .map(id => normalizedSystems[id])
        .filter(s => s && s.normalizedPosition);
      
      if (regionSystems.length === 0) return;
      
      // Calculate centroid and bounds
      let sumX = 0, sumY = 0, sumZ = 0;
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      
      regionSystems.forEach(system => {
        const pos = system.normalizedPosition;
        sumX += pos.x;
        sumY += pos.y;
        sumZ += pos.z;
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
        minZ = Math.min(minZ, pos.z);
        maxZ = Math.max(maxZ, pos.z);
      });
      
      const centroid = {
        x: sumX / regionSystems.length,
        y: sumY / regionSystems.length,
        z: sumZ / regionSystems.length
      };
      
      const bounds = {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        size: {
          x: maxX - minX,
          y: maxY - minY,
          z: maxZ - minZ
        }
      };
      
      // Get region name from rawRegions or use default
      const regionData = rawRegions?.[regionId] || {};
      
      const region = {
        region_id: regionId,
        name: regionData.name || `Region ${regionId}`,
        normalizedPosition: centroid,
        bounds: bounds,
        systemIds: systemIds,
        systemCount: systemIds.length
      };
      
      regions.set(regionId, region);
      regionPositions.push({ regionId, position: centroid, bounds });
    });
    
    // Apply scaling to spread regions to fill viewport while preserving relative positions
    // This maintains their in-game spatial relationships while ensuring they fill the space
    this._scaleRegionsToFillViewport(regions, regionPositions);
    
    return regions;
  }
  
  /**
   * Check if a region should be filtered out (VR, wormhole, or ADR regions)
   * @param {number} regionId - The region ID
   * @param {Object} rawRegions - Raw region data
   * @returns {boolean} - True if region should be filtered out
   */
  _shouldFilterRegion(regionId, rawRegions) {
    // Filter out VR (Victory Road) regions - IDs starting with 14000000
    if (regionId >= 14000000 && regionId < 15000000) {
      return true;
    }
    
    // Filter out wormhole regions - IDs starting with 11000000
    // These are J-space (wormhole space) regions
    if (regionId >= 11000000 && regionId < 12000000) {
      return true;
    }
    
    // Filter out ADR (Abyssal Deadspace) regions - IDs starting with 12000000
    // These are ADR01-ADR05 regions
    if (regionId >= 12000000 && regionId < 13000000) {
      return true;
    }
    
    // Also filter by name pattern as a safety check
    const regionData = rawRegions?.[regionId];
    if (regionData && regionData.name) {
      const name = regionData.name.toUpperCase();
      // Filter VR regions by name pattern
      if (name.startsWith('VR-')) {
        return true;
      }
      // Filter wormhole regions by name pattern (e.g., "D-R00023", "E-R00024")
      // Pattern: single letter, dash, R, numbers
      if (/^[A-Z]-R\d+$/.test(name)) {
        return true;
      }
      // Filter ADR regions by name pattern (e.g., "ADR01", "ADR02")
      if (name.startsWith('ADR')) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Scale regions to fill viewport while preserving their relative in-game positions
   * This maintains spatial relationships while ensuring regions fill the available space
   */
  _scaleRegionsToFillViewport(regions, regionPositions) {
    const regionCount = regionPositions.length;
    if (regionCount === 0) return;
    
    // Calculate bounding box of all region positions
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    regionPositions.forEach(region => {
      const pos = region.position;
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    });
    
    // Calculate current size and center
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    // If all regions are at the same position, use default spacing
    if (sizeX < 0.001 && sizeY < 0.001) {
      // Fallback: use grid layout if regions are all at same position
      const gridSize = Math.ceil(Math.sqrt(regionCount));
      const spacingX = 0.3;
      const spacingY = 0.5; // More vertical spacing
      
      regionPositions.forEach((region, index) => {
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        const offsetX = (gridSize - 1) * spacingX / 2;
        const offsetY = (gridSize - 1) * spacingY / 2;
        
        region.position.x = col * spacingX - offsetX;
        region.position.y = row * spacingY - offsetY;
        region.position.z = 0;
        
        const regionData = regions.get(region.regionId);
        if (regionData) {
          regionData.normalizedPosition = { ...region.position };
        }
      });
      return;
    }
    
    // Target range to fill (approximately [-1.5, 1.5] with some padding)
    // Use different scaling for X and Y to increase vertical spacing
    const targetRangeX = 2.8; // Horizontal range
    const targetRangeY = 3.5; // Increased vertical range for more spacing
    const scaleX = sizeX > 0.001 ? targetRangeX / sizeX : 1;
    const scaleY = sizeY > 0.001 ? targetRangeY / sizeY : 1; // Larger scale for Y = more vertical spacing
    
    // Apply scaling and centering to all regions
    // This preserves relative positions while filling the viewport with more vertical space
    regionPositions.forEach(region => {
      const pos = region.position;
      
      // Translate to origin, scale separately for X and Y, then translate to center
      const translatedX = (pos.x - centerX) * scaleX;
      const translatedY = (pos.y - centerY) * scaleY; // More vertical spacing
      const translatedZ = (pos.z - centerZ) * Math.min(scaleX, scaleY);
      
      region.position.x = translatedX;
      region.position.y = translatedY;
      region.position.z = translatedZ;
      
      // Update region in map
      const regionData = regions.get(region.regionId);
      if (regionData) {
        regionData.normalizedPosition = { ...region.position };
      }
    });
    
    // Apply minimal spacing to prevent overlaps while preserving relative positions
    // This only pushes apart regions that are too close
    this._applyMinimalSpacing(regions, regionPositions);
  }
  
  /**
   * Apply minimal spacing to regions that are too close together
   * Only pushes apart regions that overlap, preserving overall spatial relationships
   * @deprecated - Use _applyFullSpacing instead for better distribution
   */
  _applyMinimalSpacing(regions, regionPositions) {
    const regionCount = regionPositions.length;
    if (regionCount === 0) return;
    
    // Minimum distance between region centers (based on typical region size)
    const minDistance = 0.15; // Regions closer than this will be pushed apart
    const repulsionStrength = 0.05; // Gentle repulsion to avoid overlaps
    const iterations = 30; // Fewer iterations for subtle adjustment
    
    // Apply gentle force-directed spacing only to overlapping regions
    for (let iter = 0; iter < iterations; iter++) {
      regionPositions.forEach((region1, i) => {
        let forceX = 0, forceY = 0, forceZ = 0;
        let hasOverlap = false;
        
        regionPositions.forEach((region2, j) => {
          if (i === j) return;
          
          const dx = region1.position.x - region2.position.x;
          const dy = region1.position.y - region2.position.y;
          const dz = region1.position.z - region2.position.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          // Only apply force if regions are too close
          if (distance < minDistance && distance > 0.001) {
            hasOverlap = true;
            // Gentle repulsion force
            const force = repulsionStrength * (minDistance - distance) / distance;
            forceX += dx * force;
            forceY += dy * force;
            forceZ += dz * force;
          }
        });
        
        // Only move regions that have overlaps
        if (hasOverlap) {
          region1.position.x += forceX;
          region1.position.y += forceY;
          region1.position.z += forceZ;
          
          // Update region in map
          const regionData = regions.get(region1.regionId);
          if (regionData) {
            regionData.normalizedPosition = { ...region1.position };
          }
        }
      });
    }
  }
  
  /**
   * Apply spacing algorithm to regions to prevent overlaps
   * Uses a grid-based layout with force-directed refinement
   * @deprecated - Use _applyMinimalSpacing instead for preserving spatial relationships
   */
  _applyRegionSpacing(regions, regionPositions) {
    const regionCount = regionPositions.length;
    if (regionCount === 0) return;
    
    // Calculate grid dimensions (square grid)
    const gridSize = Math.ceil(Math.sqrt(regionCount));
    const spacing = 1.5; // Large spacing between regions in grid
    
    // First, arrange in a grid layout
    regionPositions.forEach((region, index) => {
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      
      // Center the grid around origin
      const offsetX = (gridSize - 1) * spacing / 2;
      const offsetY = (gridSize - 1) * spacing / 2;
      
      region.position.x = col * spacing - offsetX;
      region.position.y = row * spacing - offsetY;
      region.position.z = 0; // Keep Z at 0 for 2D-like view
      
      // Update region in map
      const regionData = regions.get(region.regionId);
      if (regionData) {
        regionData.normalizedPosition = { ...region.position };
      }
    });
    
    // Then apply force-directed refinement to smooth out the layout
    const iterations = 50;
    const minDistance = 1.2; // Minimum distance (slightly less than grid spacing)
    const repulsionStrength = 0.1; // Strong repulsion
    const damping = 0.8; // Damping factor to prevent oscillation
    
    for (let iter = 0; iter < iterations; iter++) {
      regionPositions.forEach((region1, i) => {
        let forceX = 0, forceY = 0;
        
        regionPositions.forEach((region2, j) => {
          if (i === j) return;
          
          const dx = region1.position.x - region2.position.x;
          const dy = region1.position.y - region2.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < minDistance && distance > 0.01) {
            // Strong repulsion force
            const force = repulsionStrength * (minDistance - distance) / distance;
            forceX += dx * force;
            forceY += dy * force;
          }
        });
        
        // Apply force with damping
        region1.position.x += forceX * damping;
        region1.position.y += forceY * damping;
        
        // Update region in map
        const regionData = regions.get(region1.regionId);
        if (regionData) {
          regionData.normalizedPosition = { ...region1.position };
        }
      });
    }
  }
  
  /**
   * Calculate bounding box of all systems
   */
  _calculateBounds(systems) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    Object.values(systems).forEach(system => {
      const pos = system.position;
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    });
    
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      center: {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        z: (minZ + maxZ) / 2
      },
      size: {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ
      }
    };
  }
  
  /**
   * Normalize coordinates to [-1, 1] range
   * Preserves spatial relationships
   */
  _normalizeCoordinates(systems, bounds) {
    const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    const scale = maxSize / 2; // Scale to [-1, 1]
    const center = bounds.center;
    
    const normalized = {};
    
    Object.entries(systems).forEach(([id, system]) => {
      normalized[id] = {
        ...system,
        normalizedPosition: {
          x: ((system.position.x - center.x) / scale),
          y: ((system.position.y - center.y) / scale),
          z: ((system.position.z - center.z) / scale)
        }
      };
    });
    
    return normalized;
  }
}

