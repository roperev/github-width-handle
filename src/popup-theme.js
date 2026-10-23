// Applies the cached popup theme and tab before first paint; popup.js keeps them in sync.
if (localStorage.getItem('gwh-glass') === '1') document.documentElement.classList.add('glass');
document.documentElement.dataset.tab = localStorage.getItem('gwh-tab') === 'customize' ? 'customize' : 'looks';
