/**
 * 圆环婚礼邀请函 MVP — 自写实现，交互对齐 Cuvii CreativeSpace 作品页
 * （圆形排布 / 拖拽惯性旋转 / 高速拖影 / 点开展开成底栏浏览流 / Esc 关闭）
 * 不拷贝对方源码与素材。Three.js r169。
 */
import * as THREE from './lib/three.module.min.js';

const CARDS = [
  { id: 'c1',  src: 'img/card01.jpg', title: '晨光',   about: '花园里的第一束光。',           w: 900, h: 1350 },
  { id: 'c2',  src: 'img/card02.jpg', title: '誓言',   about: '交换戒指的那一刻。',           w: 900, h: 1350 },
  { id: 'c3',  src: 'img/card03.jpg', title: '捧花',   about: '她手里的白玫瑰。',             w: 900, h: 1350 },
  { id: 'c4',  src: 'img/card04.jpg', title: '并肩',   about: '并肩走过长廊。',               w: 596, h: 900 },
  { id: 'c5',  src: 'img/card05.jpg', title: '回眸',   about: '回头看你的瞬间。',             w: 600, h: 900 },
  { id: 'c6',  src: 'img/card06.jpg', title: '手牵手', about: '十指相扣。',                   w: 600, h: 900 },
  { id: 'c7',  src: 'img/card07.jpg', title: '侧影',   about: '夕阳下的轮廓。',               w: 617, h: 900 },
  { id: 'c8',  src: 'img/card08.jpg', title: '花径',   about: '穿过花径去礼堂。',             w: 900, h: 1200 },
  { id: 'c9',  src: 'img/card09.jpg', title: '举杯',   about: '敬彼此一杯。',                 w: 900, h: 1200 },
  { id: 'c10', src: 'img/card10.jpg', title: '信息',   about: '新郎 & 新娘 · 2027.05.20 · 示例花园（占位）', w: 900, h: 1200, isInfo: true },
];

const TRAIL_COUNT = 6;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- DOM ----
const host = document.getElementById('host');
const canvas = document.getElementById('canvas');
const centre = document.getElementById('centre');
const detail = document.getElementById('detail');
const detailTitle = document.getElementById('detailTitle');
const detailText = document.getElementById('detailText');
const hint = document.getElementById('hint');
const cursorLabel = document.getElementById('cursorLabel');

// ---- perf log ----
window.__perf = { frames: [], marks: [] };
const mark = (n) => __perf.marks.push([n, performance.now()]);

// ---- renderer / scene (screen-pixel world units, FOV 60°) ----
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, depth: false, antialias: devicePixelRatio < 2 });
renderer.setClearColor(0xffffff, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 1, 10000);
const group = new THREE.Group();
scene.add(group);

const geo = new THREE.PlaneGeometry(1, 1);
const loader = new THREE.TextureLoader();

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

// ---- card state ----
const cards = CARDS.map((data, index) => {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe9e9e9, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, opacity: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.index = index;
  group.add(mesh);

  const trail = Array.from({ length: TRAIL_COUNT }, () => {
    const tMat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0,
    });
    const t = new THREE.Mesh(geo, tMat);
    t.renderOrder = -1;
    t.visible = false;
    group.add(t);
    return t;
  });

  const angle = Math.PI / 2 - (index / CARDS.length) * Math.PI * 2;
  return {
    data, index, mesh, material: mat, trail,
    angle, thumbW: 0, thumbH: 0,
    still: null, appear: 0, hover: 0,
  };
});

// morph / spin state
const morph = { grow: 0, expand: 0 };
const spin = { angle: 0, velocity: 0, drift: 0, last: 0, speed: 0 };

// strip (expanded gallery) state
const strip = {
  open: false, x: 0, target: 0, velocity: 0,
  height: 0, length: 0, bottom: 0,
  centres: cards.map(() => 0),
  widths: cards.map(() => 0),
};

