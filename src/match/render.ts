import * as THREE from 'three';
import type { Agent, MatchEngine } from './engine';
import { GOAL_H, GOAL_HW, HL, HW } from './engine';

const PX = 20; // canvas pixels per metre for the pitch texture

function pitchTexture(): THREE.CanvasTexture {
  const W = 105 * PX;
  const H = 68 * PX;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  // stripes
  const stripes = 18;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#3f8f3a' : '#47a042';
    g.fillRect((i * W) / stripes, 0, W / stripes + 1, H);
  }
  // subtle noise
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.03)';
    g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  }
  const X = (x: number) => (x + 52.5) * PX;
  const Y = (y: number) => (y + 34) * PX;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.lineWidth = 0.12 * PX * 1.4;
  const rect = (x0: number, y0: number, x1: number, y1: number) => g.strokeRect(X(x0), Y(y0), X(x1) - X(x0), Y(y1) - Y(y0));
  rect(-52.4, -33.9, 52.4, 33.9);
  g.beginPath();
  g.moveTo(X(0), Y(-34));
  g.lineTo(X(0), Y(34));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Y(0), 9.15 * PX, 0, Math.PI * 2);
  g.stroke();
  const spot = (x: number, y: number) => {
    g.beginPath();
    g.fillStyle = 'white';
    g.arc(X(x), Y(y), 0.22 * PX, 0, Math.PI * 2);
    g.fill();
  };
  spot(0, 0);
  for (const s of [-1, 1]) {
    const gx = s * 52.4;
    rect(Math.min(gx, gx - s * 16.5), -20.16, Math.max(gx, gx - s * 16.5), 20.16);
    rect(Math.min(gx, gx - s * 5.5), -9.16, Math.max(gx, gx - s * 5.5), 9.16);
    spot(s * (52.5 - 11), 0);
    g.beginPath();
    const a = Math.acos(5.5 / 9.15);
    if (s > 0) g.arc(X(52.5 - 11), Y(0), 9.15 * PX, Math.PI - a, Math.PI + a);
    else g.arc(X(-52.5 + 11), Y(0), 9.15 * PX, -a, a);
    g.stroke();
    for (const t of [-1, 1]) {
      g.beginPath();
      const cx = X(s * 52.4);
      const cy = Y(t * 33.9);
      const start = s > 0 ? (t > 0 ? Math.PI : Math.PI / 2) : t > 0 ? -Math.PI / 2 : 0;
      g.arc(cx, cy, 1 * PX, start, start + Math.PI / 2);
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function crowdTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1b2230';
  g.fillRect(0, 0, 512, 128);
  const cols = ['#e8e8e8', '#c33', '#36c', '#fc3', '#2a2', '#f80', '#9cf', '#a3a', '#555', '#eaa'];
  for (let y = 4; y < 128; y += 8) {
    for (let x = 2; x < 512; x += 6) {
      if (Math.random() < 0.12) continue;
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      g.fillRect(x + Math.random() * 2, y + Math.random() * 2, 4, 5);
      g.fillStyle = 'rgba(240,200,170,0.9)';
      g.fillRect(x + 1, y - 2, 2, 2);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function boardTexture(text: string, bg: string, fg: string) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 64);
  g.fillStyle = fg;
  g.font = 'bold 40px "Barlow Condensed", Arial, sans-serif';
  g.textBaseline = 'middle';
  for (let x = 20; x < 1024; x += 256) g.fillText(text, x, 34);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function netTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function numberTexture(num: number, fg: string) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = fg;
  g.font = 'bold 46px "Barlow Condensed", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 32, 36);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SKIN = ['#f1c7a5', '#d9a47c', '#b57b55', '#8a5a3b', '#5e3b26'];
const HAIR = ['#1a1410', '#3b2a1c', '#6b4a2a', '#c9a26a', '#0d0d0d'];

interface PlayerRig {
  root: THREE.Group;
  body: THREE.Group; // whole body (lean, bob)
  torso: THREE.Group; // upper body (twist)
  legL: THREE.Group;
  legR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  phase: number;
  // smoothed state for display
  dx: number;
  dy: number;
  pvx: number;
  pvy: number;
  accF: number;
  accL: number;
  sp: number;
  idle: number;
}

function box(w: number, h: number, d: number, mat: THREE.Material, y = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  m.castShadow = true;
  return m;
}

function makePlayer(shirt: string, shorts: string, socks: string, num: number, numColor: string): PlayerRig {
  const std = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true });
  const shirtM = std(shirt);
  const shortsM = std(shorts);
  const sockM = std(socks);
  const skinM = std(SKIN[Math.floor(Math.random() * SKIN.length)]);
  const hairM = std(HAIR[Math.floor(Math.random() * HAIR.length)]);
  const shoeM = std('#111');
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(box(0.44, 0.26, 0.28, shortsM, 0.9));
  // upper body pivots at the waist so it can twist against the legs
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  body.add(torso);
  torso.add(box(0.46, 0.62, 0.27, shirtM, 0.3));
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.135, 1), skinM);
  head.position.y = 0.77;
  head.castShadow = true;
  torso.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), hairM);
  hair.position.y = 0.79;
  torso.add(hair);
  torso.add(box(0.1, 0.1, 0.1, skinM, 0.64));
  // number on the back
  const nm = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ map: numberTexture(num, numColor), transparent: true }),
  );
  nm.position.set(0, 0.33, -0.141);
  nm.rotation.y = Math.PI;
  torso.add(nm);

  const leg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx, 0.86, 0);
    hip.add(box(0.15, 0.4, 0.16, skinM, -0.2));
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    hip.add(knee);
    knee.add(box(0.14, 0.4, 0.15, sockM, -0.2));
    const shoe = box(0.14, 0.08, 0.26, shoeM, -0.42);
    shoe.position.z = 0.05;
    knee.add(shoe);
    body.add(hip);
    return { hip, knee };
  };
  const arm = (sx: number) => {
    const sh = new THREE.Group();
    sh.position.set(sx, 0.55, 0);
    sh.add(box(0.13, 0.27, 0.14, shirtM, -0.13));
    const el = new THREE.Group();
    el.position.y = -0.27;
    sh.add(el);
    el.add(box(0.11, 0.3, 0.12, skinM, -0.15));
    torso.add(sh);
    return { sh, el };
  };
  const L = leg(-0.11);
  const R = leg(0.11);
  const AL = arm(-0.3);
  const AR = arm(0.3);
  return {
    root, body, torso,
    legL: L.hip, legR: R.hip, kneeL: L.knee, kneeR: R.knee,
    armL: AL.sh, armR: AR.sh, elbowL: AL.el, elbowR: AR.el,
    phase: Math.random() * 6,
    dx: 0, dy: 0, pvx: 0, pvy: 0, accF: 0, accL: 0, sp: 0, idle: Math.random() * 10,
  };
}

