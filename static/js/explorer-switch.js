(() => {
  const frame = document.querySelector('#explorer-shell iframe');
  const buttons = [...document.querySelectorAll('[data-explorer-method]')];
  if (!frame) return;
  let model = 'dexonomy';
  const send = () => frame.contentWindow?.postMessage({type: 'grasp-method', model}, location.origin);
  const show = value => buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.explorerMethod === value)));
  buttons.forEach(button => button.addEventListener('click', () => { model = button.dataset.explorerMethod; show(model); send(); }));
  frame.addEventListener('load', send);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'grasp-ready') send();
  });
  send();
})();