let W = 0, H = 0, left = 0, top = 0;
let radius = 340;
let ready = false;
let needDraw = true;
let wasMoving = true;
let expandedCard = null; // card object
let hoverCard = null;
let pointer = null; // active drag
let snapTimer = 0;
let pendingSnap = null;
let expandAnim = null;
let cursorMode = '';
let rafId = 0;
let lastTs = 0;
let autoDone = false;
let disposed = false;

const anims = new Set();
const timeouts = [];

function animate(from, to, opts) {
  const start = performance.now();
  const dur = (opts.duration ?? 0.7) * 1000;
  const delay = (opts.delay ?? 0) * 1000;
  const ease = opts.ease || ((t) => 1 - Math.pow(1 - t, 3));
  let cancelled = false;
  const handle = {
    stop() { cancelled = true; anims.delete(handle); },
    finished: null,
  };
  handle.finished = new Promise((resolve) => {
    const tick = (now) => {
      if (cancelled || disposed) { resolve(); return; }
      const t = now - start - delay;
      if (t < 0) { rafId && requestAnimationFrame(tick); return; }
      const p = Math.min(1, t / dur);
      const v = from + (to - from) * ease(p);
      opts.onUpdate?.(v);
      needDraw = true;
      if (p < 1) requestAnimationFrame(tick);
      else { opts.onComplete?.(); anims.delete(handle); resolve(); }
    };
    requestAnimationFrame(tick);
  });
  anims.add(handle);
  return handle;
}
function stopAnim(a) { if (a) a.stop(); }

