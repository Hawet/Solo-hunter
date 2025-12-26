/**
 * Smooth camera controller for pan and zoom
 * Handles mouse, touch, and keyboard input
 */

import * as THREE from 'three';
import { CAMERA } from './utils/constants.js';

export class CameraController {
  constructor(camera, domElement, bounds) {
    this.camera = camera;
    this.domElement = domElement;
    this.bounds = bounds;
    
    // Target values (for smooth interpolation)
    this.targetPosition = new THREE.Vector3().copy(camera.position);
    this.targetZoom = camera.zoom;
    
    // Current values
    this.currentPosition = new THREE.Vector3().copy(camera.position);
    this.currentZoom = camera.zoom;
    
    // Pan state
    this.isPanning = false;
    this.hasPanned = false; // Track if we actually moved during pan
    this.panStart = new THREE.Vector2();
    this.panDelta = new THREE.Vector2();
    
    // Zoom state
    this.zoomSpeed = CAMERA.ZOOM_SPEED;
    
    // Smoothing factor (0-1, higher = smoother but slower)
    this.smoothing = 0.1;
    
    this._setupEventListeners();
  }
  
  _setupEventListeners() {
    // Mouse wheel zoom
    this.domElement.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    
    // Mouse drag pan
    this.domElement.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.domElement.addEventListener('mouseup', () => this._onMouseUp());
    this.domElement.addEventListener('mouseleave', () => this._onMouseUp());
    
    // Touch gestures
    this.domElement.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this.domElement.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.domElement.addEventListener('touchend', () => this._onTouchEnd());
  }
  
  _onWheel(e) {
    e.preventDefault();
    
    // Calculate zoom delta more carefully
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1; // Zoom out or in
    const newZoom = this.targetZoom * zoomFactor;
    
    // Clamp zoom before applying
    this.targetZoom = Math.max(CAMERA.MIN_ZOOM, Math.min(CAMERA.MAX_ZOOM, newZoom));
    
    // Only adjust position if zoom actually changed
    if (this.targetZoom !== newZoom) return;
    
    // Zoom towards mouse position
    const rect = this.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    // Adjust target position to zoom towards mouse
    const zoomDelta = this.targetZoom - this.currentZoom;
    this.targetPosition.x -= mouse.x * zoomDelta * 0.1;
    this.targetPosition.y -= mouse.y * zoomDelta * 0.1;
  }
  
  _onMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse button
    
    // Prevent zoom changes on click
    e.preventDefault();
    
