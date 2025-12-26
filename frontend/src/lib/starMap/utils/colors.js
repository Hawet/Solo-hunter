import * as THREE from 'three';

/**
 * Get color based on security status
 */
export function getSecurityColor(securityStatus) {
  if (securityStatus >= 0.5) {
    return new THREE.Color(0x22c55e); // Green - High sec
  } else if (securityStatus > 0) {
    return new THREE.Color(0xfbbf24); // Yellow - Low sec
  } else {
    return new THREE.Color(0xdc2626); // Red - Null sec
  }
}

/**
 * Get color for active systems (with kills)
 */
export function getActiveColor() {
  return new THREE.Color(0xef4444); // Red
}

/**
 * Get color for inactive systems
 */
export function getInactiveColor() {
  return new THREE.Color(0x666666); // Gray
}

