import { Container } from 'pixi.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../../data/map';

export class Camera {
  private container: Container;
  private minZoom = 0.25;
  private maxZoom = 2;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private cameraStart = { x: 0, y: 0 };
  private viewportWidth: number;
  private viewportHeight: number;

  constructor(container: Container, viewportWidth: number, viewportHeight: number) {
    this.container = container;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.centerOnMap();
  }

  centerOnMap() {
    this.container.x = this.viewportWidth / 2;
    this.container.y = this.viewportHeight / 2;
    this.container.scale.set(1);
    this.clampPosition();
  }

  resize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.clampPosition();
  }

  setZoom(scale: number) {
    this.container.scale.set(Math.max(this.minZoom, Math.min(this.maxZoom, scale)));
    this.clampPosition();
  }

  zoom(delta: number, screenX: number, screenY: number) {
    const prevScale = this.container.scale.x;
    const newScale = Math.max(this.minZoom, Math.min(this.maxZoom, prevScale + delta));
    if (newScale === prevScale) return;

    const worldPos = this.screenToWorld(screenX, screenY);
    this.container.scale.set(newScale);
    const newWorldPos = this.screenToWorld(screenX, screenY);
    this.container.x += (newWorldPos.x - worldPos.x) * newScale;
    this.container.y += (newWorldPos.y - worldPos.y) * newScale;
    this.clampPosition();
  }

  startPan(screenX: number, screenY: number) {
    this.isDragging = true;
    this.dragStart = { x: screenX, y: screenY };
    this.cameraStart = { x: this.container.x, y: this.container.y };
  }

  updatePan(screenX: number, screenY: number) {
    if (!this.isDragging) return;
    this.container.x = this.cameraStart.x + (screenX - this.dragStart.x);
    this.container.y = this.cameraStart.y + (screenY - this.dragStart.y);
    this.clampPosition();
  }

  endPan() {
    this.isDragging = false;
  }

  screenToWorld(screenX: number, screenY: number) {
    const scale = this.container.scale.x;
    return {
      x: (screenX - this.container.x) / scale,
      y: (screenY - this.container.y) / scale,
    };
  }

  private clampPosition() {
    const scale = this.container.scale.x;
    const halfW = (MAP_WIDTH * scale) / 2;
    const halfH = (MAP_HEIGHT * scale) / 2;
    const maxX = this.viewportWidth - halfW;
    const maxY = this.viewportHeight - halfH;
    this.container.x = Math.max(halfW, Math.min(maxX, this.container.x));
    this.container.y = Math.max(halfH, Math.min(maxY, this.container.y));
  }
}