// easings roughly matching reference feel
const ease = {
  power3Out: (t) => 1 - Math.pow(1 - t, 3),
  power1Out: (t) => 1 - (1 - t),
  morph: (t) => {
    // smoothstep-ish springy morph
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  grow: (t) => 1 - Math.pow(1 - t, 4),
};

function aspectOf(c) { return c.data.w / c.data.h; }

function rebuildStrip() {
  strip.height = H / 2 - 72 - 16;
  strip.bottom = 16 - H / 2;
  let x = 0;
  cards.forEach((c, i) => {
    const w = strip.height * aspectOf(c);
    strip.widths[i] = w;
    strip.centres[i] = x + w / 2;
    x += w + 8;
  });
  strip.length = x;
}

function euclidMod(n, m) { return ((n % m) + m) % m; }
function wrapStrip(v) { return euclidMod(v + strip.length / 2, strip.length) - strip.length / 2; }
function wrapIndex(a, b) { return euclidMod(a - b + cards.length / 2, cards.length) - cards.length / 2; }
function stripOffset(i) { return wrapStrip(strip.centres[i] - strip.x); }

// soft clamp toward edges (from reference ew)
function softEdge(v) {
  const lim = 0.75 * W;
  const n = Math.abs(v);
  const a = Math.min(n / lim, 1);
  return Math.sign(v) * (a * lim - (1 - 0.42) * lim * (a ** 3 - a ** 4 / 2) + 0.42 * Math.max(n - lim, 0));
}

function projectCard(i, localX, out) {
  const half = strip.widths[i] / 2;
  const L = softEdge(localX - half);
  const R = softEdge(localX + half);
  out.x = (L + R) / 2;
  out.width = R - L;
  out.height = out.width / aspectOf(cards[i]);
}

function nearestIndex(x) {
  return strip.centres.reduce((best, c, i) =>
    Math.abs(wrapStrip(c - x)) < Math.abs(wrapStrip(strip.centres[best] - x)) ? i : best, 0);
}
function snapX(x) {
  const i = nearestIndex(x);
  return x + wrapStrip(strip.centres[i] - x);
}
function nudgeStrip(dir) {
  const t = snapX(strip.target);
  const i = nearestIndex(t);
  const j = euclidMod(i + dir, cards.length);
  strip.target = t + wrapStrip(strip.centres[j] - strip.centres[i]);
}

function frontAngle(c) {
  // angle relative to top (screen up = +Y in our layout after rotation)
  return euclidMod(c.angle + spin.angle - Math.PI / 2 + Math.PI, Math.PI * 2) - Math.PI;
}

function setCursor(mode) {
  if (mode === cursorMode) return;
  cursorMode = mode;
  host.dataset.cursor = mode || 'default';
}

function setLabel(text) {
  if (!text) { cursorLabel.hidden = true; return; }
  cursorLabel.hidden = false;
  cursorLabel.textContent = text;
}

function showDetail(card) {
  if (!card) { detail.hidden = true; return; }
  detail.hidden = false;
  detailTitle.textContent = card.data.title;
  detailText.textContent = card.data.about;
}

function setExpanded(card) {
  if (expandedCard === card) return;
  expandedCard = card;
  if (card) {
    centre.classList.add('is-dim');
    hint.classList.add('is-hide');
    showDetail(card);
  } else {
    centre.classList.remove('is-dim');
    showDetail(null);
  }
}

// ---- load textures ----
let loaded = 0;
const loadStart = performance.now();
cards.forEach((c) => {
  loader.load(c.data.src, (tex) => {
    if (disposed) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    c.still = tex;
    c.material.map = tex;
    c.material.color.set(0xffffff);
    c.material.needsUpdate = true;
    needDraw = true;
    loaded++;
    if (loaded === cards.length) onAllLoaded();
  });
});

function onAllLoaded() {
  mark('loaded');
  const elapsed = performance.now() - loadStart;
  const wait = elapsed < 150 ? 0 : Math.max(400 - elapsed, 0) + 200;
  timeouts.push(setTimeout(() => (REDUCED ? instantReady() : growIn()), wait));
}

function instantReady() {
  cards.forEach((c) => { c.appear = 1; });
  morph.grow = 1;
  needDraw = true;
  finishReady();
}

function growIn() {
  const total = 0.07 * cards.length + 0.7;
  cards.forEach((c, i) => {
    animate(0, 1, {
      duration: 0.7, delay: 0.07 * i, ease: ease.power3Out,
      onUpdate: (v) => { c.appear = v; },
    });
  });
  animate(0, 1, {
    duration: total, ease: ease.grow,
    onUpdate: (v) => { morph.grow = v; },
  });
  animate(0.012, 0.0006, {
    duration: total + 0.8, ease: ease.power3Out,
    onUpdate: (v) => { spin.drift = v; },
  });
  timeouts.push(setTimeout(finishReady, total * 1000 - 300));
}

function finishReady() {
  ready = true;
  window.__app = {
    ready: true,
    get autoDone() { return autoDone; },
    open: (i) => openCard(cards[i % cards.length]),
    close: () => closeStrip(),
  };
  mark('ready');
  if (new URLSearchParams(location.search).has('auto')) runAuto();
}

// ---- expand / close ----
function setExpand(to, onDone) {
  stopAnim(expandAnim);
  expandAnim = null;
  if (REDUCED) { morph.expand = to; needDraw = true; onDone?.(); return; }
  const dur = 1.3 * Math.abs(to - morph.expand);
  expandAnim = animate(morph.expand, to, {
    duration: dur, ease: ease.morph,
    onUpdate: (v) => { morph.expand = v; },
    onComplete: onDone,
  });
}

function openCard(card) {
  if (!ready) return;
  if (strip.open) {
    strip.target = snapX(strip.x + stripOffset(card.index));
    setExpanded(card);
    return;
  }
  if (morph.expand > 0) return; // mid-close animation
  rebuildStrip();
  strip.open = true;
  strip.x = strip.target = strip.centres[card.index];
  strip.velocity = 0;
  setExpanded(card);
  setExpand(1);
}

function closeStrip() {
  if (!strip.open) return;
  strip.open = false;
  clearTimeout(snapTimer);
  pendingSnap = null;
  setExpanded(null);
  setExpand(0, () => {
    if (!strip.open) {
      expandedCard = null;
    }
  });
}

// ---- hit test ----
function hitTest(clientX, clientY) {
  pointerNDC.set(
    ((clientX - left) / W) * 2 - 1,
    -(((clientY - top) / H) * 2) + 1,
  );
  raycaster.setFromCamera(pointerNDC, camera);
  const meshes = cards.filter((c) => c.material.opacity > 0.5).map((c) => c.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  return cards[hits[0].object.userData.index];
}

function nearestOnRing(clientX, clientY) {
  const x = clientX - left - W / 2;
  const y = clientY - top - H / 2;
  if (Math.abs(Math.hypot(x, y) - radius) > 44) return null;
  const want = Math.atan2(-y, x);
  const dist = (c) => Math.abs(euclidMod(c.angle + spin.angle - want + Math.PI, Math.PI * 2) - Math.PI);
  return cards.reduce((a, b) => (dist(b) < dist(a) ? b : a));
}

// ---- layout helpers for expand morph curve ----
const Ztmp = { x: 0, width: 0, height: 0 };
const _tmp = { x: 0, width: 0, height: 0 };
const curve = {
  start: new THREE.Vector3(),
  along: new THREE.Vector3(),
  inward: new THREE.Vector3(),
  curve: 0,
  point: new THREE.Vector3(),
  up: new THREE.Vector3(),
};
const quat = new THREE.Quaternion();
const axisZ = new THREE.Vector3(0, 0, 1);
const pos = new THREE.Vector3();

function evalCurve(dist) {
  const { start, along, inward, point, up } = curve;
  const r = curve.curve;
  if (r < 1e-7) {
    point.copy(start).addScaledVector(along, dist);
    up.copy(inward).negate();
    return;
  }
  const o = r * dist;
  point.copy(start)
    .addScaledVector(along, Math.sin(o) / r)
    .addScaledVector(inward, (1 - Math.cos(o)) / r);
  up.copy(inward).multiplyScalar(-Math.cos(o)).addScaledVector(along, Math.sin(o));
}

function stepStrip(dt) {
  const moving = Math.abs(strip.target - strip.x) > 0.01 || Math.abs(strip.velocity) > 0.01;
  if (moving) {
    const steps = Math.ceil(dt);
    const h = dt / steps / 60;
    for (let i = 0; i < steps; i++) {
      // critically-damped-ish spring (from reference: 121*(target-x) - 22*v)
      strip.velocity += (121 * (strip.target - strip.x) - 22 * strip.velocity) * h;
      strip.x += strip.velocity * h;
    }
    if (Math.abs(strip.target - strip.x) < 0.01 && Math.abs(strip.velocity) < 0.01) {
      strip.x = strip.target;
      strip.velocity = 0;
    }
    const near = cards[nearestIndex(strip.x)];
    if (near !== expandedCard) setExpanded(near);
  }
  return moving;
}

function frame(ts) {
  rafId = requestAnimationFrame(frame);
  const dt = lastTs ? Math.min((ts - lastTs) / (1000 / 60), 3) : 1;
  lastTs = ts;
  if (W === 0) return;

  const t0 = performance.now();
  const closed = 1 - morph.expand;

  // spin inertia
  spin.velocity = THREE.MathUtils.clamp(spin.velocity, -0.3, 0.3);
  if (!pointer) {
    spin.angle += spin.velocity * dt * closed;
    spin.velocity *= Math.pow(0.94, dt);
    if (Math.abs(spin.velocity) < 1e-6) spin.velocity = 0;
  }
  spin.angle += spin.drift * dt * closed;
  group.rotation.z = spin.angle;

  const dAng = spin.angle - spin.last;
  spin.last = spin.angle;
  spin.speed += (Math.abs(dAng) / dt - spin.speed) * (1 - Math.pow(0.85, dt));

  const trailAmt = THREE.MathUtils.smoothstep(spin.speed, 0.025, 0.16) * closed;
  const trailStep = Math.min(6 * spin.speed, 1.2) / 6 * Math.sign(dAng || 1);

  let moving = needDraw || anims.size > 0 || dAng !== 0 || trailAmt > 0;
  needDraw = false;

  if (strip.open && stepStrip(dt)) moving = true;

  // hover lerp
  for (const c of cards) {
    const want = (c === hoverCard && !strip.open) ? 1 : 0;
    if (Math.abs(want - c.hover) < 0.001) { c.hover = want; continue; }
    c.hover += (want - c.hover) * (1 - Math.pow(0.8, dt));
    moving = true;
  }

  const shouldDraw = moving || wasMoving;
  wasMoving = moving;
  if (!shouldDraw) {
    __perf.frames.push([ts, performance.now() - t0]);
    return;
  }

  quat.setFromAxisAngle(axisZ, -spin.angle);
  const cosA = Math.cos(spin.angle);
  const sinA = Math.sin(spin.angle);

  const R = radius * THREE.MathUtils.lerp(0.12, 1, morph.grow);
  const m = morph.expand;
  const focus = expandedCard ? expandedCard.index : 0;

  if (m > 0) {
    const ang = cards[focus].angle + spin.angle;
    // rotate so focus sits at top, then morph toward strip
    const delta = euclidMod(Math.atan2(-Math.cos(ang), Math.sin(ang)) + Math.PI, Math.PI * 2) - Math.PI;
    const damp = delta * (1 - THREE.MathUtils.smoothstep(m, 0, 0.55));
    const a = ang + damp - delta;
    projectCard(focus, stripOffset(focus), Ztmp);
    const blend = THREE.MathUtils.smoothstep(m, 0.15, 1);
    curve.start.set(
      THREE.MathUtils.lerp(Math.cos(a) * R, Ztmp.x, blend),
      THREE.MathUtils.lerp(Math.sin(a) * R, strip.bottom + Ztmp.height / 2, blend),
      0,
    );
    curve.along.set(Math.cos(damp), Math.sin(damp), 0);
    curve.inward.set(Math.sin(damp), -Math.cos(damp), 0);
    curve.curve = Math.pow(1 - m, 2) / R;
  }

  for (const c of cards) {
    const i = c.index;
    pos.set(Math.cos(c.angle) * R, Math.sin(c.angle) * R, 0);
    let scale = THREE.MathUtils.lerp(0.4, 1, c.appear);
    let tw = c.thumbW * scale;
    let th = c.thumbH * scale;
    let opacity = c.appear;

    if (m > 0) {
      const di = wrapIndex(i, focus);
      let dx = wrapStrip(strip.centres[i] - strip.centres[focus]);
      if (di * dx < 0) dx += Math.sign(di) * strip.length;
      projectCard(i, stripOffset(focus) + dx, _tmp);
      const along = THREE.MathUtils.lerp(R * di * (Math.PI * 2 / cards.length), _tmp.x - Ztmp.x, m);
      evalCurve(along);
      tw *= Math.pow(_tmp.width / tw, m);
      th *= Math.pow(_tmp.height / th, m);
      curve.point.addScaledVector(curve.up, (_tmp.height - Ztmp.height) / 2 * m);
      opacity *= (c === expandedCard) ? 1 : 1 - THREE.MathUtils.smoothstep(Math.abs(curve.curve * along), Math.PI, 1.3 * Math.PI);
      // rotate curve point by -spin so world matches group rotation later? reference does:
      // N.set(point.x*p + point.y*c, point.y*p - point.x*c, 0) with p=cos(angle), c=sin(angle)
      pos.set(
        curve.point.x * cosA + curve.point.y * sinA,
        curve.point.y * cosA - curve.point.x * sinA,
        0,
      );
    }

    tw *= 1 + 1.3 * c.hover * (1 - m);
    th *= 1 + 1.3 * c.hover * (1 - m);
    if (!strip.open && m === 0) c.mesh.renderOrder = 5 * (c.hover > 0.05);

    c.mesh.position.copy(pos);
    c.mesh.quaternion.copy(quat);
    c.mesh.scale.set(tw, th, 1);
    c.material.opacity = opacity;
    c.mesh.visible = opacity > 0.001;

    // trails
    c.trail.forEach((t, n) => {
      const op = opacity * trailAmt * 0.6 * (1 - (n + 1) / (TRAIL_COUNT + 1));
      t.visible = op > 0.001;
      if (!t.visible) return;
      if (t.material.map !== c.material.map) {
        t.material.map = c.material.map;
        t.material.needsUpdate = true;
      }
      const ang = c.angle - trailStep * (n + 1);
      t.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
      t.quaternion.copy(quat);
      t.scale.set(tw, th, 1);
      t.material.opacity = op;
    });
  }

  renderer.render(scene, camera);
  __perf.frames.push([ts, performance.now() - t0]);
}

function resize() {
  const rect = host.getBoundingClientRect();
  W = rect.width; H = rect.height; left = rect.left; top = rect.top;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // world unit = CSS pixel: z so that visible height == H
  camera.position.z = H / 2 / Math.tan(THREE.MathUtils.degToRad(30));
  camera.updateProjectionMatrix();

  radius = Math.min(W * (W < 640 ? 0.46 : 0.42), 0.38 * H);
  const base = Math.min(46 * (W < 640 ? 0.75 : 1), (Math.PI * 2 * radius) / cards.length * 0.62);
  for (const c of cards) {
    c.thumbW = base * Math.sqrt(aspectOf(c));
    c.thumbH = base / Math.sqrt(aspectOf(c));
  }
  if (strip.open) {
    const i = nearestIndex(strip.x);
    rebuildStrip();
    strip.x = strip.target = strip.centres[i];
  }
  needDraw = true;
}

// ---- pointer / wheel / keys ----
function onPointerDown(e) {
  if (!ready || e.button !== 0) return;
  const x = e.clientX - left - W / 2;
  const y = e.clientY - top - H / 2;
  pointer = {
    angle: Math.atan2(y, x),
    moved: 0,
    x: e.clientX, y: e.clientY,
    velocity: 0, time: e.timeStamp,
  };
  spin.velocity = 0;
  clearTimeout(snapTimer);
}

function onPointerMove(e) {
  if (!ready) return;
  const x = e.clientX - left - W / 2;
  const y = e.clientY - top - H / 2;

  cursorLabel.style.left = '0px';
  cursorLabel.style.top = '0px';
  cursorLabel.style.transform = `translate(${e.clientX + 14}px, ${e.clientY - 10}px)`;

  if (pointer && (strip.open || morph.expand === 0)) {
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer.moved += Math.hypot(dx, dy);
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (pointer.moved >= 10 && !host.hasPointerCapture(e.pointerId)) {
      try { host.setPointerCapture(e.pointerId); } catch {}
    }

    if (strip.open) {
      if (pendingSnap == null) pendingSnap = snapX(strip.target);
      strip.target += -dx;
      const dt = e.timeStamp - pointer.time;
      if (dt > 0) pointer.velocity = THREE.MathUtils.lerp(pointer.velocity, -dx / dt, 0.6);
      pointer.time = e.timeStamp;
      setCursor('grabbing');
      setLabel(null);
      return;
    }

    const ang = Math.atan2(y, x);
    let d = ang - pointer.angle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    pointer.angle = ang;
    spin.angle -= d;
    spin.velocity = THREE.MathUtils.clamp(-d, -0.3, 0.3);
    hoverCard = null;
    setCursor('grabbing');
    setLabel(null);
    return;
  }

  const hit = hitTest(e.clientX, e.clientY);
  if (strip.open) {
    hoverCard = null;
    if (hit && hit !== expandedCard) {
      setLabel('查看');
      setCursor('pointer');
    } else if (!hit) {
      setLabel('关闭');
      setCursor('pointer');
    } else {
      setLabel(null);
      setCursor('default');
    }
    return;
  }

  hoverCard = hit;
  if (hit) {
    setLabel('查看');
    setCursor('pointer');
  } else {
    setLabel(null);
    const onRing = Math.abs(Math.hypot(x, y) - radius) < 90;
    setCursor(onRing ? 'grab' : 'default');
  }
}

function settleStrip() {
  const base = pendingSnap ?? snapX(strip.target);
  const delta = strip.target - base;
  pendingSnap = null;
  if (Math.abs(delta) < 24) { strip.target = base; return; }
  const next = snapX(strip.target);
  if (nearestIndex(next) !== nearestIndex(base)) { strip.target = next; return; }
  strip.target = base;
  nudgeStrip(Math.sign(delta));
}

function onPointerUp(e) {
  if (!pointer) return;
  const { moved, velocity, time } = pointer;
  const didDrag = moved >= 10;
  pointer = null;

  if (strip.open) {
    if (didDrag && e.timeStamp - time < 80) strip.target += 180 * velocity;
    if (pendingSnap != null) settleStrip();
    if (didDrag) { setCursor('grab'); return; }
  } else if (didDrag) {
    setCursor('grab');
    return;
  }

  const hit = hitTest(e.clientX, e.clientY);
  if (strip.open) {
    if (hit && hit !== expandedCard) {
      strip.target = snapX(strip.x + stripOffset(hit.index));
    } else if (!hit) {
      closeStrip();
    }
    return;
  }

  let card = hit;
  if (!card && e.pointerType === 'touch') card = nearestOnRing(e.clientX, e.clientY);
  if (card && morph.expand === 0) openCard(card);
}

function onWheel(e) {
  e.preventDefault();
  if (!ready) return;
  if (strip.open) {
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1);
    if (pendingSnap == null) pendingSnap = snapX(strip.target);
    strip.target += delta;
    clearTimeout(snapTimer);
    snapTimer = setTimeout(settleStrip, 160);
    return;
  }
  if (morph.expand > 0) return;
  spin.velocity -= 0.00015 * e.deltaY;
}

function onKey(e) {
  if (e.defaultPrevented) return;
  if (e.key === 'Escape') { closeStrip(); return; }
  if (strip.open) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nudgeStrip(1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nudgeStrip(-1);
    return;
  }
  if (!ready || morph.expand > 0) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const top = hoverCard || cards.reduce((a, b) => Math.abs(frontAngle(b)) < Math.abs(frontAngle(a)) ? b : a);
    openCard(top);
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); spin.velocity -= 0.02; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); spin.velocity += 0.02; }
}

