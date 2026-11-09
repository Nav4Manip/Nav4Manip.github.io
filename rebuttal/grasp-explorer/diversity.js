// Two analytical views of the same world-space paths. The 3D geometry is never moved.
const NS = 'http://www.w3.org/2000/svg';
let currentView = 'profile';
let lastInput = null;
let progressLines = [], progressDots = [], projectionDots = [];

function svgNode(tag, attributes = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function label(svg, x, y, text, anchor = 'start', extra = {}) {
  svg.append(svgNode('text', { x, y, 'text-anchor': anchor, ...extra }, text));
}

function curve(points) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function frame(svg, left, title, yMax, unit) {
  const box = { left: left + 34, right: left + 244, top: 28, bottom: 132 };
  label(svg, left + 8, 14, title, 'start', { class: 'plot-title' });
  for (let step = 0; step <= 2; step++) {
    const y = box.bottom - (box.bottom - box.top) * step / 2;
    svg.append(svgNode('line', { x1: box.left, x2: box.right, y1: y, y2: y, class: 'plot-grid' }));
    label(svg, box.left - 6, y + 3, `${(yMax * step / 2).toFixed(1)}`, 'end');
  }
  for (const fraction of [0, 0.5, 1]) label(svg, box.left + fraction * (box.right - box.left), 147, `${fraction * 100}%`, 'middle');
  label(svg, box.left, box.top - 6, unit);
  return box;
}

function profile(svg, input) {
  const series = [
    { key: 'maxSeparationM', factor: 100, title: 'Max. path separation', unit: 'cm', color: '#007ac2', minimum: 0.1 },
    { key: 'maxOrientationDeg', factor: 1, title: 'Max. orientation difference', unit: '°', color: '#9b3bba', minimum: 1 },
  ];
  series.forEach((config, index) => {
    const values = input.analysis.profile.map((sample) => sample[config.key] * config.factor);
    const max = Math.max(config.minimum, ...values) * 1.12;
    const box = frame(svg, index * 276, config.title, max, config.unit);
    const project = (progress, value) => [box.left + progress * (box.right - box.left), box.bottom - value / max * (box.bottom - box.top)];
    const points = input.analysis.profile.map((sample, i) => project(sample.progress, values[i]));
    svg.append(svgNode('path', { d: `${curve(points)} L${box.right},${box.bottom} L${box.left},${box.bottom} Z`, fill: config.color, opacity: 0.08 }));
    svg.append(svgNode('path', { d: curve(points), fill: 'none', stroke: config.color, 'stroke-width': 2 }));
    const line = svgNode('line', { y1: box.top, y2: box.bottom, stroke: '#536e80', 'stroke-dasharray': '3 3' });
    const dot = svgNode('circle', { r: 3.5, fill: config.color, stroke: 'white', 'stroke-width': 1.5 });
    svg.append(line, dot);
    progressLines.push({ line, box });
    progressDots.push({ dot, values, project });
    const hit = svgNode('rect', { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, fill: 'transparent', class: 'plot-hit' });
    hit.addEventListener('click', (event) => {
      const rect = svg.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * 552;
      input.onSeek?.(Math.min(1, Math.max(0, (x - box.left) / (box.right - box.left))));
    });
    svg.append(hit);
  });
}

function projection(svg, input) {
  const context = input.showContext ? input.entries : input.selected;
  const paths = context.length ? context : input.selected;
  const origin = input.origin;
  const selectedIds = new Set(input.selected.map((entry) => entry.id));
  [[0, 1, 'Top view XY'], [0, 2, 'Side view XZ']].forEach(([horizontal, vertical, title], index) => {
    const left = index * 276;
    const box = { left: left + 34, right: left + 244, top: 28, bottom: 132 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const entry of paths) for (const pose of entry.path.poses) {
      const x = (pose[horizontal] - origin[horizontal]) * 100;
      const y = (pose[vertical] - origin[vertical]) * 100;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) { minX = minY = -1; maxX = maxY = 1; }
    const scale = Math.min((box.right - box.left) / Math.max(0.2, maxX - minX), (box.bottom - box.top) / Math.max(0.2, maxY - minY)) / 1.16;
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const project = (pose) => [(box.left + box.right) / 2 + ((pose[horizontal] - origin[horizontal]) * 100 - centerX) * scale,
      (box.top + box.bottom) / 2 - ((pose[vertical] - origin[vertical]) * 100 - centerY) * scale];
    label(svg, left + 8, 14, `${title} · cm`, 'start', { class: 'plot-title' });
    for (const fraction of [0, 0.5, 1]) {
      const x = box.left + fraction * (box.right - box.left), y = box.bottom - fraction * (box.bottom - box.top);
      svg.append(svgNode('line', { x1: x, x2: x, y1: box.top, y2: box.bottom, class: 'plot-grid' }));
      svg.append(svgNode('line', { x1: box.left, x2: box.right, y1: y, y2: y, class: 'plot-grid' }));
      label(svg, x, 147, (centerX + (fraction - 0.5) * (box.right - box.left) / scale).toFixed(1), 'middle');
      label(svg, box.left - 6, y + 3, (centerY + (fraction - 0.5) * (box.bottom - box.top) / scale).toFixed(1), 'end');
    }
    label(svg, box.right + 6, 147, 'X'); label(svg, box.left, 23, vertical === 1 ? 'Y' : 'Z');
    const ordered = [...paths.filter((entry) => !selectedIds.has(entry.id)), ...input.selected];
    for (const entry of ordered) {
      const selected = selectedIds.has(entry.id), color = input.colors.get(entry.id) || '#72909f';
      const stride = Math.max(1, Math.ceil(entry.path.poses.length / 180));
      const poses = entry.path.poses.filter((_, i) => i % stride === 0);
      if (poses.at(-1) !== entry.path.poses.at(-1)) poses.push(entry.path.poses.at(-1));
      svg.append(svgNode('path', { d: curve(poses.map(project)), fill: 'none', stroke: color,
        'stroke-width': selected ? 1.8 : 0.8, opacity: selected ? 1 : 0.3 }));
      if (selected) {
        const [sx, sy] = project(poses[0]), [ex, ey] = project(poses.at(-1));
        svg.append(svgNode('rect', { x: sx - 2, y: sy - 2, width: 4, height: 4, fill: 'white', stroke: color }));
        svg.append(svgNode('circle', { cx: ex, cy: ey, r: 2, fill: color }));
        const dot = svgNode('circle', { r: 3.5, fill: color, stroke: 'white', 'stroke-width': 1.4 });
        svg.append(dot); projectionDots.push({ id: entry.id, dot, project });
      }
    }
  });
}

export function updateDiversityProgress(progress, poses = new Map()) {
  if (!lastInput) return;
  lastInput.progress = progress;
  for (const { line, box } of progressLines) {
    const x = box.left + progress * (box.right - box.left);
    line.setAttribute('x1', x); line.setAttribute('x2', x);
  }
  for (const { dot, values, project } of progressDots) {
    const p = progress * (values.length - 1), a = Math.floor(p), b = Math.min(values.length - 1, a + 1);
    const [x, y] = project(progress, values[a] * (1 - (p - a)) + values[b] * (p - a));
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
  }
  for (const { id, dot, project } of projectionDots) {
    const pose = poses.get(id);
    if (!pose) { dot.setAttribute('visibility', 'hidden'); continue; }
    const [x, y] = project(pose);
    dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('visibility', 'visible');
  }
}

export function renderDiversityLens(input) {
  lastInput = input; progressLines = []; progressDots = []; projectionDots = [];
  const host = document.getElementById('lens-chart');
  host.replaceChildren();
  if (input.selected.length < 2) {
    const message = document.createElement('p'); message.className = 'lens-empty';
    message.textContent = input.entries.length ? 'Select at least two recorded paths to compare position and orientation.' : 'No successful paths at this pose; failure records do not create planned paths.';
    document.getElementById('lens-caption').textContent = input.entries.length
      ? 'At least two paths are needed for pairwise metrics.'
      : 'Rejections and failure stages are listed under All attempts.';
    host.append(message); return;
  }
  const svg = svgNode('svg', { viewBox: '0 0 552 156', role: 'img', 'aria-label': currentView === 'profile' ? 'Path separation and orientation over arc-length progress' : 'Recorded path projections in top and side views' });
  const title = svgNode('title', {}, currentView === 'profile' ? 'Maximum pairwise distance and orientation difference at each normalized arc-length sample.' : 'World coordinates relative to the initial bottle center, in centimeters. Each projection uses equal axes.');
  svg.append(title);
  if (currentView === 'profile') profile(svg, input); else projection(svg, input);
  host.append(svg);
  document.getElementById('lens-caption').textContent = currentView === 'profile'
    ? '64 arc-length samples. Click to seek. Orientation is computed at each sample; the metric at right uses the endpoint.'
    : 'Coordinates are relative to the bottle. Open squares mark starts; filled circles mark endpoints.';
  updateDiversityProgress(input.progress);
}

export function setDiversityView(view) {
  currentView = view === 'projection' ? 'projection' : 'profile';
  document.getElementById('lens-profile').setAttribute('aria-pressed', String(currentView === 'profile'));
  document.getElementById('lens-projection').setAttribute('aria-pressed', String(currentView === 'projection'));
  if (lastInput) { renderDiversityLens(lastInput); lastInput.onSeek?.(lastInput.progress); }
}
