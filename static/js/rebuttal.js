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


  const recordings = {"snack-bag": {"original": {"individual": ["./static/rebuttal-videos/individual/snack-bag-original-01.mp4", "./static/rebuttal-videos/individual/snack-bag-original-02.mp4", "./static/rebuttal-videos/individual/snack-bag-original-03.mp4", "./static/rebuttal-videos/individual/snack-bag-original-04.mp4", "./static/rebuttal-videos/individual/snack-bag-original-05.mp4", "./static/rebuttal-videos/individual/snack-bag-original-06.mp4", "./static/rebuttal-videos/individual/snack-bag-original-07.mp4", "./static/rebuttal-videos/individual/snack-bag-original-08.mp4", "./static/rebuttal-videos/individual/snack-bag-original-09.mp4", "./static/rebuttal-videos/individual/snack-bag-original-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-bag-fixed-failure.mp4", "success": "./static/rebuttal-videos/co-evolution/snack-bag-fixed-success.mp4"}, "outcomes": {"success": ["./static/rebuttal-videos/individual/snack-bag-original-01.mp4", "./static/rebuttal-videos/individual/snack-bag-original-02.mp4"], "failure": ["./static/rebuttal-videos/individual/snack-bag-original-03.mp4", "./static/rebuttal-videos/individual/snack-bag-original-04.mp4", "./static/rebuttal-videos/individual/snack-bag-original-05.mp4", "./static/rebuttal-videos/individual/snack-bag-original-06.mp4", "./static/rebuttal-videos/individual/snack-bag-original-07.mp4", "./static/rebuttal-videos/individual/snack-bag-original-08.mp4", "./static/rebuttal-videos/individual/snack-bag-original-09.mp4", "./static/rebuttal-videos/individual/snack-bag-original-10.mp4"]}}, "fine-tuned": {"individual": ["./static/rebuttal-videos/individual/snack-bag-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-bag-navigation-failure.mp4", "success": "./static/rebuttal-videos/cross-wam/snack-bag.mp4"}, "outcomes": {"success": ["./static/rebuttal-videos/individual/snack-bag-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-03.mp4"], "failure": ["./static/rebuttal-videos/individual/snack-bag-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/snack-bag-fine-tuned-10.mp4"]}}}, "snack-can": {"original": {"individual": ["./static/rebuttal-videos/individual/snack-can-original-01.mp4", "./static/rebuttal-videos/individual/snack-can-original-02.mp4", "./static/rebuttal-videos/individual/snack-can-original-03.mp4", "./static/rebuttal-videos/individual/snack-can-original-04.mp4", "./static/rebuttal-videos/individual/snack-can-original-05.mp4", "./static/rebuttal-videos/individual/snack-can-original-06.mp4", "./static/rebuttal-videos/individual/snack-can-original-07.mp4", "./static/rebuttal-videos/individual/snack-can-original-08.mp4", "./static/rebuttal-videos/individual/snack-can-original-09.mp4", "./static/rebuttal-videos/individual/snack-can-original-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-can-fixed-failure.mp4"}, "outcomes": {"success": [], "failure": ["./static/rebuttal-videos/individual/snack-can-original-01.mp4", "./static/rebuttal-videos/individual/snack-can-original-02.mp4", "./static/rebuttal-videos/individual/snack-can-original-03.mp4", "./static/rebuttal-videos/individual/snack-can-original-04.mp4", "./static/rebuttal-videos/individual/snack-can-original-05.mp4", "./static/rebuttal-videos/individual/snack-can-original-06.mp4", "./static/rebuttal-videos/individual/snack-can-original-07.mp4", "./static/rebuttal-videos/individual/snack-can-original-08.mp4", "./static/rebuttal-videos/individual/snack-can-original-09.mp4", "./static/rebuttal-videos/individual/snack-can-original-10.mp4"]}}, "fine-tuned": {"individual": ["./static/rebuttal-videos/individual/snack-can-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/snack-can-navigation-failure.mp4", "success": "./static/rebuttal-videos/cross-wam/snack-can.mp4"}, "outcomes": {"success": ["./static/rebuttal-videos/individual/snack-can-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-02.mp4"], "failure": ["./static/rebuttal-videos/individual/snack-can-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/snack-can-fine-tuned-10.mp4"]}}}, "yogurt": {"original": {"individual": ["./static/rebuttal-videos/individual/yogurt-original-01.mp4", "./static/rebuttal-videos/individual/yogurt-original-02.mp4", "./static/rebuttal-videos/individual/yogurt-original-03.mp4", "./static/rebuttal-videos/individual/yogurt-original-04.mp4", "./static/rebuttal-videos/individual/yogurt-original-05.mp4", "./static/rebuttal-videos/individual/yogurt-original-06.mp4", "./static/rebuttal-videos/individual/yogurt-original-07.mp4", "./static/rebuttal-videos/individual/yogurt-original-08.mp4", "./static/rebuttal-videos/individual/yogurt-original-09.mp4", "./static/rebuttal-videos/individual/yogurt-original-10.mp4", "./static/rebuttal-videos/individual/yogurt-original-11.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/yogurt-fixed-failure.mp4", "success": "./static/rebuttal-videos/co-evolution/yogurt-fixed-success.mp4"}, "outcomes": {"success": ["./static/rebuttal-videos/individual/yogurt-original-01.mp4", "./static/rebuttal-videos/individual/yogurt-original-02.mp4", "./static/rebuttal-videos/individual/yogurt-original-03.mp4"], "failure": ["./static/rebuttal-videos/individual/yogurt-original-04.mp4", "./static/rebuttal-videos/individual/yogurt-original-05.mp4", "./static/rebuttal-videos/individual/yogurt-original-06.mp4", "./static/rebuttal-videos/individual/yogurt-original-07.mp4", "./static/rebuttal-videos/individual/yogurt-original-08.mp4", "./static/rebuttal-videos/individual/yogurt-original-09.mp4", "./static/rebuttal-videos/individual/yogurt-original-10.mp4", "./static/rebuttal-videos/individual/yogurt-original-11.mp4"]}}, "fine-tuned": {"individual": ["./static/rebuttal-videos/individual/yogurt-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-04.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-10.mp4"], "overlap": {"failure": "./static/rebuttal-videos/co-evolution/yogurt-navigation-failure.mp4", "success": "./static/rebuttal-videos/cross-wam/yogurt.mp4"}, "outcomes": {"success": ["./static/rebuttal-videos/individual/yogurt-fine-tuned-01.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-02.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-03.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-04.mp4"], "failure": ["./static/rebuttal-videos/individual/yogurt-fine-tuned-05.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-06.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-07.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-08.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-09.mp4", "./static/rebuttal-videos/individual/yogurt-fine-tuned-10.mp4"]}}}};
  document.querySelectorAll('[data-recordings]').forEach(section => {
    const task=section.querySelector('[data-recording-task]');
    function update(){
      section.querySelectorAll('video').forEach(v=>v.pause());
      section.querySelectorAll('[data-recording-model]').forEach(card=>{
        const entry=recordings[task.value][card.dataset.recordingModel],outcome=card.dataset.recordingOutcome;
        const clips=[];
        if(entry.overlap[outcome]) clips.push([entry.overlap[outcome],'Overlap · Multiple attempts']);
        entry.outcomes[outcome].forEach((url,i)=>clips.push([url,`Individual · Trial ${String(i+1).padStart(2,'0')}`]));
        const track=card.querySelector('.trial-carousel-track');track.replaceChildren();track.scrollLeft=0;
        if(!clips.length){const p=document.createElement('p');p.textContent='No recording available';track.append(p);}
        clips.forEach(([url,label])=>{
          const item=document.createElement('figure');item.className='trial-carousel-item';
          const caption=document.createElement('figcaption');caption.textContent=label;
          const video=document.createElement('video');video.controls=true;video.muted=true;video.playsInline=true;video.preload='none';video.src=url;video.setAttribute('aria-label',card.querySelector('h3').textContent+' · '+label);
          item.append(caption,video);track.append(item);
        });
        const arrows=[...card.querySelectorAll('[data-trial-arrow]')];
        function sync(){arrows[0].disabled=track.scrollLeft<=1;arrows[1].disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;}
        arrows.forEach(button=>button.onclick=()=>{track.querySelectorAll('video').forEach(v=>v.pause());track.scrollBy({left:(button.dataset.trialArrow==='next'?1:-1)*track.clientWidth,behavior:'smooth'});});
        track.onscroll=sync;if(card._trialResizeObserver) card._trialResizeObserver.disconnect();card._trialResizeObserver=new ResizeObserver(sync);card._trialResizeObserver.observe(track);requestAnimationFrame(sync);
      });
    }
    task.addEventListener('change',update);update();
  });

  document.querySelectorAll('[data-task-recording]').forEach(card=>{
    const entry=recordings[card.dataset.taskRecording]['fine-tuned'];
    const clips=[[entry.overlap.success,'Overlap · Multiple attempts'],...entry.outcomes.success.map((url,i)=>[url,`Individual · Trial ${String(i+1).padStart(2,'0')}`])];
    const track=card.querySelector('.trial-carousel-track');
    clips.forEach(([url,label])=>{
      const item=document.createElement('figure');item.className='trial-carousel-item';
      const caption=document.createElement('figcaption');caption.textContent=label;
      const video=document.createElement('video');video.controls=true;video.muted=true;video.playsInline=true;video.preload='none';video.src=url;
      video.setAttribute('aria-label',card.querySelector('h3').textContent+' · '+label);
      item.append(caption,video);track.append(item);
    });
    const arrows=[...card.querySelectorAll('[data-trial-arrow]')];
    const sync=()=>{arrows[0].disabled=track.scrollLeft<=1;arrows[1].disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;};
    arrows.forEach(button=>button.addEventListener('click',()=>{track.querySelectorAll('video').forEach(v=>v.pause());track.scrollBy({left:(button.dataset.trialArrow==='next'?1:-1)*track.clientWidth,behavior:'smooth'});}));
    track.addEventListener('scroll',sync);new ResizeObserver(sync).observe(track);requestAnimationFrame(sync);
  });

  document.querySelectorAll('.real-to-sim-media').forEach(section=>{
    const track=section.querySelector('.trial-carousel-track'),prev=section.querySelector('[data-sim-prev]'),next=section.querySelector('[data-sim-next]');
    const sync=()=>{prev.disabled=track.scrollLeft<=1;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;};
    [prev,next].forEach((button,i)=>button.addEventListener('click',()=>{section.querySelectorAll('video').forEach(v=>v.pause());track.scrollBy({left:(i?1:-1)*track.clientWidth,behavior:'smooth'});}));
    track.addEventListener('scroll',sync);new ResizeObserver(sync).observe(track);
    section.querySelectorAll('video').forEach(video=>{
      let speed=Number(video.dataset.defaultSpeed);const button=video.closest('figure').querySelector('[data-sim-speed]');
      const apply=()=>{video.defaultPlaybackRate=speed/Number(video.dataset.encodedSpeed||1);video.playbackRate=video.defaultPlaybackRate;button.textContent=speed+'×';};
      video.addEventListener('loadedmetadata',apply);button.addEventListener('click',()=>{const rates=[1,2.5,5];speed=rates[(rates.indexOf(speed)+1)%rates.length];apply();});apply();
    });
  });

  const groups = [...document.querySelectorAll('[data-video-group]')].map(group => {
    const section = group.closest('section');
    const videos = {forEach: callback => group.querySelectorAll('video').forEach(callback), some: callback => [...group.querySelectorAll('video')].some(callback)};
    const play = section.querySelector('[data-play-group]');
    const restart = section.querySelector('[data-restart-group]');
    function update() {
      play.textContent = videos.some(video => !video.paused && !video.ended)
        ? group.dataset.pauseLabel : group.dataset.playLabel;
    }
    function pause() { videos.forEach(video => video.pause()); update(); }
    function start(reset = false) {
      videos.forEach(video => {
        const track=video.closest('.trial-carousel-track');
        if(track){const r=video.getBoundingClientRect(),t=track.getBoundingClientRect();if(r.right<=t.left||r.left>=t.right)return;}
        if (video.hidden || (!video.getAttribute('src') && !video.querySelector('source'))) return;
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
    for (const event of ['play','pause','ended','error','emptied']) group.addEventListener(event, update, true);
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
