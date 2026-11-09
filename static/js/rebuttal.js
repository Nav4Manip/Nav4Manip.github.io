(() => {
  const tabs = [...document.querySelectorAll('.review-tabs [role="tab"]')];
  function activate(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step) { event.preventDefault(); activate(tabs[(index + step + tabs.length) % tabs.length], true); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); activate(tabs[event.key === 'Home' ? 0 : tabs.length - 1], true); }
    });
  });
})();
