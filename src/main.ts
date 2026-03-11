import { Application, Assets } from 'pixi.js';
import { GameView } from './game/GameView';
import { mountAuthHeader } from './ui/AuthHeader';
import { SaveStore } from './game/persistence/saveStore';

function createTestControlButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.style.cssText = `
    height: 26px;
    padding: 0 10px;
    border: 1px solid #7a5a35;
    border-radius: 4px;
    background: #f8e6c4;
    color: #4a2f1b;
    font-size: 11px;
    cursor: pointer;
  `;
  return button;
}

function mountTestControls(
  parent: HTMLElement,
  saveStore: SaveStore,
  gameView: GameView,
): void {
  const row = document.createElement('div');
  row.style.cssText = `
    position: absolute;
    right: 10px;
    bottom: 10px;
    z-index: 1001;
    display: flex;
    align-items: center;
    gap: 6px;
  `;

  const speed1x = createTestControlButton('1x');
  speed1x.addEventListener('click', () => {
    gameView.setTimeScaleForTesting(1);
  });

  const pauseButton = createTestControlButton('Pause');
  const syncPauseButton = () => {
    const paused = gameView.isPausedForTesting();
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseButton.style.opacity = paused ? '0.92' : '1';
  };
  pauseButton.addEventListener('click', () => {
    gameView.togglePauseForTesting();
    syncPauseButton();
  });
  syncPauseButton();

  const speed4x = createTestControlButton('4x');
  speed4x.addEventListener('click', () => {
    gameView.setTimeScaleForTesting(4);
  });

  const speed8x = createTestControlButton('8x');
  speed8x.addEventListener('click', () => {
    gameView.setTimeScaleForTesting(8);
  });

  const button = createTestControlButton('Restart');
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Restarting...';
    try {
      await saveStore.clearAll();
    } catch {
      // Ignore cleanup errors in test-only restart flow.
    }
    window.location.reload();
  });

  row.appendChild(pauseButton);
  row.appendChild(speed1x);
  row.appendChild(speed4x);
  row.appendChild(speed8x);
  row.appendChild(button);
  parent.appendChild(row);
}

async function main() {
  await Assets.load([
    '/assets/map/spritesheet.png',
    '/assets/user_interface/popupemotes.png',
  ]);

  const app = new Application();
  
  const authContainer = document.getElementById('auth-container');
  if (authContainer instanceof HTMLElement) {
    mountAuthHeader(authContainer);
  }

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

  const saveStore = new SaveStore();
  let initialSnapshot = null;
  try {
    initialSnapshot = await saveStore.loadLatestAutosaveWithRollback();
  } catch {
    initialSnapshot = null;
  }

  const gameView = new GameView(app);
  await gameView.start({
    saveStore,
    initialSnapshot,
  });

  const overlayParent = container.parentElement;
  if (overlayParent instanceof HTMLElement) {
    mountTestControls(overlayParent, saveStore, gameView);
  }

  // Handle window resize to keep game properly scaled
  window.addEventListener('resize', () => {
    app.resize();
  });
}

main().catch(console.error);


