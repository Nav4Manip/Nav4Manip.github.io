(() => {
  const shell = document.querySelector('#explorer-shell');
  const initial = shell?.querySelector('iframe');
  if (!initial) return;
  const buttons = [...document.querySelectorAll('[data-explorer-method]')];
  const external = document.querySelector('.explorer-heading a');
  const urls = {
    dexonomy: './rebuttal/grasp-explorer-v2/?v=20261112-brief&embed=1',
    wam: './rebuttal/grasp-explorer-compare/?v=20261112-brief&embed=1&method=wam',
  };
  const frames = new Map([['dexonomy', initial]]);
  let selected = 'dexonomy';
  const sync = () => {
    for (const [model, frame] of frames) {
      frame.contentWindow?.postMessage({type: 'grasp-active', active: model === selected}, location.origin);
    }
  };
  initial.addEventListener('load', sync);
  function select(model) {
    if (!urls[model]) return;
    selected = model;
    if (!frames.has(model)) {
      const frame = document.createElement('iframe');
      frame.title = 'WAM with Oracle motion overlay';
      frame.allow = 'fullscreen';
      frame.src = urls[model];
      frame.addEventListener('load', sync);
      frames.set(model, frame);
      shell.append(frame);
    }
    for (const [key, frame] of frames) {
      frame.hidden = key !== model;
      frame.style.display = key === model ? 'block' : 'none';
    }
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.explorerMethod === model)));
    external.href = urls[model].replace('&embed=1', '');
    sync();
  }
  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.explorerMethod)));
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || ![...frames.values()].some(frame => frame.contentWindow === event.source)) return;
    if (event.data?.type === 'grasp-ready') sync();
  });
  document.querySelectorAll("[data-explorer-jump]").forEach(link => link.addEventListener("click", () => select(link.dataset.explorerJump)));
  select(selected);
})();
