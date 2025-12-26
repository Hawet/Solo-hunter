/**
 * Constants for star map rendering
 */

// Level of Detail thresholds (camera zoom)
export const LOD_LEVELS = {
  HIGH: 0.5,      // Show all details, labels
  MEDIUM: 0.2,    // Hide labels, reduce edge opacity
  LOW: 0.05,      // Only active systems, minimal edges
  MINIMAL: 0.01   // Only active systems, no edges
};

// Rendering distances
export const RENDER_DISTANCE = {
  NODES: 1000,
  EDGES: 500,
  LABELS: 100
};

// Node sizes
export const NODE_SIZES = {
  DEFAULT: 0.01,
  ACTIVE: 0.02,
  HOVER: 0.015
};

// Edge properties
export const EDGE_OPACITY = {
  DEFAULT: 0.3,
  ACTIVE: 0.8,
  INACTIVE: 0.1
};

// Camera settings
export const CAMERA = {
  MIN_ZOOM: 0.1,  // Increased minimum to prevent black screen
  MAX_ZOOM: 10,
  ZOOM_SPEED: 0.1,
  PAN_SPEED: 0.05
};

// Performance targets
export const PERFORMANCE = {
  TARGET_FPS: 60,
  MAX_FRAME_TIME: 16.67, // ms
  CULLING_DISTANCE: 2.0
};

