(() => {
  const tabs = [...document.querySelectorAll('.review-tabs [role="tab"]')];
  const clips = {
    'snack-bag': { fixed: ['success', 'failure'], navigation: ['success', 'failure'] },
    'snack-can': { fixed: ['failure'], navigation: ['success', 'failure'] },
    yogurt: { fixed: ['success', 'failure'], navigation: ['success', 'failure'] },
  };
  document.querySelectorAll('[data-coevolution]').forEach(section => {
    const task = section.querySelector('[data-coevolution-task]');
    const cards = [...section.querySelectorAll('[data-coevolution-model]')];
    function loadClip(card) {
      const model = card.dataset.coevolutionModel;
      const outcome = card.querySelector('[data-outcome]').value;
      const video = card.querySelector('video');
      const path = model === 'navigation' && outcome === 'success'
        ? `./static/rebuttal-videos/cross-wam/${task.value}`
        : `./static/rebuttal-videos/co-evolution/${task.value}-${model}-${outcome}`;
      video.pause();
      video.preload = 'none';
      video.src = `${path}.mp4`;
      video.dataset.poster = `${path}.jpg`;
      if (section.getClientRects().length) video.poster = video.dataset.poster;
    }
    function selectTask() {
      // Start with the same outcome on both sides, using only available recordings.
      const defaultOutcome = ['success', 'failure'].find(value =>
        cards.every(card => clips[task.value][card.dataset.coevolutionModel].includes(value)));
      cards.forEach(card => {
        const outcome = card.querySelector('[data-outcome]');
        outcome.replaceChildren(...clips[task.value][card.dataset.coevolutionModel].map(value => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value === 'success' ? 'Success' : 'Failure';
          return option;
        }));
        outcome.value = defaultOutcome;
        outcome.disabled = outcome.options.length === 1;
        loadClip(card);
      });
    }
    task.addEventListener('change', selectTask);
    cards.forEach(card => card.querySelector('[data-outcome]').addEventListener('change', () => loadClip(card)));
    selectTask();
  });

  const groups = [...document.querySelectorAll('[data-video-group]')].map(group => {
    const section = group.closest('section');
    const videos = [...group.querySelectorAll('video')];
    const play = section.querySelector('[data-play-group]');
    const restart = section.querySelector('[data-restart-group]');
    function update() {
      play.textContent = videos.some(video => !video.paused && !video.ended)
        ? group.dataset.pauseLabel : group.dataset.playLabel;
    }
    function pause() { videos.forEach(video => video.pause()); update(); }
    function start(reset = false) {
      videos.forEach(video => {
        if (reset || video.ended) video.currentTime = 0;
        video.play().catch(update);
      });
    }
    play.addEventListener('click', () => {
      if (videos.some(video => !video.paused && !video.ended)) pause();
      else start();
    });
    restart.addEventListener('click', () => start(true));
    videos.forEach(video => {
      for (const event of ['play', 'pause', 'ended', 'error', 'emptied']) video.addEventListener(event, update);
    });
    return { pause };
  });
  function pauseVideos() { groups.forEach(group => group.pause()); }
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
