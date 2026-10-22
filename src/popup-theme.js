// Applies the cached popup theme before first paint; popup.js keeps it in sync with storage.
if (localStorage.getItem('gwh-glass') === '1') document.documentElement.classList.add('glass');
