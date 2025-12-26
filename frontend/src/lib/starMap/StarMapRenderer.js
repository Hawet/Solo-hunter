/**
 * High-performance WebGL renderer for EVE Online star map
 * Uses Three.js for GPU-accelerated rendering
 * 
 * Architecture:
 * - Instanced rendering for nodes (single draw call)
 * - Batched line rendering for edges
 * - View frustum culling
 * - LOD system based on zoom level
 * - Completely isolated from Svelte reactivity
 */

import * as THREE from 'three';
import { SpatialIndex } from './SpatialIndex.js';
import { CameraController } from './CameraController.js';
import { DataPreprocessor } from './DataPreprocessor.js';
import { InputHandler } from './InputHandler.js';
import { getSecurityColor, getActiveColor } from './utils/colors.js';
import { LOD_LEVELS, RENDER_DISTANCE } from './utils/constants.js';

export class StarMapRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      backgroundColor: 0x0a0a0f,
      nodeSize: 0.01,
      edgeOpacity: 0.3,
      ...options
    };
    
    // Core Three.js objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // Rendering objects
    this.nodeMesh = null;
    this.glowMesh = null; // Glow effect for regions
    this.edgeLines = null;
    this.nodeInstances = null;
    this.labelSprites = []; // Array of sprite objects for labels
    
    // Data structures
    this.systems = new Map(); // system_id -> system data
    this.edges = new Map(); // edge_id -> edge data
    this.regions = new Map(); // region_id -> region data
    this.spatialIndex = null;
    this.activeSystemIds = new Set();
    
    // View state
    this.viewMode = 'regions'; // 'regions' or 'systems'
    this.selectedRegionId = null; // Currently selected region (when in system view)
    
    // State
    this.isInitialized = false;
    this.animationFrameId = null;
    this.needsUpdate = false;
    
    // Performance tracking
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    
    // Click detection (will be initialized after Three.js is set up)
    this.raycaster = null;
    this.mouse = new THREE.Vector2();
    this.onRegionClick = null; // Callback for region clicks
  }
  
  /**
   * Initialize the renderer with map data
   * @param {Object} mapData - { systems: {}, stargates: {} }
   */
  async initialize(mapData) {
    if (this.isInitialized) {
      console.warn('Renderer already initialized');
      return;
    }
    
    console.log('Initializing StarMapRenderer...');
    const startTime = performance.now();
    
    // Preprocess data
    const preprocessor = new DataPreprocessor();
    const processed = preprocessor.process(mapData);
    this.systems = processed.systems;
    this.edges = processed.edges;
    this.regions = processed.regions;
    
    // Build spatial index
    this.spatialIndex = new SpatialIndex(this.systems);
    
    // Initialize Three.js
    this._initThreeJS();
    
    // Initialize raycaster for click detection (after Three.js is ready)
    this.raycaster = new THREE.Raycaster();
    
    // Setup camera
    this.cameraController = new CameraController(
      this.camera,
      this.renderer.domElement,
      processed.bounds
    );
    
    // Setup input handling
    this.inputHandler = new InputHandler(this.cameraController);
    
    // Create rendering objects (start with region view)
    this._createNodes();
    this._createEdges();
    
    // Setup click detection
    this._setupClickDetection();
    
    // Reset camera to show all regions (after a small delay to ensure regions are positioned)
    setTimeout(() => {
      this._resetCamera();
    }, 100);
    
    // Expose for external access
    this.fps = 60;
    
    // Start render loop
    this._startRenderLoop();
    
    this.isInitialized = true;
    const initTime = performance.now() - startTime;
    console.log(`Renderer initialized in ${initTime.toFixed(2)}ms`);
  }
  
  /**
   * Initialize Three.js scene, camera, renderer
   */
  _initThreeJS() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);
    
    // Camera - Orthographic for top-down view
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;
    const viewSize = 2;
    
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect,
      viewSize * aspect,
      viewSize,
      -viewSize,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance
    this.container.appendChild(this.renderer.domElement);
    
    // Handle resize
    window.addEventListener('resize', () => this._onResize());
  }
  
  /**
   * Create node geometry using Points for per-vertex colors
   * Shows regions or systems based on view mode
   */
  _createNodes() {
    // Remove old nodes if they exist
    if (this.nodeMesh) {
      this.scene.remove(this.nodeMesh);
      this.nodeMesh.geometry.dispose();
      this.nodeMesh.material.dispose();
    }
    
    // Remove old glow mesh if it exists
    if (this.glowMesh) {
      this.scene.remove(this.glowMesh);
      this.glowMesh.geometry.dispose();
      this.glowMesh.material.dispose();
      this.glowMesh = null;
    }
    
    const positions = [];
    const colors = [];
    const nodeIds = []; // Store IDs (region_id or system_id) to map back to original data
    const nodeType = []; // 'region' or 'system'
    
    if (this.viewMode === 'regions') {
      // Show regions with red glow style matching the app
      console.log(`Creating ${this.regions.size} region nodes`);
      this.regions.forEach((region, regionId) => {
        const pos = region.normalizedPosition;
        if (!pos || !isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
          console.warn(`Region ${regionId} has invalid position:`, pos);
          return; // Skip invalid regions
        }
        positions.push(pos.x, pos.y, pos.z);
        
        // Region color - vibrant red with slight orange tint for better visibility
        // Use a brighter, more saturated red that stands out
        const regionColor = new THREE.Color(0xff4444); // Brighter red
        colors.push(regionColor.r, regionColor.g, regionColor.b);
        
        nodeIds.push(regionId);
        nodeType.push('region');
      });
      console.log(`Created ${positions.length / 3} region positions`);
    } else {
      // Show systems in selected region
      const region = this.selectedRegionId ? this.regions.get(this.selectedRegionId) : null;
      const systemIdsToShow = region ? region.systemIds : Array.from(this.systems.keys());
      
      if (region && region.bounds) {
        // Normalize systems within region bounds to use more space
        const bounds = region.bounds;
        const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
        const scale = maxSize > 0 ? 0.8 / maxSize : 1; // Scale to use 80% of viewport
        const centerX = (bounds.min.x + bounds.max.x) / 2;
        const centerY = (bounds.min.y + bounds.max.y) / 2;
        const centerZ = (bounds.min.z + bounds.max.z) / 2;
        
        systemIdsToShow.forEach(systemId => {
          const system = this.systems.get(systemId);
          if (!system) return;
          
          // Normalize position relative to region center and scale
          const originalPos = system.normalizedPosition;
          const normalizedX = (originalPos.x - centerX) * scale;
          const normalizedY = (originalPos.y - centerY) * scale;
          const normalizedZ = (originalPos.z - centerZ) * scale;
          
          positions.push(normalizedX, normalizedY, normalizedZ);
          
          // Color based on security status
          const baseColor = getSecurityColor(system.security_status);
          colors.push(baseColor.r, baseColor.g, baseColor.b);
          
          nodeIds.push(systemId);
          nodeType.push('system');
        });
      } else {
        // Fallback: use original positions
        systemIdsToShow.forEach(systemId => {
          const system = this.systems.get(systemId);
          if (!system) return;
          
          const pos = system.normalizedPosition;
          positions.push(pos.x, pos.y, pos.z);
          
          // Color based on security status
          const baseColor = getSecurityColor(system.security_status);
          colors.push(baseColor.r, baseColor.g, baseColor.b);
          
          nodeIds.push(systemId);
          nodeType.push('system');
        });
      }
    }
    
    if (positions.length === 0) {
      console.warn('No nodes to render');
      return;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    // Size for regions - make them visible but not too large
    // Use a reasonable size that scales well with the actual region positions
    const nodeSize = this.viewMode === 'regions' 
      ? 15.0  // Good size for regions - visible but not overwhelming
      : this.options.nodeSize * 200;
    
    console.log(`Creating nodes with size: ${nodeSize} for viewMode: ${this.viewMode}`);
    
    // Create material with optional custom texture for regions
    const materialOptions = {
      size: nodeSize,
      vertexColors: true,
      transparent: true,
      opacity: this.viewMode === 'regions' ? 0.95 : 0.95,
      sizeAttenuation: false,
      depthWrite: false,
      depthTest: true,
    };
    
    // Add custom texture for regions for better appearance
    if (this.viewMode === 'regions') {
      if (!this.regionPointTexture) {
        this.regionPointTexture = this._createPointTexture();
      }
      materialOptions.map = this.regionPointTexture;
    }
    
    const material = new THREE.PointsMaterial(materialOptions);
    
    console.log('Material settings:', {
      size: nodeSize,
      opacity: material.opacity,
      sizeAttenuation: material.sizeAttenuation,
      depthTest: material.depthTest
    });
    
    // Add glow effect for regions using custom shader-like approach
    if (this.viewMode === 'regions') {
      // Create a second layer with larger size and lower opacity for glow
      const glowGeometry = new THREE.BufferGeometry();
      glowGeometry.setAttribute('position', geometry.attributes.position);
      glowGeometry.setAttribute('color', geometry.attributes.color);
      
      // Create glow texture if not already created
      if (!this.regionGlowTexture) {
        this.regionGlowTexture = this._createGlowTexture();
      }
      
      const glowMaterial = new THREE.PointsMaterial({
        size: nodeSize * 2.5, // Much larger for glow effect
        vertexColors: true,
        transparent: true,
        opacity: 0.4, // Lower opacity for subtle glow
        sizeAttenuation: false, // Disable attenuation for glow too
        depthWrite: false,
        depthTest: false, // Disable depth test for glow
        blending: THREE.AdditiveBlending, // Additive blending for glow
        map: this.regionGlowTexture, // Use custom glow texture
      });
      
      this.glowMesh = new THREE.Points(glowGeometry, glowMaterial);
      this.scene.add(this.glowMesh);
    } else if (this.glowMesh) {
      this.scene.remove(this.glowMesh);
      this.glowMesh.geometry.dispose();
      this.glowMesh.material.dispose();
      this.glowMesh = null;
    }
    
    this.nodeMesh = new THREE.Points(geometry, material);
    this.nodeMesh.visible = true; // Ensure it's visible
    this.scene.add(this.nodeMesh);
    
    console.log(`Added ${positions.length / 3} nodes to scene. Node mesh visible:`, this.nodeMesh.visible);
    
    // Store references for updates and click detection
    this.nodePositions = geometry.attributes.position;
    this.nodeColors = geometry.attributes.color;
    this.nodeIds = nodeIds;
    this.nodeType = nodeType;
    
    // Create labels for regions
    if (this.viewMode === 'regions') {
      this._createRegionLabels();
    } else {
      this._removeLabels();
    }
  }
  
  /**
   * Create text labels for regions
   */
  _createRegionLabels() {
    // Remove existing labels
    this._removeLabels();
    
    this.regions.forEach((region, regionId) => {
      const sprite = this._createTextSprite(region.name);
      const pos = region.normalizedPosition;
      sprite.position.set(pos.x, pos.y, pos.z);
      this.scene.add(sprite);
      this.labelSprites.push(sprite);
    });
  }
  
  /**
   * Create a text sprite from canvas with better readability
   */
  _createTextSprite(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Much larger font for better readability
    const fontSize = 72;
    context.font = `bold ${fontSize}px Arial`;
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    
    // Set canvas size with more padding (power of 2 for better performance)
    const padding = 40;
    canvas.width = Math.max(512, Math.pow(2, Math.ceil(Math.log2(textWidth + padding * 2))));
    canvas.height = Math.max(256, Math.pow(2, Math.ceil(Math.log2(textHeight + padding * 2))));
    
    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw semi-transparent background for better readability
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const bgPadding = 15;
    context.fillRect(
      canvas.width / 2 - textWidth / 2 - bgPadding,
      canvas.height / 2 - textHeight / 2 - bgPadding,
      textWidth + bgPadding * 2,
      textHeight + bgPadding * 2
    );
    
    // Set text style - white with red glow effect
    context.font = `bold ${fontSize}px Arial`;
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#ef4444'; // Red stroke matching app style
    context.lineWidth = 8; // Thicker stroke
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Draw text with outline
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    
    // Draw multiple strokes for glow effect
    for (let i = 0; i < 3; i++) {
      context.strokeText(text, x, y);
    }
    // Draw fill
    context.fillText(text, x, y);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create sprite material
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      depthTest: false, // Always render on top
    });
    
    // Create sprite
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Scale sprite - larger base scale for better visibility
    const baseScale = (textWidth + padding * 2) / canvas.width * 0.8; // Much larger scale
    sprite.scale.set(baseScale, baseScale * 0.3, 1);
    
    return sprite;
  }
  
  /**
   * Remove all labels
   */
  _removeLabels() {
    this.labelSprites.forEach(sprite => {
      this.scene.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    this.labelSprites = [];
  }
  
  /**
   * Create a custom texture for region points (circular with soft edges)
   */
  _createPointTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    // Create a radial gradient for a soft circular point
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  
  /**
   * Create a custom texture for glow effect (larger, softer)
   */
  _createGlowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    // Create a larger, softer radial gradient for glow
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
  
  /**
   * Create edge/line geometry
   * Batched line rendering with per-vertex colors
   * Only shows edges between regions in region view, or between systems in system view
   */
  _createEdges() {
    // Remove old edges if they exist
    if (this.edgeLines) {
      this.scene.remove(this.edgeLines);
      this.edgeLines.geometry.dispose();
      this.edgeLines.material.dispose();
    }
    
    if (this.viewMode === 'regions') {
      // In region view, skip edges (too complex to calculate region-to-region connections)
      return;
    }
    
    // In system view, only show edges for systems in the selected region
    const region = this.selectedRegionId ? this.regions.get(this.selectedRegionId) : null;
    const systemIdsToShow = region ? new Set(region.systemIds) : new Set(this.systems.keys());
    
    // Calculate normalization if in region view
    let normalizeScale = 1;
    let normalizeCenter = { x: 0, y: 0, z: 0 };
    if (region && region.bounds) {
      const bounds = region.bounds;
      const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
      normalizeScale = maxSize > 0 ? 0.8 / maxSize : 1;
      normalizeCenter.x = (bounds.min.x + bounds.max.x) / 2;
      normalizeCenter.y = (bounds.min.y + bounds.max.y) / 2;
      normalizeCenter.z = (bounds.min.z + bounds.max.z) / 2;
    }
    
    const points = [];
    const lineColors = []; // Per-vertex colors for edges
    const tempColor = new THREE.Color();
    
    this.edges.forEach(edge => {
      // Only show edges if both systems are in the selected region
      if (!systemIdsToShow.has(edge.from_system_id) || !systemIdsToShow.has(edge.to_system_id)) {
        return;
      }
      
      const fromSystem = this.systems.get(edge.from_system_id);
      const toSystem = this.systems.get(edge.to_system_id);
      
      if (!fromSystem || !toSystem) return;
      
      // Use normalized positions if in region view
      let fromPos, toPos;
      if (region && region.bounds) {
        const fromOriginal = fromSystem.normalizedPosition;
        const toOriginal = toSystem.normalizedPosition;
        fromPos = {
          x: (fromOriginal.x - normalizeCenter.x) * normalizeScale,
          y: (fromOriginal.y - normalizeCenter.y) * normalizeScale,
          z: (fromOriginal.z - normalizeCenter.z) * normalizeScale
        };
        toPos = {
          x: (toOriginal.x - normalizeCenter.x) * normalizeScale,
          y: (toOriginal.y - normalizeCenter.y) * normalizeScale,
          z: (toOriginal.z - normalizeCenter.z) * normalizeScale
        };
      } else {
        fromPos = fromSystem.normalizedPosition;
        toPos = toSystem.normalizedPosition;
      }
      
      points.push(fromPos.x, fromPos.y, fromPos.z);
      points.push(toPos.x, toPos.y, toPos.z);
      
      // Edge color based on security status of connected systems
      // Use the lower security status (more dangerous) for the edge color
      const minSec = Math.min(fromSystem.security_status || 0, toSystem.security_status || 0);
      const isActive = this.activeSystemIds.has(edge.from_system_id) || 
                       this.activeSystemIds.has(edge.to_system_id);
      
      if (isActive) {
        // Red for active connections
        tempColor.setHex(0xef4444);
      } else if (minSec >= 0.5) {
        // Green for high sec connections
        tempColor.setHex(0x22c55e);
      } else if (minSec > 0) {
        // Yellow for low sec connections
        tempColor.setHex(0xfbbf24);
      } else {
        // Red for null sec connections
        tempColor.setHex(0xdc2626);
      }
      
      // Apply opacity
      tempColor.multiplyScalar(0.6); // Darken for better visibility
      
      // Add color for both vertices of the line segment
      lineColors.push(tempColor.r, tempColor.g, tempColor.b);
      lineColors.push(tempColor.r, tempColor.g, tempColor.b);
    });
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    
    const material = new THREE.LineBasicMaterial({
      vertexColors: true, // Enable per-vertex colors
      transparent: true,
      opacity: this.options.edgeOpacity,
      linewidth: 1, // Note: linewidth > 1 is not supported on all platforms
    });
    
    this.edgeLines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.edgeLines);
    
    // Store reference to color attribute for updates
    this.edgeColors = geometry.attributes.color;
  }
  
  /**
   * Update active systems (called from Svelte)
   * @param {Array} activeSystems - Array of { system_id, kill_count }
   */
  updateActiveSystems(activeSystems) {
    this.activeSystemIds.clear();
    activeSystems.forEach(s => this.activeSystemIds.add(s.system_id));
    
    // Update node colors/sizes for active systems
    this._updateNodeHighlights();
    this._updateEdgeHighlights();
    
    this.needsUpdate = true;
  }
  
  /**
   * Update node highlights for active systems
   */
  _updateNodeHighlights() {
    if (!this.nodeColors || !this.nodeIds) return;
    
    const colors = this.nodeColors.array;
    const activeColor = getActiveColor();
    
    // Update colors based on view mode
    this.nodeIds.forEach((nodeId, index) => {
      if (this.viewMode === 'regions') {
        // Regions don't change color based on activity
        return;
      } else {
        // Systems: update based on activity
        const isActive = this.activeSystemIds.has(nodeId);
        const system = this.systems.get(nodeId);
        
        if (isActive && system) {
          colors[index * 3] = activeColor.r;
          colors[index * 3 + 1] = activeColor.g;
          colors[index * 3 + 2] = activeColor.b;
        } else if (system) {
          const baseColor = getSecurityColor(system.security_status);
          colors[index * 3] = baseColor.r;
          colors[index * 3 + 1] = baseColor.g;
          colors[index * 3 + 2] = baseColor.b;
        }
      }
    });
    
    this.nodeColors.needsUpdate = true;
  }
  
  /**
   * Update edge highlights for active systems
   */
  _updateEdgeHighlights() {
    if (!this.edgeColors) return;
    
    const colors = this.edgeColors.array;
    const tempColor = new THREE.Color();
    let edgeIndex = 0;
    
    this.edges.forEach(edge => {
      const fromSystem = this.systems.get(edge.from_system_id);
      const toSystem = this.systems.get(edge.to_system_id);
      
      if (!fromSystem || !toSystem) {
        edgeIndex += 6; // Skip 2 vertices * 3 color components
        return;
      }
      
      const isActive = this.activeSystemIds.has(edge.from_system_id) || 
                       this.activeSystemIds.has(edge.to_system_id);
      const minSec = Math.min(fromSystem.security_status || 0, toSystem.security_status || 0);
      
      if (isActive) {
        // Red for active connections
        tempColor.setHex(0xef4444);
      } else if (minSec >= 0.5) {
        // Green for high sec connections
        tempColor.setHex(0x22c55e);
      } else if (minSec > 0) {
        // Yellow for low sec connections
        tempColor.setHex(0xfbbf24);
      } else {
        // Red for null sec connections
        tempColor.setHex(0xdc2626);
      }
      
      // Apply opacity
      tempColor.multiplyScalar(0.6);
      
      // Update both vertices of the line segment
      colors[edgeIndex] = tempColor.r;
      colors[edgeIndex + 1] = tempColor.g;
      colors[edgeIndex + 2] = tempColor.b;
      colors[edgeIndex + 3] = tempColor.r;
      colors[edgeIndex + 4] = tempColor.g;
      colors[edgeIndex + 5] = tempColor.b;
      
      edgeIndex += 6; // Move to next edge (2 vertices * 3 components)
    });
    
    this.edgeColors.needsUpdate = true;
  }
  
  /**
   * Main render loop
   */
  _startRenderLoop() {
    const render = (time) => {
      this.animationFrameId = requestAnimationFrame(render);
      
      // Update camera (smooth interpolation)
      this.cameraController.update();
      
      // Update label scales based on zoom (so they stay readable)
      if (this.viewMode === 'regions' && this.labelSprites.length > 0) {
        const zoom = this.camera.zoom;
        // Scale labels to stay readable - larger base scale for better visibility
        const baseScale = 0.8 / Math.max(0.3, zoom); // Much larger and more visible
        this.labelSprites.forEach(sprite => {
          // Maintain aspect ratio
          const aspectRatio = sprite.scale.y / sprite.scale.x;
          sprite.scale.set(baseScale, baseScale * aspectRatio, 1);
        });
      }
      
      // View frustum culling (disabled for now - was causing issues)
      // const visibleNodes = this._cullNodes();
      // const visibleEdges = this._cullEdges();
      
      // LOD selection based on zoom
      const lodLevel = this._getLODLevel();
      
      // Render (always render everything for now)
      this.renderer.render(this.scene, this.camera);
      
      // Debug: Log render info occasionally
      if (this.frameCount % 60 === 0) {
        console.log('Render debug:', {
          sceneChildren: this.scene.children.length,
          cameraPos: { x: this.camera.position.x.toFixed(2), y: this.camera.position.y.toFixed(2), z: this.camera.position.z.toFixed(2) },
          cameraZoom: this.camera.zoom.toFixed(3),
          nodeMeshVisible: this.nodeMesh?.visible,
          rendererSize: { w: this.renderer.domElement.width, h: this.renderer.domElement.height }
        });
      }
      
      // Performance tracking
      this._trackPerformance();
    };
    
    render();
  }
  
  /**
   * View frustum culling
   * Returns visible system IDs
   */
  _cullNodes() {
    if (!this.spatialIndex) return new Set();
    
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse
      )
    );
    
    return this.spatialIndex.queryFrustum(frustum);
  }
  
  /**
   * Cull edges outside viewport
   */
  _cullEdges() {
    // Simple distance-based culling
    // In production: use spatial index
    return new Set(this.edges.keys());
  }
  
  /**
   * Get LOD level based on camera zoom
   */
  _getLODLevel() {
    const zoom = this.camera.zoom;
    
    if (zoom > LOD_LEVELS.HIGH) return 'HIGH';
    if (zoom > LOD_LEVELS.MEDIUM) return 'MEDIUM';
    if (zoom > LOD_LEVELS.LOW) return 'LOW';
    return 'MINIMAL';
  }
  
  /**
   * Handle window resize
   */
  _onResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }
  
  /**
   * Performance tracking
   */
  _trackPerformance() {
    this.frameCount++;
    const now = performance.now();
    
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
      
      if (this.fps < 55) {
        console.warn(`Low FPS: ${this.fps}`);
      }
    }
  }
  
  /**
   * Get current FPS
   */
  getFps() {
    return this.fps;
  }
  
  /**
   * Setup click detection
   */
  _setupClickDetection() {
    this.renderer.domElement.addEventListener('click', (e) => this._onClick(e));
  }
  
  /**
   * Handle click events
   */
  _onClick(event) {
    if (!this.nodeMesh || !this.nodeIds) return;
    
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check intersection with nodes
    const intersects = this.raycaster.intersectObject(this.nodeMesh);
    
    if (intersects.length > 0) {
      const pointIndex = intersects[0].index;
      const nodeId = this.nodeIds[pointIndex];
      const nodeType = this.nodeType[pointIndex];
      
      if (nodeType === 'region' && this.viewMode === 'regions') {
        // Clicked on a region - switch to system view
        this.viewRegion(nodeId);
      }
    }
  }
  
  /**
   * Switch to system view for a specific region
   */
  viewRegion(regionId) {
    if (!this.regions.has(regionId)) {
      console.warn(`Region ${regionId} not found`);
      return;
    }
    
    const region = this.regions.get(regionId);
    this.selectedRegionId = regionId;
    this.viewMode = 'systems';
    
    // Remove region labels
    this._removeLabels();
    
    // Recreate nodes and edges for the selected region
    this._createNodes();
    this._createEdges();
    
    // Animate camera to focus on the region
    this._focusOnRegion(region);
    
    // Notify callback if set
    if (this.onRegionClick) {
      this.onRegionClick(region);
    }
  }
  
  /**
   * Switch back to region view
   */
  viewAllRegions() {
    this.viewMode = 'regions';
    this.selectedRegionId = null;
    
    // Recreate nodes and edges
    this._createNodes();
    this._createEdges();
    
    // Reset camera to show all regions
    this._resetCamera();
  }
  
  /**
   * Focus camera on a specific region
   */
  _focusOnRegion(region) {
    // Use region center (systems are now normalized relative to region)
    const targetPos = new THREE.Vector3(0, 0, 5); // Center at origin since systems are normalized
    
    // Calculate bounds of normalized systems in region
    // Since systems are now normalized to use 80% of viewport, we know the bounds
    const bounds = region.bounds;
    if (!bounds) {
      // Fallback: calculate from systems
      const systemIds = region.systemIds;
      if (systemIds.length === 0) return;
      
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      systemIds.forEach(systemId => {
        const system = this.systems.get(systemId);
        if (!system) return;
        
        const sysPos = system.normalizedPosition;
        minX = Math.min(minX, sysPos.x);
        maxX = Math.max(maxX, sysPos.x);
        minY = Math.min(minY, sysPos.y);
        maxY = Math.max(maxY, sysPos.y);
      });
      
      const sizeX = maxX - minX;
      const sizeY = maxY - minY;
      const maxSize = Math.max(sizeX, sizeY);
      const padding = maxSize * 0.1; // 10% padding
      
      // Center camera
      this.cameraController.targetPosition.set(0, 0, 5);
      
      // Much more zoomed in - systems are normalized to use 80% of space
      // So we want to zoom in enough to see them clearly
      const viewSize = (maxSize + padding) / 2;
      const zoom = Math.max(2.0, Math.min(20, 5 / viewSize)); // Much higher zoom
      this.cameraController.targetZoom = zoom;
      return;
    }
    
    // Use region bounds to calculate zoom
    const maxSize = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    const scale = maxSize > 0 ? 0.8 / maxSize : 1; // Same scale used in _createNodes
    const scaledSize = maxSize * scale; // Size after normalization
    
    // Center camera at origin (systems are normalized around center)
    this.cameraController.targetPosition.set(0, 0, 5);
    
    // Much more zoomed in - zoom to fit the normalized systems with padding
    const padding = scaledSize * 0.15; // 15% padding
    const viewSize = (scaledSize + padding) / 2;
    const zoom = Math.max(3.0, Math.min(25, 6 / viewSize)); // Much higher zoom for better visibility
    this.cameraController.targetZoom = zoom;
  }
  
  /**
   * Reset camera to show all regions
   */
  _resetCamera() {
    // Calculate bounds of all regions
    if (this.regions.size === 0) {
      console.warn('No regions to display');
      return;
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    this.regions.forEach(region => {
      const pos = region.normalizedPosition;
      if (!pos) {
        console.warn('Region missing normalizedPosition:', region);
        return;
      }
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);
    });
    
    // Check if we have valid bounds
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
      console.warn('Invalid region bounds, using default camera position');
      this.cameraController.targetPosition.set(0, 0, 5);
      this.cameraController.targetZoom = 1.0;
      return;
    }
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);
    
    // If maxSize is 0 or very small, regions are all at the same position
    if (maxSize < 0.01) {
      console.warn('All regions at same position, using default view');
      this.cameraController.targetPosition.set(0, 0, 5);
      this.cameraController.targetZoom = 1.0;
      return;
    }
    
    const padding = maxSize * 0.2; // 20% padding
    
    // Center camera - keep z at 5 for orthographic camera
    this.cameraController.targetPosition.set(centerX, centerY, 5);
    this.cameraController.currentPosition.set(centerX, centerY, 5); // Set immediately too
    
    // Calculate zoom to fit all regions with padding
    // For orthographic camera, zoom controls the visible area
    // The camera's base viewSize is 2 (from -1 to +1) at zoom=1
    // At zoom=z, visible area = baseViewSize / z
    // We need: baseViewSize / zoom >= maxSize + padding
    // So: zoom <= baseViewSize / (maxSize + padding)
    
    const baseViewSize = 2.0; // Camera's base view size
    const requiredViewSize = maxSize + padding;
    // Increase default zoom by 3x for better focus on remaining regions
    // Since we filtered out VR, wormhole, and ADR regions, we can zoom in more
    const zoom = Math.max(0.1, Math.min(2.0, (baseViewSize / requiredViewSize) * 3.0));
    
    this.cameraController.targetZoom = zoom;
    this.cameraController.currentZoom = zoom; // Set immediately too
    
    // Also update camera position and zoom immediately (not just target)
    // For orthographic camera, keep z at 5 (doesn't affect view but needed for lookAt)
    this.camera.position.set(centerX, centerY, 5);
    this.camera.zoom = zoom;
    this.camera.lookAt(centerX, centerY, 0); // Look at the center of the regions
    this.camera.updateProjectionMatrix();
    
    // Force camera controller to use these values immediately (skip interpolation)
    this.cameraController.currentPosition.set(centerX, centerY, 5);
    this.cameraController.currentZoom = zoom;
    
    console.log('Camera after update:', {
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      zoom: this.camera.zoom,
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom
    });
    
    // Verify the actual visible area after zoom
    const aspect = this.container.clientWidth / this.container.clientHeight;
    const actualLeft = this.camera.left / zoom;
    const actualRight = this.camera.right / zoom;
    const actualTop = this.camera.top / zoom;
    const actualBottom = this.camera.bottom / zoom;
    
    console.log('Actual visible area after zoom:', {
      left: actualLeft.toFixed(2),
      right: actualRight.toFixed(2),
      top: actualTop.toFixed(2),
      bottom: actualBottom.toFixed(2),
      regionBounds: { minX: minX.toFixed(2), maxX: maxX.toFixed(2), minY: minY.toFixed(2), maxY: maxY.toFixed(2) }
    });
    
    console.log('=== Camera Reset Debug ===');
    console.log('Region bounds:', `X: [${minX.toFixed(2)}, ${maxX.toFixed(2)}]`, `Y: [${minY.toFixed(2)}, ${maxY.toFixed(2)}]`);
    console.log('Center:', `(${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)})`);
    console.log('Size:', `X: ${sizeX.toFixed(2)}, Y: ${sizeY.toFixed(2)}, Max: ${maxSize.toFixed(2)}`);
    console.log('Required view size:', requiredViewSize.toFixed(2));
    console.log('Calculated zoom:', zoom.toFixed(3));
    console.log('Camera position:', `(${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})`);
    console.log('Camera zoom:', this.camera.zoom.toFixed(3));
    console.log('Camera frustum:', {
      left: this.camera.left.toFixed(2),
      right: this.camera.right.toFixed(2),
      top: this.camera.top.toFixed(2),
      bottom: this.camera.bottom.toFixed(2)
    });
    
    // Also log first few region positions for debugging
    // Account for zoom when checking visibility (aspect already declared above)
    const visibleLeft = this.camera.left / zoom;
    const visibleRight = this.camera.right / zoom;
    const visibleTop = this.camera.top / zoom;
    const visibleBottom = this.camera.bottom / zoom;
    
    console.log('First 5 region positions:');
    let count = 0;
    this.regions.forEach((region, regionId) => {
      if (count < 5) {
        const pos = region.normalizedPosition;
        const inViewX = pos.x >= visibleLeft && pos.x <= visibleRight;
        const inViewY = pos.y >= visibleBottom && pos.y <= visibleTop;
        console.log(`  ${region.name}: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}) - In view: ${inViewX && inViewY}`);
        count++;
      }
    });
    console.log('========================');
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container.contains(this.renderer.domElement)) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    
    // Dispose geometries and materials
    if (this.nodeMesh) {
      this.nodeMesh.geometry.dispose();
      this.nodeMesh.material.dispose();
    }
    
    if (this.glowMesh) {
      this.glowMesh.geometry.dispose();
      this.glowMesh.material.dispose();
    }
    
    if (this.edgeLines) {
      this.edgeLines.geometry.dispose();
      this.edgeLines.material.dispose();
    }
    
    // Remove labels
    this._removeLabels();
  }
}