function footballMesh() {
  const geo = new THREE.IcosahedronGeometry(0.22, 1).toNonIndexed();
  const colors: number[] = [];
  const n = geo.attributes.position.count / 3;
  for (let i = 0; i < n; i++) {
    const c = i % 5 === 0 ? 0.08 : 0.96;
    for (let k = 0; k < 3; k++) colors.push(c, c, c);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true }));
  m.castShadow = true;
  return m;
}

export class MatchRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  rigs = new Map<number, PlayerRig>();
  ball: THREE.Mesh;
  userRing: THREE.Mesh;
  userArrow: THREE.Mesh;
  ownerRing: THREE.Mesh;
  camX = 0;
  camZoom = 1;
  focusZ = 0;
  private disposed = false;

  constructor(
    private container: HTMLElement,
    private engine: MatchEngine,
  ) {
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);

    this.buildWorld(mobile);
    const setup = engine.setup;
    for (const a of engine.agents) {
      const ts = a.team === 0 ? setup.home : setup.away;
      const isGK = a.role === 'GK';
      const shirt = isGK ? (a.team === 0 ? '#e5d93a' : '#8a3fd1') : ts.primary;
      const shorts = isGK ? '#222' : ts.secondary;
      const rig = makePlayer(shirt, shorts, shirt, a.num, isGK ? '#111' : ts.secondary);
      rig.root.scale.setScalar(1.18);
      this.scene.add(rig.root);
      this.rigs.set(a.id, rig);
    }
    this.ball = footballMesh();
    this.scene.add(this.ball);

    const ringGeo = new THREE.RingGeometry(0.6, 0.85, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.userRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false }));
    this.userRing.position.y = 0.03;
    this.scene.add(this.userRing);
    const arrowGeo = new THREE.ConeGeometry(0.28, 0.5, 4);
    arrowGeo.rotateX(Math.PI);
    this.userArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    this.scene.add(this.userArrow);
    const oGeo = new THREE.RingGeometry(0.42, 0.52, 24);
    oGeo.rotateX(-Math.PI / 2);
    this.ownerRing = new THREE.Mesh(oGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.ownerRing.position.y = 0.025;
    this.scene.add(this.ownerRing);

    this.resize();
  }

  private buildWorld(mobile: boolean) {
    const s = this.scene;
    // sky gradient
    const cv = document.createElement('canvas');
    cv.width = 2;
    cv.height = 256;
    const g = cv.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0d1b33');
    grad.addColorStop(0.55, '#2b4f7e');
    grad.addColorStop(1, '#6f8fb3');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const sky = new THREE.CanvasTexture(cv);
    sky.colorSpace = THREE.SRGBColorSpace;
    s.background = sky;
    s.fog = new THREE.Fog('#2b4f7e', 140, 320);

    s.add(new THREE.HemisphereLight('#cfe2ff', '#2f5a2c', 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(-25, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -62;
    sc.right = 62;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 10;
    sc.far = 200;
    sun.shadow.bias = -0.0005;
    s.add(sun);

    // surrounding grass
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ color: '#2f6e2c', roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    s.add(outer);
    const tex = pitchTexture();
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    s.add(pitch);

    // goals
    const postM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const netT = netTexture();
    for (const side of [-1, 1]) {
      const gx = side * HL;
      const post = (z: number) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_H, 8), postM);
        p.position.set(gx, GOAL_H / 2, z);
        p.castShadow = true;
        s.add(p);
      };
      post(-GOAL_HW);
      post(GOAL_HW);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_HW * 2, 8), postM);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(gx, GOAL_H, 0);
      bar.castShadow = true;
      s.add(bar);
      const depth = 2;
      const netMat = (rx: number, ry: number) => {
        const t = netT.clone();
        t.needsUpdate = true;
        t.repeat.set(rx, ry);
        return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 });
      };
      const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HW * 2, GOAL_H), netMat(30, 10));
      back.position.set(gx + side * depth, GOAL_H / 2, 0);
      back.rotation.y = Math.PI / 2;
      s.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_HW * 2), netMat(8, 30));
      top.rotation.x = -Math.PI / 2;
      top.position.set(gx + side * depth / 2, GOAL_H, 0);
      s.add(top);
      for (const z of [-GOAL_HW, GOAL_HW]) {
        const sd = new THREE.Mesh(new THREE.PlaneGeometry(depth, GOAL_H), netMat(8, 10));
        sd.position.set(gx + side * depth / 2, GOAL_H / 2, z);
        s.add(sd);
      }
    }

    // ad boards
    const boards = [
      boardTexture('NEW STAR  •  ⚽  •  ', '#0b2a4a', '#ffd84a'),
      boardTexture('FUTEBOL • FOOTBALL • ', '#7a0f1f', '#ffffff'),
    ];
    const addBoard = (x: number, z: number, len: number, rotY: number, i: number) => {
      const t = boards[i % 2].clone();
      t.needsUpdate = true;
      t.repeat.set(len / 20, 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), new THREE.MeshBasicMaterial({ map: t }));
      m.position.set(x, 0.45, z);
      m.rotation.y = rotY;
      s.add(m);
    };
    for (let i = 0; i < 5; i++) {
      addBoard(-46 + i * 23, -HW - 4, 22, 0, i);
      addBoard(-46 + i * 23, HW + 4, 22, Math.PI, i + 1);
    }
    for (const side of [-1, 1]) {
      addBoard(side * (HL + 4.5), -20, 22, side * Math.PI / 2, 0);
      addBoard(side * (HL + 4.5), 20, 22, side * Math.PI / 2, 1);
    }

    // stands (not on the camera side)
    const crowd = crowdTexture();
    const standM = new THREE.MeshStandardMaterial({ color: '#3a4250', roughness: 0.9 });
    const tier = (w: number, x: number, z: number, rotY: number, rep: number) => {
      for (let k = 0; k < 4; k++) {
        const t = crowd.clone();
        t.needsUpdate = true;
        t.repeat.set(rep, 1);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 4.2), [standM, standM, standM, standM, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), standM]);
        const off = 4 + k * 4;
        m.position.set(x + Math.sin(rotY) * -off * 0, 1.6 + k * 2.6, z);
        m.rotation.y = rotY;
        m.translateZ(-off);
        s.add(m);
      }
    };
    tier(140, 0, -HW - 5, 0, 14);
    tier(80, -HL - 6, 0, Math.PI / 2, 8);
    tier(80, HL + 6, 0, -Math.PI / 2, 8);
    // floodlights
    const poleM = new THREE.MeshStandardMaterial({ color: '#8a8f99' });
    const lampM = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
    for (const [x, z] of [
      [-HL - 12, -HW - 18],
      [HL + 12, -HW - 18],
      [-HL - 12, HW + 22],
      [HL + 12, HW + 22],
    ]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 38, 6), poleM);
      pole.position.set(x, 19, z);
      s.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.6), lampM);
      lamp.position.set(x, 39, z);
      lamp.lookAt(0, 0, 0);
      s.add(lamp);
    }
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.fov = this.camera.aspect < 1 ? 52 : this.camera.aspect < 1.4 ? 38 : 30;
    this.camera.updateProjectionMatrix();
  }

  private animateRig(a: Agent, rig: PlayerRig, dt: number, simDt: number) {
    rig.root.visible = !a.sentOff;
    // position: light smoothing hides tiny corrections, big jumps (restarts) snap
    if (Math.hypot(a.x - rig.dx, a.y - rig.dy) > 3) {
      rig.dx = a.x;
      rig.dy = a.y;
    } else {
      const k = 1 - Math.exp(-dt * 30);
      rig.dx += (a.x - rig.dx) * k;
      rig.dy += (a.y - rig.dy) * k;
    }
    rig.root.position.set(rig.dx, 0, rig.dy);
    rig.root.rotation.y = Math.atan2(Math.cos(a.dir), Math.sin(a.dir));

    // speed and acceleration in the body frame (for leaning)
    const sp = Math.hypot(a.vx, a.vy);
    rig.sp += (sp - rig.sp) * (1 - Math.exp(-dt * 10));
    if (simDt > 1e-5) {
      const ax = (a.vx - rig.pvx) / simDt;
      const ay = (a.vy - rig.pvy) / simDt;
      const fx = Math.cos(a.dir);
      const fy = Math.sin(a.dir);
      const f = clampN(ax * fx + ay * fy, -14, 14);
      const l = clampN(-ax * fy + ay * fx, -14, 14);
      const k = 1 - Math.exp(-dt * 6);
      rig.accF += (f - rig.accF) * k;
      rig.accL += (l - rig.accL) * k;
    }
    rig.pvx = a.vx;
    rig.pvy = a.vy;

    // run cycle: cadence and stride grow with speed
    const s = rig.sp;
    const run = Math.min(1, s / 7.5);
    rig.phase += simDt * (s > 0.3 ? 4.2 + s * 0.95 : 0);
    rig.idle += simDt;
    const ph = rig.phase;
    const stride = 0.25 + run * 0.65;
    let hipL = Math.sin(ph) * stride * Math.min(1, s / 1.5);
    let hipR = -hipL;
    // the knee bends most while the leg swings forward
    let kneeL = (0.15 + Math.max(0, Math.sin(ph + 1.3)) * (0.5 + run * 1.0)) * Math.min(1, s / 1.2);
    let kneeR = (0.15 + Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * (0.5 + run * 1.0)) * Math.min(1, s / 1.2);
    let armL = -hipL * (0.6 + run * 0.4);
    let armR = -hipR * (0.6 + run * 0.4);
    let elbow = 0.25 + run * 1.0;
    let armZ = 0.08;
    const bob = Math.abs(Math.cos(ph)) * 0.07 * run;
    let bodyY = bob;
    let pitch = 0.04 + run * 0.16 + clampN(rig.accF * 0.018, -0.18, 0.22);
    let roll = clampN(-rig.accL * 0.028, -0.3, 0.3);
    let twist = -Math.sin(ph) * 0.18 * run;

    // standing: slight knee flex, breathing, weight shift
    if (s < 0.4) {
      const br = Math.sin(rig.idle * 1.8);
      kneeL = kneeR = 0.18;
      hipL = hipR = -0.08;
      armL = armR = 0.05 + br * 0.03;
      elbow = 0.35;
      bodyY = -0.03 + br * 0.008;
      roll += Math.sin(rig.idle * 0.7) * 0.025;
      pitch = 0.08;
    }
    // dribble touch: a short tap with the right foot
    if (a.touchAnim > 0) {
      const k = a.touchAnim / 0.22;
      hipR = -0.55 * Math.sin(k * Math.PI);
      kneeR = 0.25;
    }
    // kick: plant, strike through the ball, follow-through
    if (a.kickAnim > 0) {
      const k = 1 - a.kickAnim / 0.35; // 0 -> 1
      hipR = k < 0.25 ? 0.6 * (k / 0.25) : 0.6 - 2.1 * Math.sin(((k - 0.25) / 0.75) * (Math.PI / 2));
      kneeR = k < 0.25 ? 1.2 : 1.2 * (1 - (k - 0.25) / 0.75) + 0.1;
      hipL = -0.15;
      kneeL = 0.35;
      armL = -0.9;
      armR = 0.5;
      armZ = 0.5;
      pitch = -0.08 + k * 0.15;
      twist = 0.25 - k * 0.5;
    }
    // throw-in: ball held over the head, then both arms whip forward
    if (a.holdUp || a.throwAnim > 0) {
      const k = a.holdUp ? 0 : 1 - a.throwAnim / 0.35;
      armL = armR = -2.95 + k * 1.9;
      armZ = 0.12;
      elbow = a.holdUp ? 0.7 : 0.7 * (1 - k);
      pitch = a.holdUp ? -0.12 : -0.12 + k * 0.35;
      twist = 0;
    }
    if (a.celebrate > 0) {
      armZ = 2.6;
      armL = armR = 0;
      elbow = 0.2;
      bodyY = Math.abs(Math.sin(rig.idle * 7)) * 0.3;
    }
    if (a.dive) {
      roll = -a.dive * 1.3;
      bodyY = 0.45;
      armZ = 2.8;
      hipL = hipR = -0.3;
    }
    if (a.stun > 0.4 && s < 1.5) pitch = -0.22;

    rig.body.position.y = bodyY;
    rig.body.rotation.set(pitch, 0, roll);
    rig.torso.rotation.set(0, twist, 0);
    rig.legL.rotation.x = hipL;
    rig.legR.rotation.x = hipR;
    rig.kneeL.rotation.x = kneeL;
    rig.kneeR.rotation.x = kneeR;
    rig.armL.rotation.set(armL, 0, -armZ);
    rig.armR.rotation.set(armR, 0, armZ);
    rig.elbowL.rotation.x = -elbow;
    rig.elbowR.rotation.x = -elbow;
  }

  render(dt: number, focus: 'none' | 'user', simDt = dt) {
    if (this.disposed) return;
    const e = this.engine;
    for (const a of e.agents) this.animateRig(a, this.rigs.get(a.id)!, dt, simDt);
    const b = e.ball;
    this.ball.position.set(b.x, 0.22 + b.z, b.y);
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.1) {
      const axis = new THREE.Vector3(b.vy, 0, -b.vx).normalize();
      this.ball.rotateOnWorldAxis(axis, (sp * simDt) / 0.22);
    }

    const u = e.user;
    this.userRing.visible = this.userArrow.visible = !!u && e.userOnField;
    if (u) {
      this.userRing.position.set(u.x, 0.03, u.y);
      this.userArrow.position.set(u.x, 2.45 + Math.sin(performance.now() / 220) * 0.1, u.y);
      this.userArrow.rotation.y += dt * 2;
    }
    const o = b.owner;
    this.ownerRing.visible = !!o && o !== u;
    if (o) this.ownerRing.position.set(o.x, 0.025, o.y);

    // broadcast camera
    const wantFocus = focus === 'user' && u;
    const look = b.owner ? 0.5 : 0.25;
    const fx = wantFocus ? u!.x * 0.6 + b.x * 0.4 : b.x + clampN(b.vx * look, -8, 8);
    const fz = wantFocus ? u!.y * 0.6 + b.y * 0.4 : b.y;
    const k = 1 - Math.exp(-dt * (wantFocus ? 2.6 : 1.5));
    this.camX += (clampN(fx * 0.95, -46, 46) - this.camX) * k;
    this.camZoom += ((wantFocus ? 0.7 : 1) - this.camZoom) * (1 - Math.exp(-dt * 2.5));
    const portrait = this.camera.aspect < 1;
    const dist = (portrait ? 58 : 50) * this.camZoom;
    const height = (portrait ? 38 : 25) * this.camZoom;
    // while a decision is open, keep the player in the upper half, above the options panel
    this.focusZ += ((wantFocus ? clampN(fz * 0.9, -26, 28) + (portrait ? 9 : 6) : clampN(fz * 0.4, -14, 14)) - this.focusZ) * (1 - Math.exp(-dt * 3));
    const lookZ = this.focusZ;
    this.camera.position.set(this.camX, height, lookZ + dist);
    this.camera.lookAt(this.camX, 0, lookZ + (wantFocus ? 0 : portrait ? 7 : -2));
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen position (CSS px) above an agent's head. */
  screenOf(a: Agent, h = 2.6): { x: number; y: number } | null {
    const v = new THREE.Vector3(a.x, h, a.y).project(this.camera);
    if (v.z > 1) return null;
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }

  /** Screen position (CSS px) of the user's head, for the name tag. */
  userScreen(): { x: number; y: number } | null {
    const u = this.engine.user;
    if (!u || !this.engine.userOnField) return null;
    const v = new THREE.Vector3(u.x, 2.9, u.y).project(this.camera);
    if (v.z > 1) return null;
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }

  dispose() {
    this.disposed = true;
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.domElement.remove();
  }
}

function clampN(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
