(() => {
  const recordings = {"snack-bag": {"original": {"individual": ["./static/experiment-videos/individual/snack-bag-original-01.mp4", "./static/experiment-videos/individual/snack-bag-original-02.mp4", "./static/experiment-videos/individual/snack-bag-original-03.mp4", "./static/experiment-videos/individual/snack-bag-original-04.mp4", "./static/experiment-videos/individual/snack-bag-original-05.mp4", "./static/experiment-videos/individual/snack-bag-original-06.mp4", "./static/experiment-videos/individual/snack-bag-original-07.mp4", "./static/experiment-videos/individual/snack-bag-original-08.mp4", "./static/experiment-videos/individual/snack-bag-original-09.mp4", "./static/experiment-videos/individual/snack-bag-original-10.mp4"], "overlap": {"failure": "./static/experiment-videos/co-evolution/snack-bag-fixed-failure.mp4", "success": "./static/experiment-videos/co-evolution/snack-bag-fixed-success.mp4"}, "outcomes": {"success": ["./static/experiment-videos/individual/snack-bag-original-01.mp4", "./static/experiment-videos/individual/snack-bag-original-02.mp4"], "failure": ["./static/experiment-videos/individual/snack-bag-original-03.mp4", "./static/experiment-videos/individual/snack-bag-original-04.mp4", "./static/experiment-videos/individual/snack-bag-original-05.mp4", "./static/experiment-videos/individual/snack-bag-original-06.mp4", "./static/experiment-videos/individual/snack-bag-original-07.mp4", "./static/experiment-videos/individual/snack-bag-original-08.mp4", "./static/experiment-videos/individual/snack-bag-original-09.mp4", "./static/experiment-videos/individual/snack-bag-original-10.mp4"]}}, "fine-tuned": {"individual": ["./static/experiment-videos/individual/snack-bag-fine-tuned-01.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-02.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-03.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-04.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-05.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-06.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-07.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-08.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-09.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-10.mp4"], "overlap": {"failure": "./static/experiment-videos/co-evolution/snack-bag-navigation-failure.mp4", "success": "./static/experiment-videos/cross-wam/snack-bag.mp4"}, "outcomes": {"success": ["./static/experiment-videos/individual/snack-bag-fine-tuned-01.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-02.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-03.mp4"], "failure": ["./static/experiment-videos/individual/snack-bag-fine-tuned-04.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-05.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-06.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-07.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-08.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-09.mp4", "./static/experiment-videos/individual/snack-bag-fine-tuned-10.mp4"]}}}, "snack-can": {"original": {"individual": ["./static/experiment-videos/individual/snack-can-original-01.mp4", "./static/experiment-videos/individual/snack-can-original-02.mp4", "./static/experiment-videos/individual/snack-can-original-03.mp4", "./static/experiment-videos/individual/snack-can-original-04.mp4", "./static/experiment-videos/individual/snack-can-original-05.mp4", "./static/experiment-videos/individual/snack-can-original-06.mp4", "./static/experiment-videos/individual/snack-can-original-07.mp4", "./static/experiment-videos/individual/snack-can-original-08.mp4", "./static/experiment-videos/individual/snack-can-original-09.mp4", "./static/experiment-videos/individual/snack-can-original-10.mp4"], "overlap": {"failure": "./static/experiment-videos/co-evolution/snack-can-fixed-failure.mp4"}, "outcomes": {"success": [], "failure": ["./static/experiment-videos/individual/snack-can-original-01.mp4", "./static/experiment-videos/individual/snack-can-original-02.mp4", "./static/experiment-videos/individual/snack-can-original-03.mp4", "./static/experiment-videos/individual/snack-can-original-04.mp4", "./static/experiment-videos/individual/snack-can-original-05.mp4", "./static/experiment-videos/individual/snack-can-original-06.mp4", "./static/experiment-videos/individual/snack-can-original-07.mp4", "./static/experiment-videos/individual/snack-can-original-08.mp4", "./static/experiment-videos/individual/snack-can-original-09.mp4", "./static/experiment-videos/individual/snack-can-original-10.mp4"]}}, "fine-tuned": {"individual": ["./static/experiment-videos/individual/snack-can-fine-tuned-01.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-02.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-03.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-04.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-05.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-06.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-07.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-08.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-09.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-10.mp4"], "overlap": {"failure": "./static/experiment-videos/co-evolution/snack-can-navigation-failure.mp4", "success": "./static/experiment-videos/cross-wam/snack-can.mp4"}, "outcomes": {"success": ["./static/experiment-videos/individual/snack-can-fine-tuned-01.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-02.mp4"], "failure": ["./static/experiment-videos/individual/snack-can-fine-tuned-03.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-04.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-05.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-06.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-07.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-08.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-09.mp4", "./static/experiment-videos/individual/snack-can-fine-tuned-10.mp4"]}}}, "yogurt": {"original": {"individual": ["./static/experiment-videos/individual/yogurt-original-01.mp4", "./static/experiment-videos/individual/yogurt-original-02.mp4", "./static/experiment-videos/individual/yogurt-original-03.mp4", "./static/experiment-videos/individual/yogurt-original-04.mp4", "./static/experiment-videos/individual/yogurt-original-05.mp4", "./static/experiment-videos/individual/yogurt-original-06.mp4", "./static/experiment-videos/individual/yogurt-original-07.mp4", "./static/experiment-videos/individual/yogurt-original-08.mp4", "./static/experiment-videos/individual/yogurt-original-09.mp4", "./static/experiment-videos/individual/yogurt-original-10.mp4", "./static/experiment-videos/individual/yogurt-original-11.mp4"], "overlap": {"failure": "./static/experiment-videos/co-evolution/yogurt-fixed-failure.mp4", "success": "./static/experiment-videos/co-evolution/yogurt-fixed-success.mp4"}, "outcomes": {"success": ["./static/experiment-videos/individual/yogurt-original-01.mp4", "./static/experiment-videos/individual/yogurt-original-02.mp4", "./static/experiment-videos/individual/yogurt-original-03.mp4"], "failure": ["./static/experiment-videos/individual/yogurt-original-04.mp4", "./static/experiment-videos/individual/yogurt-original-05.mp4", "./static/experiment-videos/individual/yogurt-original-06.mp4", "./static/experiment-videos/individual/yogurt-original-07.mp4", "./static/experiment-videos/individual/yogurt-original-08.mp4", "./static/experiment-videos/individual/yogurt-original-09.mp4", "./static/experiment-videos/individual/yogurt-original-10.mp4", "./static/experiment-videos/individual/yogurt-original-11.mp4"]}}, "fine-tuned": {"individual": ["./static/experiment-videos/individual/yogurt-fine-tuned-01.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-02.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-03.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-04.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-05.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-06.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-07.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-08.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-09.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-10.mp4"], "overlap": {"failure": "./static/experiment-videos/co-evolution/yogurt-navigation-failure.mp4", "success": "./static/experiment-videos/cross-wam/yogurt.mp4"}, "outcomes": {"success": ["./static/experiment-videos/individual/yogurt-fine-tuned-01.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-02.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-03.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-04.mp4"], "failure": ["./static/experiment-videos/individual/yogurt-fine-tuned-05.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-06.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-07.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-08.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-09.mp4", "./static/experiment-videos/individual/yogurt-fine-tuned-10.mp4"]}}}};
  document.querySelectorAll('[data-recordings]').forEach(section => {
    const task=section.querySelector('[data-recording-task]');
    function update(){
      section.querySelectorAll('video').forEach(v=>v.pause());
      section.querySelectorAll('[data-recording-model]').forEach(card=>{
        const entry=recordings[task.value][card.dataset.recordingModel],outcome=card.dataset.recordingOutcome;
        const clips=[];
        if(entry.overlap[outcome]) clips.push([entry.overlap[outcome],'Overlap · Multiple attempts']);
        entry.outcomes[outcome].forEach((url,i)=>clips.push([url,`Individual · Trial ${String(i+1).padStart(2,'0')}`]));
        card.hidden = clips.length === 0;
        card.style.display = clips.length ? '' : 'none';
        const track=card.querySelector('.trial-carousel-track');track.replaceChildren();track.scrollLeft=0;
        if(!clips.length){const p=document.createElement('p');p.textContent='No recording available';track.append(p);}
        clips.forEach(([url,label])=>{
          const item=document.createElement('figure');item.className='trial-carousel-item';
          const caption=document.createElement('figcaption');caption.textContent=label;
          const video=document.createElement('video');video.controls=true;video.muted=true;video.playsInline=true;video.preload='none';video.src=url;video.setAttribute('aria-label',card.querySelector('h3').textContent+' · '+label);
          item.append(caption,video);track.append(item);
        });
        const arrows=[...card.querySelectorAll('[data-trial-arrow]')];
        card.querySelector('.trial-carousel-dots')?.remove();
        const dots=document.createElement('div');dots.className='trial-carousel-dots';dots.setAttribute('aria-label','Video pages');
        const pageCount=Math.ceil(clips.length/3);
        function positions(){const item=track.querySelector('.trial-carousel-item');const step=item?item.getBoundingClientRect().width+20:0;return Array.from({length:pageCount},(_,i)=>Math.min(i*3*step,Math.max(0,track.scrollWidth-track.clientWidth)));}
        function current(){const ps=positions();return ps.reduce((best,p,i)=>Math.abs(p-track.scrollLeft)<Math.abs(ps[best]-track.scrollLeft)?i:best,0);}
        function go(i){track.querySelectorAll('video').forEach(v=>v.pause());track.scrollTo({left:positions()[Math.max(0,Math.min(pageCount-1,i))]||0,behavior:'smooth'});}
        for(let i=0;i<pageCount;i++){const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',`Video page ${i+1}`);dot.onclick=()=>go(i);dots.append(dot);}
        dots.hidden=pageCount<2;card.append(dots);
        function sync(){const index=current();arrows[0].disabled=track.scrollLeft<=1;arrows[1].disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;[...dots.children].forEach((d,i)=>d.setAttribute('aria-current',String(i===index)));const video=track.querySelector('video');if(video){const vr=video.getBoundingClientRect(),tr=track.getBoundingClientRect();arrows.forEach(a=>a.style.top=(vr.top-tr.top+vr.height/2)+'px');}}
        arrows.forEach(button=>button.onclick=()=>go(current()+(button.dataset.trialArrow==='next'?1:-1)));
        track.onscroll=sync;if(card._trialResizeObserver) card._trialResizeObserver.disconnect();card._trialResizeObserver=new ResizeObserver(sync);card._trialResizeObserver.observe(track);requestAnimationFrame(sync);
      });
    }
    task.addEventListener('change',update);update();
  });

  document.querySelectorAll('.real-to-sim-media').forEach(section=>{
    const track=section.querySelector('.trial-carousel-track'),prev=section.querySelector('[data-sim-prev]'),next=section.querySelector('[data-sim-next]');
    const videos=[...track.querySelectorAll('video')],pageCount=Math.ceil(videos.length/3);
    const dots=document.createElement('div');dots.className='trial-carousel-dots';dots.setAttribute('aria-label','Video pages');section.append(dots);
    function positions(){const item=track.querySelector('.trial-carousel-item');return Array.from({length:pageCount},(_,i)=>Math.min(i*3*(item.getBoundingClientRect().width+20),Math.max(0,track.scrollWidth-track.clientWidth)));}
    function current(){const ps=positions();return ps.reduce((best,p,i)=>Math.abs(p-track.scrollLeft)<Math.abs(ps[best]-track.scrollLeft)?i:best,0);}
    function go(i){videos.forEach(v=>v.pause());track.scrollTo({left:positions()[Math.max(0,Math.min(pageCount-1,i))],behavior:'smooth'});}
    for(let i=0;i<pageCount;i++){const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',`Video page ${i+1}`);dot.onclick=()=>go(i);dots.append(dot);}
    const sync=()=>{prev.disabled=track.scrollLeft<=1;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;[...dots.children].forEach((d,i)=>d.setAttribute('aria-current',String(i===current())));const vr=videos[0].getBoundingClientRect(),tr=track.getBoundingClientRect();[prev,next].forEach(a=>a.style.top=(vr.top-tr.top+vr.height/2)+'px');};
    [prev,next].forEach((button,i)=>button.addEventListener('click',()=>go(current()+(i?1:-1))));
    track.addEventListener('scroll',sync);new ResizeObserver(sync).observe(track);videos.forEach(v=>v.addEventListener('loadedmetadata',sync));requestAnimationFrame(sync);
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
})();