    this.isPanning = true;
    this.panStart.set(e.clientX, e.clientY);
    this.panDelta.set(0, 0); // Reset delta
    this.hasPanned = false; // Track if we've actually moved
    this.domElement.style.cursor = 'grabbing';
  }
  
  _onMouseMove(e) {
    if (!this.isPanning) return;
    
    // Prevent any zoom changes during pan
    e.preventDefault();
    
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    // Calculate delta from last mouse position
    const deltaX = currentX - this.panStart.x;
    const deltaY = currentY - this.panStart.y;
    
    // Mark that we've panned if there's any movement
    const movementThreshold = 2; // pixels
    if (Math.abs(deltaX) > movementThreshold || Math.abs(deltaY) > movementThreshold) {
      this.hasPanned = true;
    }
    
    // Only pan if there's actual movement
    if (this.hasPanned) {
      // Convert screen delta to world delta
      this.panDelta.set(deltaX, deltaY);
      const worldDelta = this._screenToWorldDelta(this.panDelta);
      
      // Update target position (subtract because dragging right should move camera right, world left)
      // This moves the camera in the opposite direction of the drag
      this.targetPosition.sub(worldDelta);
      
      // Also update current position immediately for more responsive panning
      // This makes panning feel instant instead of laggy
      this.currentPosition.sub(worldDelta);
      
      // Reset panStart to current position for next frame
      // This way we calculate incremental movement each frame
      this.panStart.set(currentX, currentY);
    }
  }
  
  _onMouseUp(e) {
    // If it was just a click (no panning), don't do anything
    if (this.isPanning && !this.hasPanned) {
      // It was just a click, not a drag - do nothing
      e?.preventDefault();
    }
    
    this.isPanning = false;
    this.hasPanned = false;
    this.domElement.style.cursor = 'grab';
  }
  
  _onTouchStart(e) {
    if (e.touches.length === 1) {
      // Single touch - pan
      this.isPanning = true;
      this.panStart.set(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      // Two touches - pinch zoom
      // Store initial distance
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.touchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }
  
  _onTouchMove(e) {
    e.preventDefault();
    
    if (e.touches.length === 1 && this.isPanning) {
      // Pan
      this.panDelta.set(
        e.touches[0].clientX - this.panStart.x,
        e.touches[0].clientY - this.panStart.y
      );
      
      const worldDelta = this._screenToWorldDelta(this.panDelta);
      this.targetPosition.sub(worldDelta);
      
      this.panStart.set(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (this.touchDistance) {
        const scale = distance / this.touchDistance;
        this.targetZoom *= scale;
        this.targetZoom = Math.max(CAMERA.MIN_ZOOM, Math.min(CAMERA.MAX_ZOOM, this.targetZoom));
        this.touchDistance = distance;
      }
    }
  }
  
  _onTouchEnd() {
    this.isPanning = false;
    this.touchDistance = null;
  }
  
  /**
   * Convert screen space delta to world space delta
   */
  _screenToWorldDelta(screenDelta) {
    // Safety check for valid zoom
    if (!isFinite(this.currentZoom) || this.currentZoom <= 0) {
      console.warn('Invalid zoom in _screenToWorldDelta, using 1.0');
      this.currentZoom = 1.0;
    }
    
    const width = this.domElement.clientWidth;
    const height = this.domElement.clientHeight;
    
    if (width === 0 || height === 0) {
      return new THREE.Vector3(0, 0, 0);
    }
    
    // For orthographic camera, calculate world space from screen space
    // The camera's left/right/top/bottom define the visible world area at zoom=1
    // At current zoom, the visible area is scaled by 1/zoom
    
    // Get the base frustum size (at zoom=1)
    const baseWidth = this.camera.right - this.camera.left;
    const baseHeight = this.camera.top - this.camera.bottom;
    
    // Scale by zoom (higher zoom = smaller visible area)
    const worldWidth = baseWidth / this.currentZoom;
    const worldHeight = baseHeight / this.currentZoom;
    
    // Convert pixel delta to world delta
    // Negative Y because screen Y increases downward, but world Y increases upward
    const worldDeltaX = (screenDelta.x / width) * worldWidth;
    const worldDeltaY = -(screenDelta.y / height) * worldHeight;
    
    return new THREE.Vector3(worldDeltaX, worldDeltaY, 0);
  }
  
  /**
   * Update camera with smooth interpolation
   * Call this every frame
   */
  update() {
    // Smooth position interpolation
    this.currentPosition.lerp(this.targetPosition, this.smoothing);
    
    // Validate position (only reset if truly invalid, not just if it's outside expected range)
    if (!isFinite(this.currentPosition.x) || !isFinite(this.currentPosition.y) || !isFinite(this.currentPosition.z) ||
        isNaN(this.currentPosition.x) || isNaN(this.currentPosition.y) || isNaN(this.currentPosition.z)) {
      console.warn('Invalid camera position detected, resetting', {
        x: this.currentPosition.x,
        y: this.currentPosition.y,
        z: this.currentPosition.z,
        target: { x: this.targetPosition.x, y: this.targetPosition.y, z: this.targetPosition.z }
      });
      // Don't reset to (0,0,5) - that might not be correct
      // Instead, try to recover from targetPosition
      if (isFinite(this.targetPosition.x) && isFinite(this.targetPosition.y) && isFinite(this.targetPosition.z)) {
        this.currentPosition.copy(this.targetPosition);
      } else {
        // Last resort: reset to camera's original position
        this.currentPosition.set(this.camera.position.x || 0, this.camera.position.y || 0, this.camera.position.z || 5);
        this.targetPosition.copy(this.currentPosition);
      }
    }
    
    this.camera.position.copy(this.currentPosition);
    
    // Smooth zoom interpolation with safety checks
    this.currentZoom += (this.targetZoom - this.currentZoom) * this.smoothing;
    
    // Ensure zoom never goes below minimum or above maximum
    this.currentZoom = Math.max(CAMERA.MIN_ZOOM, Math.min(CAMERA.MAX_ZOOM, this.currentZoom));
    this.targetZoom = Math.max(CAMERA.MIN_ZOOM, Math.min(CAMERA.MAX_ZOOM, this.targetZoom));
    
    // Ensure zoom is valid (not NaN or Infinity)
    if (!isFinite(this.currentZoom) || this.currentZoom <= 0) {
      console.warn('Invalid zoom detected, resetting to 1.0');
      this.currentZoom = 1.0;
      this.targetZoom = 1.0;
    }
    
    this.camera.zoom = this.currentZoom;
    this.camera.updateProjectionMatrix();
    
    // Clamp position to bounds (optional)
    // this._clampToBounds();
  }
  
  /**
   * Clamp camera position to data bounds
   */
  _clampToBounds() {
    // Implementation depends on coordinate system
    // For normalized [-1, 1] coordinates:
    const margin = 0.1;
    this.targetPosition.x = Math.max(-1 - margin, Math.min(1 + margin, this.targetPosition.x));
    this.targetPosition.y = Math.max(-1 - margin, Math.min(1 + margin, this.targetPosition.y));
  }
}

