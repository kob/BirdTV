(function () {
  const STORAGE_KEY = 'birdtv.theme';
  const THEMES = [
    { id: 'auto', label: 'Auto 跟随系统' },
    { id: 'luna', label: 'Luna 深蓝' },
    { id: 'mist', label: 'Mist 雾青' },
    { id: 'graphite', label: 'Graphite 夜幕' }
  ];

  const THEME_IDS = THEMES.map((item) => item.id);
  let mediaQuery = null;

  function getTheme() {
    const saved = String(localStorage.getItem(STORAGE_KEY) || '').trim();
    return THEME_IDS.includes(saved) ? saved : 'luna';
  }

  function resolveAutoTheme() {
    const isDarkPreferred = !!(mediaQuery && mediaQuery.matches);
    return isDarkPreferred ? 'graphite' : 'mist';
  }

  function applyTheme(theme) {
    const selected = THEME_IDS.includes(theme) ? theme : 'luna';
    const activeTheme = selected === 'auto' ? resolveAutoTheme() : selected;
    document.documentElement.setAttribute('data-theme', activeTheme);
    localStorage.setItem(STORAGE_KEY, selected);
    const root = document.getElementById('themeSwitcherRoot');
    if (!root) return;
    const buttons = root.querySelectorAll('[data-theme-option]');
    buttons.forEach((btn) => {
      const isSelected = btn.getAttribute('data-theme-option') === selected;
      btn.classList.toggle('is-selected', isSelected);
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  function createSwitcher() {
    if (document.body.hasAttribute('data-no-theme-switcher')) return;
    if (document.getElementById('themeSwitcherRoot')) return;

    const root = document.createElement('div');
    root.id = 'themeSwitcherRoot';
    root.className = 'theme-switcher';
    root.innerHTML = [
      '<button type="button" class="theme-fab" id="themeFabButton" aria-expanded="false" aria-label="切换主题">',
      '<span aria-hidden="true">◐</span>',
      '</button>',
      '<div class="theme-panel" id="themePanel" aria-hidden="true">',
      '<div class="theme-title">主题</div>',
      ...THEMES.map((item) =>
        `<button type="button" class="theme-option" data-theme-option="${item.id}" aria-pressed="false">${item.label}</button>`
      ),
      '</div>'
    ].join('');

    document.body.appendChild(root);

    const fab = document.getElementById('themeFabButton');
    const panel = document.getElementById('themePanel');
    if (!fab || !panel) return;

    fab.addEventListener('click', () => {
      const isOpen = root.classList.toggle('is-open');
      fab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    });

    root.querySelectorAll('[data-theme-option]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selected = String(btn.getAttribute('data-theme-option') || 'luna');
        applyTheme(selected);
        root.classList.remove('is-open');
        fab.setAttribute('aria-expanded', 'false');
        panel.setAttribute('aria-hidden', 'true');
      });
    });

    document.addEventListener('click', (event) => {
      if (!root.contains(event.target)) {
        root.classList.remove('is-open');
        fab.setAttribute('aria-expanded', 'false');
        panel.setAttribute('aria-hidden', 'true');
      }
    });

    applyTheme(getTheme());
  }

  function setupSystemThemeWatcher() {
    if (!window.matchMedia) return;
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = function () {
      if (getTheme() === 'auto') {
        applyTheme('auto');
      }
    };
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(onChange);
    }
  }

  try {
    if (window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }
    const bootTheme = getTheme();
    document.documentElement.setAttribute('data-theme', bootTheme === 'auto' ? resolveAutoTheme() : bootTheme);
  } catch {}

  setupSystemThemeWatcher();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createSwitcher);
  } else {
    createSwitcher();
  }
})();