function onLeave() {
  hoverCard = null;
  setLabel(null);
}

// ---- autoplay for recording ----
async function runAuto() {
  mark('autoStart');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1600);
  // slow elegant spin with visible trails
  spin.velocity = -0.035;
  await sleep(3200);
  spin.velocity = -0.09;
  await sleep(2200);
  spin.velocity = -0.04;
  await sleep(1800);
  // open front card
  const top = cards.reduce((a, b) => Math.abs(frontAngle(b)) < Math.abs(frontAngle(a)) ? b : a);
  openCard(top);
  await sleep(2200);
  for (let i = 0; i < 5; i++) {
    nudgeStrip(1);
    await sleep(1200);
  }
  await sleep(800);
  closeStrip();
  await sleep(1600);
  // reverse spin, open another
  spin.velocity = 0.06;
  await sleep(2400);
  const mid = cards[(top.index + 3) % cards.length];
  openCard(mid);
  await sleep(2000);
  for (let i = 0; i < 3; i++) {
    nudgeStrip(-1);
    await sleep(1100);
  }
  // land on info card
  const info = cards.find((c) => c.data.isInfo) || cards[cards.length - 1];
  strip.target = snapX(strip.x + stripOffset(info.index));
  await sleep(2200);
  closeStrip();
  await sleep(1400);
  spin.velocity = -0.028;
  await sleep(2400);
  autoDone = true;
  mark('autoDone');
}

// ---- boot ----
resize();
const ro = new ResizeObserver(resize);
ro.observe(host);
host.addEventListener('pointerdown', onPointerDown);
host.addEventListener('pointermove', onPointerMove);
host.addEventListener('pointerup', onPointerUp);
host.addEventListener('pointercancel', onPointerUp);
host.addEventListener('pointerleave', onLeave);
host.addEventListener('wheel', onWheel, { passive: false });
window.addEventListener('keydown', onKey);
rafId = requestAnimationFrame(frame);
host.focus({ preventScroll: true });

window.__app = { ready: false, get autoDone() { return autoDone; } };
mark('boot');
