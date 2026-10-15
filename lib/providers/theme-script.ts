// path: lib/providers/theme-script.ts
// Inline script that applies the saved theme before first paint (prevents a flash). Render it with the CSP nonce.
export const THEME_STORAGE_KEY = 'kd.theme';
export const CONTRAST_STORAGE_KEY = 'kd.contrast';

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var c=localStorage.getItem('${CONTRAST_STORAGE_KEY}')||'normal';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark');}if(c==='high'){r.setAttribute('data-contrast','high');}r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
