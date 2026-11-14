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


  const recordings = {"snack-bag": {"original": {"individual": ["./static/rebuttal-videos/individual/snack-bag-original-01.mp4", "./static/rebuttal-videos/individual/snack-bag-original-02.mp4", "./static/rebuttal-videos/individual/snack-bag-original-03.mp4", "./static/rebuttal-videos/individual/snack-bag-original-04.mp4", "./static/rebuttal-videos/individual/snack-bag-original-05.mp4", "./static/rebuttal-videos/individual/snack-bag-original-06.mp4", "./static/rebuttal-videos/individual/snack-bag-original-07.mp4", "./static/rebuttal-videos/individual/snack-bag-original-08.mp4", "./static/rebuttal-videos/individual/snack-bag-original-09.mp4", "./static/rebuttal-videos/individual/snack-bag-original-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-bag-fixed-failure.mp4", "success": "./static/rebuttal-videos/co-evolution/snack-bag-fixed-success.mp4"}}, "fine-tuned": {"individual": ["./static/rebuttal-videos/individual/snack-bag-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-bag-navigation-failure.mp4", "success": "./static/rebuttal-videos/cross-wam/snack-bag.mp4"}}}, "snack-can": {"original": {"individual": ["./static/rebuttal-videos/individual/snack-can-original-01.mp4", "./static/rebuttal-videos/individual/snack-can-original-02.mp4", "./static/rebuttal-videos/individual/snack-can-original-03.mp4", "./static/rebuttal-videos/individual/snack-can-original-04.mp4", "./static/rebuttal-videos/individual/snack-can-original-05.mp4", "./static/rebuttal-videos/individual/snack-can-original-06.mp4", "./static/rebuttal-videos/individual/snack-can-original-07.mp4", "./static/rebuttal-videos/individual/snack-can-original-08.mp4", "./static/rebuttal-videos/individual/snack-can-original-09.mp4", "./static/rebuttal-videos/individual/snack-can-original-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-can-fixed-failure.mp4"}}, "fine-tuned": {"individual": ["./static/rebuttal-videos/individual/snack-can-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-can-navigation-failure.mp4", "success": "./static/rebuttal-videos/cross-wam/snack-can.mp4"}}}, "yogurt": {"original": {"individual": ["./static/rebuttal-videos/individual/yogurt-original-01.mp4", "./static/rebuttal-videos/individual/yogurt-original-02.mp4", "./static/rebuttal-videos/individual/yogurt-original-03.mp4", "./static/rebuttal-videos/individual/yogurt-original-04.mp4", "./static/rebuttal-videos/individual/yogurt-original-05.mp4", "./static/rebuttal-videos/individual/yogurt-original-06.mp4", "./static/rebuttal-videos/individual/yogurt-original-07.mp4", "./static/rebuttal-videos/individual/yogurt-original-08.mp4", "./static/rebuttal-videos/individual/yogurt-original-09.mp4", "./static/rebuttal-videos/individual/yogurt-original-10.mp4", "./static/rebuttal-videos/individual/yogurt-original-11.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/yogurt-fixed-failure.mp4", "success": "./static/rebuttal-videos/co-evolution/yogurt-fixed-success.mp4"}}, "fine-tuned": {"individual": ["./static/rebuttal-videos/individual/yogurt-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/yogurt-navigation-failure.mp4", "success": "./static/rebuttal-videos/cross-wam/yogurt.mp4"}}}};
  document.querySelectorAll('[data-recordings]').forEach(section => {
    const mode=section.querySelector('[data-recording-mode]'), task=section.querySelector('[data-recording-task]');
    const cards=[...section.querySelectorAll('[data-recording-model]')];
    function load(card) {
      const video=card.querySelector('video'); video.pause();video.removeAttribute('poster');video.removeAttribute('data-poster');
      video.src=card.querySelector('[data-recording-choice]').value;video.preload='metadata';video.load();
    }
    function update() {
      section.querySelector('[data-recording-note]').textContent=mode.value==='individual'
        ? 'Individual trials · One recorded attempt per video. Play both starts both clips together.'
        : 'Overlap · Multiple recorded attempts superimposed. Ghosting is intentional.';
      cards.forEach(card=>{
        const entry=recordings[task.value][card.dataset.recordingModel];
        const values=mode.value==='individual' ? entry.individual.map((url,i)=>[url,`Trial ${String(i+1).padStart(2,'0')}`]) : Object.entries(entry.overlap).map(([result,url])=>[url,result==='success'?'Success':'Failure']);
        const select=card.querySelector('[data-recording-choice]');select.replaceChildren(...values.map(([url,label])=>{const o=document.createElement('option');o.value=url;o.textContent=label;return o;}));load(card);
      });
    }
    cards.forEach(card=>card.querySelector('[data-recording-choice]').addEventListener('change',()=>load(card)));
    mode.addEventListener('change',update);task.addEventListener('change',update);
    // Do not fetch media until this answer is opened or a control is used.
    cards.forEach(card=>{const e=recordings[task.value][card.dataset.recordingModel];const sel=card.querySelector('[data-recording-choice]');e.individual.forEach((url,i)=>{const o=document.createElement('option');o.value=url;o.textContent=`Trial ${String(i+1).padStart(2,'0')}`;sel.append(o);});card.querySelector('video').src=e.individual[0];});
  });


  document.querySelectorAll('[data-task-recording]').forEach(card=>{
    const entry=recordings[card.dataset.taskRecording]['fine-tuned'],select=card.querySelector('[data-task-clip]'),video=card.querySelector('video');
    const options=entry.individual.map((url,i)=>[url,`Individual · Trial ${String(i+1).padStart(2,'0')}`]);
    options.push([entry.overlap.success,'Overlap · Success']);
    options.forEach(([url,label])=>{const o=document.createElement('option');o.value=url;o.textContent=label;select.append(o);});
    function load(){video.pause();video.removeAttribute('poster');video.removeAttribute('data-poster');video.querySelectorAll('source').forEach(x=>x.remove());video.src=select.value;video.load();}
    select.addEventListener('change',load);video.preload='none';load();
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
