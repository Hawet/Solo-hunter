/**
 * Spatial index for efficient queries
 * Uses simple grid-based partitioning for now
 * Can be upgraded to octree for better performance
 */

import * as THREE from 'three';

export class SpatialIndex {
  constructor(systems) {
    this.systems = systems;
    this.grid = new Map();
    this.gridSize = 0.1; // Cell size in normalized coordinates
    
    this._buildGrid();
  }
  
  /**
   * Build spatial grid
   */
  _buildGrid() {
    this.systems.forEach((system, systemId) => {
      const pos = system.normalizedPosition;
      const cellKey = this._getCellKey(pos.x, pos.y, pos.z);
      
      if (!this.grid.has(cellKey)) {
        this.grid.set(cellKey, []);
      }
      
      this.grid.get(cellKey).push(systemId);
    });
  }
  
  /**
   * Get cell key from position
   */
  _getCellKey(x, y, z) {
    const cellX = Math.floor(x / this.gridSize);
    const cellY = Math.floor(y / this.gridSize);
    const cellZ = Math.floor(z / this.gridSize);
    return `${cellX},${cellY},${cellZ}`;
  }
  
  /**
   * Query systems in frustum
   * @param {THREE.Frustum} frustum
   * @returns {Set} Set of visible system IDs
   */
  queryFrustum(frustum) {
    const visible = new Set();
    
    // For now, simple iteration
    // In production: use grid to only check relevant cells
    this.systems.forEach((system, systemId) => {
      const pos = system.normalizedPosition;
      const point = new THREE.Vector3(pos.x, pos.y, pos.z);
      
      if (frustum.containsPoint(point)) {
        visible.add(systemId);
      }
    });
    
    return visible;
  }
  
  /**
   * Query systems near point
   * @param {THREE.Vector3} point
   * @param {number} radius
   * @returns {Array} Array of { systemId, distance }
   */
  queryRadius(point, radius) {
    const results = [];
    
    this.systems.forEach((system, systemId) => {
      const pos = system.normalizedPosition;
      const systemPoint = new THREE.Vector3(pos.x, pos.y, pos.z);
      const distance = point.distanceTo(systemPoint);
      
      if (distance <= radius) {
        results.push({ systemId, distance });
      }
    });
    
    return results.sort((a, b) => a.distance - b.distance);
  }
}

