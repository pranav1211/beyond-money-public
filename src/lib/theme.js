const THEME_KEY = 'beyond-money-theme'
const DEFAULT_THEME = 'dark'

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || DEFAULT_THEME
}

export function applyTheme(theme) {
  const nextTheme = theme || DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', nextTheme)
  localStorage.setItem(THEME_KEY, nextTheme)
  return nextTheme
}

export function initTheme() {
  return applyTheme(getStoredTheme())
}

export { THEME_KEY }
