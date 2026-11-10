(() => {
  const tabs = [...document.querySelectorAll('.review-tabs [role="tab"]')];
  const videos = [...document.querySelectorAll('[data-cross-wam-video]')];
  const play = document.getElementById('cross-wam-play');
  const restart = document.getElementById('cross-wam-restart');
  function updatePlayback() {
    const active = videos.some(video => !video.paused && !video.ended);
    if (play) play.textContent = active ? 'Pause all' : 'Play all';
  }
  function pauseVideos() {
    videos.forEach(video => video.pause());
    updatePlayback();
  }
  play?.addEventListener('click', () => {
    if (videos.some(video => !video.paused && !video.ended)) pauseVideos();
    else videos.forEach(video => {
      if (video.ended) video.currentTime = 0;
      video.play().catch(updatePlayback);
    });
  });
  restart?.addEventListener('click', () => {
    videos.forEach(video => {
      video.currentTime = 0;
      video.play().catch(updatePlayback);
    });
  });
  videos.forEach(video => {
    for (const event of ['play', 'pause', 'ended', 'error']) video.addEventListener(event, updatePlayback);
  });
  function activate(tab, focus = false) {
    pauseVideos();
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
