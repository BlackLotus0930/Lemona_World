import type { Session, User } from '@supabase/supabase-js';
import {
  getSession,
  onAuthStateChange,
  signInWithGitHub,
  signInWithGoogle,
  signOut,
} from '../auth/auth';
import { getAuthInitError } from '../lib/supabase';

function createButton(label: string, className = 'btn'): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function getUserLabel(user: User): string {
  const displayName = user.user_metadata?.full_name;
  if (typeof displayName === 'string' && displayName.trim().length > 0) {
    return displayName;
  }
  return user.email ?? 'Signed in';
}

function setPendingState(buttons: HTMLButtonElement[], pending: boolean): void {
  buttons.forEach((button) => {
    button.disabled = pending;
    button.style.opacity = pending ? '0.7' : '1';
    button.style.cursor = pending ? 'wait' : 'pointer';
  });
}

function createSignInModal(
  setError: (message: string | null) => void,
  onClose: () => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'auth-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'auth-modal';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'auth-modal-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', onClose);

  const header = document.createElement('div');
  header.className = 'auth-modal-header';

  const logo = document.createElement('img');
  logo.src = '/assets/logo/lemona_pixel_logo.png';
  logo.alt = '';
  logo.className = 'auth-modal-logo';

  const title = document.createElement('div');
  title.className = 'auth-modal-title';
  title.textContent = 'Welcome to Lemona';

  const subtitle = document.createElement('div');
  subtitle.className = 'auth-modal-subtitle';
  subtitle.textContent = 'Sign in to continue';

  header.append(logo, title, subtitle);

  const body = document.createElement('div');
  body.className = 'auth-modal-body';

  const providers = document.createElement('div');
  providers.className = 'auth-providers';

  const googleBtn = document.createElement('button');
  googleBtn.type = 'button';
  googleBtn.className = 'auth-provider-btn';
  googleBtn.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign in with Google';
  providers.appendChild(googleBtn);

  const githubBtn = document.createElement('button');
  githubBtn.type = 'button';
  githubBtn.className = 'auth-provider-btn';
  const ghImg = document.createElement('img');
  ghImg.src = '/assets/logo/github_logo.png';
  ghImg.alt = '';
  githubBtn.append(ghImg, document.createTextNode(' Sign in with GitHub'));
  providers.appendChild(githubBtn);

  const controls = [googleBtn, githubBtn];

  googleBtn.addEventListener('click', async () => {
    try {
      setError(null);
      setPendingState(controls, true);
      await signInWithGoogle();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign in failed.';
      setError(message);
      setPendingState(controls, false);
    }
  });

  githubBtn.addEventListener('click', async () => {
    try {
      setError(null);
      setPendingState(controls, true);
      await signInWithGitHub();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub sign in failed.';
      setError(message);
      setPendingState(controls, false);
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose();
  });

  body.appendChild(providers);
  modal.append(closeBtn, header, body);
  overlay.appendChild(modal);
  return overlay;
}

function renderSignedOut(
  container: HTMLElement,
  setError: (message: string | null) => void,
): void {
  const signInButton = document.createElement('button');
  signInButton.type = 'button';
  signInButton.className = 'btn-sign-in';
  signInButton.textContent = 'Sign in';

  let modalEl: HTMLElement | null = null;

  const openModal = (): void => {
    if (modalEl) return;
    modalEl = createSignInModal(setError, closeModal);
    document.body.appendChild(modalEl);
    requestAnimationFrame(() => modalEl?.classList.add('open'));
  };

  const closeModal = (): void => {
    modalEl?.classList.remove('open');
    setTimeout(() => {
      modalEl?.remove();
      modalEl = null;
    }, 200);
  };

  signInButton.addEventListener('click', openModal);

  container.append(signInButton);
}

function renderSignedIn(
  container: HTMLElement,
  user: User,
  setError: (message: string | null) => void,
): void {
  const wrap = document.createElement('div');
  wrap.className = 'nav-avatar-wrap';

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'nav-avatar';
  avatar.setAttribute('aria-label', 'Account menu');

  const initial = (getUserLabel(user).charAt(0) || '?').toUpperCase();
  const avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture) as string | undefined;

  const showInitial = (): void => {
    avatar.replaceChildren();
    avatar.textContent = initial;
  };

  if (typeof avatarUrl === 'string' && avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onerror = showInitial;
    avatar.appendChild(img);
  } else {
    avatar.textContent = initial;
  }

  const menu = document.createElement('div');
  menu.className = 'nav-avatar-menu';
  menu.style.display = 'none';
  menu.innerHTML = `
    <button type="button" class="nav-avatar-menu-item" data-action="signout">Sign out</button>
  `;

  const signOutBtn = menu.querySelector('[data-action="signout"]');
  signOutBtn?.addEventListener('click', async () => {
    menu.style.display = 'none';
    try {
      setError(null);
      (signOutBtn as HTMLButtonElement).disabled = true;
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign out failed.';
      setError(message);
      (signOutBtn as HTMLButtonElement).disabled = false;
    }
  });

  avatar.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
  });

  const closeMenu = (): void => { menu.style.display = 'none'; };
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) closeMenu();
  });

  wrap.append(avatar, menu);
  container.append(wrap);
}

export function mountAuthHeader(container: HTMLElement): void {
  const authError = getAuthInitError();

  const stateContainer = document.createElement('div');
  stateContainer.style.display = 'inline-flex';
  stateContainer.style.alignItems = 'center';
  stateContainer.style.gap = '8px';

  const errorText = document.createElement('span');
  errorText.style.fontSize = '12px';
  errorText.style.color = '#c53030';

  const setError = (message: string | null): void => {
    errorText.textContent = message ?? '';
  };

  const render = (session: Session | null): void => {
    stateContainer.replaceChildren();
    setError(authError);

    if (authError) {
      const unavailableButton = createButton('Auth not configured');
      unavailableButton.disabled = true;
      unavailableButton.style.opacity = '0.6';
      stateContainer.append(unavailableButton);
      return;
    }

    if (session?.user) {
      renderSignedIn(stateContainer, session.user, setError);
      return;
    }

    renderSignedOut(stateContainer, setError);
  };

  container.replaceChildren(stateContainer, errorText);

  onAuthStateChange((_event, session) => {
    render(session);
  });

  getSession()
    .then((session) => render(session))
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to initialize auth.';
      setError(message);
      render(null);
    });
}
