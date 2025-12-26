/**
 * Input handler wrapper
 * Currently just passes through to CameraController
 * Can be extended for additional input handling
 */

export class InputHandler {
  constructor(cameraController) {
    this.cameraController = cameraController;
  }
  
  // Future: Add keyboard controls, gamepad support, etc.
}

