// Content overrides and carousels using the original OpenDance / Bulma controls.
document.addEventListener('DOMContentLoaded', function () {
  const config = window.PROJECT_PAGE_CONFIG || {};
  if (config.title) {
    document.title = config.title;
    document.querySelector('[data-title-text]').textContent = config.title;
  }
  if (config.authors) document.querySelector('[data-authors]').textContent = config.authors;
  for (const [key, selector] of [['methodName', '[data-method-name]'], ['navigationModelName', '[data-navigation-name]']]) {
    if (config[key]) document.querySelectorAll(selector).forEach(node => { node.textContent = config[key]; });
  }
  const code = document.querySelector('[data-code-link]');
  if (code) {
    if (config.codeUrl) {
      code.href = config.codeUrl;
      code.removeAttribute('aria-disabled');
      code.querySelector('span:last-child').textContent = 'Code';
    } else code.addEventListener('click', event => event.preventDefault());
  }
  function updateNavigationHeight() {
    const element = document.getElementById('navigation-carousel');
    const slide = element && element.querySelector('.slider-container > .slider-item');
    if (!slide) return;
    const ratios = Array.from(element.querySelectorAll('.demo-media')).map(slot => {
      const [width, height] = slot.style.getPropertyValue('--media-aspect').split('/').map(Number);
      return width > 0 && height > 0 ? width / height : 1;
    });
    // Reserve the template's 10px gutter and two 1px card borders in each column.
    const availableWidth = slide.getBoundingClientRect().width - 12;
    const height = availableWidth / Math.max(...ratios);
    if (height > 0) element.style.setProperty('--navigation-media-height', `${height}px`);
  }

  // Capture metadata from original videos and the copies used for seamless looping.
  document.addEventListener('loadedmetadata', function (event) {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    const slot = video.closest('.demo-media');
    if (slot && video.videoWidth && video.videoHeight) {
      slot.style.setProperty('--media-aspect', `${video.videoWidth} / ${video.videoHeight}`);
      if (slot.closest('#navigation-carousel')) updateNavigationHeight();
    }
  }, true);

  document.querySelectorAll('[data-media-slot]').forEach(slot => {
    const entry = (config.media || {})[slot.dataset.mediaSlot];
    if (slot.classList.contains('demo-media') && entry && entry.width > 0 && entry.height > 0) {
      slot.style.setProperty('--media-aspect', `${entry.width} / ${entry.height}`);
    }
    if (!entry || !entry.src) return;
    const video = document.createElement('video');
    video.controls = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.style.width = '100%';
    video.style.height = slot.classList.contains('demo-media') ? '100%' : 'auto';
    video.style.objectFit = 'contain';
    video.style.display = 'block';
    video.setAttribute('aria-label', slot.getAttribute('aria-label').replace(': video placeholder', ''));
    if (entry.poster) video.dataset.poster = entry.poster;
    video.src = entry.src;
    slot.replaceChildren(video);
  });

  function initializeDemoCarousel(element) {
    if (element.dataset.carouselReady) return;
    element.dataset.carouselReady = 'true';
    const grouped = element.dataset.demoCarousel === 'comparison';
    const grasping = element.dataset.demoCarousel === 'grasping';
    const visibleCount = Number(element.dataset.slidesToShow) || 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Bulma treats data attributes as strings; clone counts must stay numeric.
    element.removeAttribute('data-slides-to-show');
    const carousel = bulmaCarousel.attach(element, {
      slidesToShow: visibleCount,
      slidesToScroll: 1,
      loop: false,
      infinite: true,
      autoplay: false,
      navigation: true,
      navigationKeys: false,
      navigationSwipe: true,
      pagination: true,
      breakpoints: element.dataset.demoCarousel === 'grasping' ? [
        { changePoint: 600, slidesToShow: 3, slidesToScroll: 1 },
        { changePoint: 900, slidesToShow: 3, slidesToScroll: 1 }
      ] : grouped ? [] : [
        { changePoint: 600, slidesToShow: 2, slidesToScroll: 1 },
        { changePoint: 900, slidesToShow: 3, slidesToScroll: 1 }
      ]
    })[0];
    element.dataset.slidesToShow = visibleCount;
    const track = element.querySelector('.slider-container');

    function updateComparisonLayout(index) {
      if (!grouped && !grasping) return;
      const slide = Array.from(track.children).find(node => Number(node.dataset.sliderIndex) === Number(index));
      const panel = slide && (grouped ? slide.querySelector('[data-comparison-group]') : slide);
      const media = panel && panel.querySelector('.demo-media');
      if (!panel || !media) return;
      const bounds = media.getBoundingClientRect();
      const sliderBounds = element.querySelector('.slider').getBoundingClientRect();
      if (grouped) element.style.setProperty('--comparison-panel-height', `${Math.ceil(panel.getBoundingClientRect().height)}px`);
      element.style.setProperty('--comparison-video-middle', `${bounds.top - sliderBounds.top + bounds.height / 2}px`);
    }

    if ((grouped || grasping) && window.ResizeObserver) {
      const observer = new ResizeObserver(() => updateComparisonLayout(carousel.state.next));
      track.querySelectorAll('[data-comparison-group]').forEach(panel => observer.observe(panel));
    }

    // The initial buffer covers both ends at every supported screen width.
    // Avoid the bundled version's repeated cloning on resize.
    carousel._infinite.init = () => carousel._infinite;

    function moveBy(step) {
      if (carousel.transitioner.isAnimating()) return;
      // Pagination stores string indices; keep the next step numeric.
      carousel.state.next = Number(carousel.state.index) + step;
      carousel.show();
    }
    carousel.next = () => moveBy(1);
    carousel.previous = () => moveBy(-1);

    function updateVisibleSlides(index) {
      const first = Number(index);
      const last = first + Number(carousel.slidesToShow);
      const previousVideos = new Map();
      track.querySelectorAll('.slider-item[aria-hidden="false"] video').forEach(video => {
        previousVideos.set(video.parentElement.dataset.mediaSlot, video);
      });
      const continuingVideos = [];
      Array.from(track.children).forEach(slide => {
        const position = Number(slide.dataset.sliderIndex);
        const visible = position >= first && position < last;
        slide.inert = !visible;
        slide.setAttribute('aria-hidden', String(!visible));
        if (visible) slide.querySelectorAll('video').forEach(video => {
          const previous = previousVideos.get(video.parentElement.dataset.mediaSlot);
          if (previous && previous !== video) {
            // Preserve the frame and playback when the invisible buffer resets.
            video.currentTime = previous.currentTime;
            video.muted = previous.muted;
            video.volume = previous.volume;
            video.playbackRate = previous.playbackRate;
            if (!previous.paused) continuingVideos.push(video);
          }
        });
      });
      track.querySelectorAll('.slider-item[aria-hidden="true"] video').forEach(video => video.pause());
      continuingVideos.forEach(video => video.play().catch(() => {}));
      updateComparisonLayout(index);
    }

    function labelControls() {
      const controls = [
        ['.slider-navigation-previous', grouped ? 'Previous comparison group' : 'Previous videos'],
        ['.slider-navigation-next', grouped ? 'Next comparison group' : 'Next videos']
      ];
      controls.forEach(([selector, label]) => {
        const control = element.querySelector(selector);
        control.setAttribute('role', 'button');
        control.setAttribute('aria-label', label);
        control.tabIndex = 0;
      });
      element.querySelectorAll('.slider-page').forEach((page, index) => {
        page.setAttribute('role', 'button');
        page.setAttribute('aria-label', grouped ? `Show comparison group ${index + 1}` : `Show videos starting at ${index + 1}`);
        page.tabIndex = 0;
        const active = (Number(carousel.state.next) + carousel.state.length) % carousel.state.length;
        page.classList.toggle('is-active', Number(page.dataset.index) === active);
        page.setAttribute('aria-current', page.classList.contains('is-active') ? 'true' : 'false');
      });
    }

    element.addEventListener('keydown', function (event) {
      if (event.target.closest('video, input, textarea, select')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        if (event.key === 'ArrowRight') carousel.next();
        else carousel.previous();
      } else if ((event.key === 'Enter' || event.key === ' ') &&
        event.target.matches('.slider-navigation-next, .slider-navigation-previous, .slider-page')) {
        event.preventDefault();
        event.target.click();
      }
    });

    const resetBuffer = carousel._infinite.onTransitionEnd.bind(carousel._infinite);
    carousel._infinite.onTransitionEnd = function (event) {
      resetBuffer(event);
      updateVisibleSlides(carousel.state.next);
      labelControls();
    };
    carousel.on('before:show', state => updateVisibleSlides(state.next));
    carousel.on('show', function () {
      // Zero-duration transitions do not emit transitionend.
      if (reducedMotion.matches) {
        carousel._infinite.onTransitionEnd();
        carousel.transitioner.end();
      }
      labelControls();
    });
    window.addEventListener('resize', function () {
      requestAnimationFrame(function () {
        // The bundled version only measures again when a breakpoint changes.
        carousel._breakpoint.apply();
        if (element.id === 'navigation-carousel') updateNavigationHeight();
        carousel._infinite.onTransitionEnd();
        updateVisibleSlides(carousel.state.index);
        labelControls();
      });
    });
    if (element.id === 'navigation-carousel') updateNavigationHeight();
    updateVisibleSlides(carousel.state.index);
    labelControls();
  }

  document.querySelectorAll('[data-demo-carousel]').forEach(initializeDemoCarousel);
  // Keep below-the-fold videos from competing with the interactive scene.
  if ('IntersectionObserver' in window) {
    const mediaObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const video = entry.target;
        video.preload = 'metadata';
        if (video.dataset.poster) { video.poster = video.dataset.poster; delete video.dataset.poster; }
        mediaObserver.unobserve(video);
      }
    }, { rootMargin: '150px' });
    document.querySelectorAll('video').forEach(video => mediaObserver.observe(video));
  } else {
    document.querySelectorAll('video[data-poster]').forEach(video => { video.poster = video.dataset.poster; });
  }
});
