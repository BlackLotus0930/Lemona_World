import { Application, Assets } from 'pixi.js';
import { GameView } from './game/GameView';

async function main() {
  await Assets.load([
    '/assets/map/spritesheet.png',
    '/assets/user_interface/popupemotes.png',
  ]);

  const app = new Application();
  
  const container = document.getElementById('game-container');
  if (!container) throw new Error('Game container not found');

  await app.init({
    resizeTo: container,
    backgroundColor: 0x2d4a3e,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    roundPixels: true,
    autoDensity: true,
  });

  container.appendChild(app.canvas);
  app.canvas.style.setProperty('image-rendering', 'pixelated');

  const gameView = new GameView(app);
  await gameView.start();

  // Handle window resize to keep game properly scaled
  window.addEventListener('resize', () => {
    app.resize();
  });
}

main().catch(console.error);
