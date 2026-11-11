// Mondes 3D low-poly générés par code (aucun asset externe) — rendus en basse définition puis tramés
// pour un rendu « console 2000 ». Tout est déterministe : la même graine + le même instant = la même image.
import * as THREE from 'three';

export const RW = 270; // résolution interne : 270×480, agrandie ×4 en pixels nets
export const RH = 480;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Amb = {haut: string; milieu: string; horizon: string; brume: string; soleil: string | null; lumiere: string; cielLum: string; solLum: string; fenetres: number; nuit: boolean; sol: string};
const AMB: Record<string, Amb> = {
  coucher: {haut: '#2A1D5C', milieu: '#E2604A', horizon: '#FFC266', brume: '#F09A5A', soleil: '#FFE9A8', lumiere: '#FFC890', cielLum: '#FFB27A', solLum: '#4A3466', fenetres: 0.18, nuit: false, sol: '#6B5650'},
  neon: {haut: '#0A0418', milieu: '#3A0F4F', horizon: '#C2306E', brume: '#2A0C3A', soleil: null, lumiere: '#FF5FA2', cielLum: '#7A3CC8', solLum: '#0A0410', fenetres: 0.9, nuit: true, sol: '#191220'},
  nuit: {haut: '#03040B', milieu: '#0E1533', horizon: '#26306A', brume: '#10183A', soleil: null, lumiere: '#5A68B8', cielLum: '#2A3570', solLum: '#05060A', fenetres: 1.1, nuit: true, sol: '#1A1B22'},
};
const MURS = ['#E8D7B8', '#F2B8A2', '#9FC6C0', '#F4EDE1', '#C9B8A6', '#D9967A', '#A7B6C9', '#EAD49B', '#B9D3A8'];

const lam = (couleur: string, extra: any = {}) => new THREE.MeshLambertMaterial({color: couleur, flatShading: true, ...extra});
const basic = (couleur: string, extra: any = {}) => new THREE.MeshBasicMaterial({color: couleur, ...extra});

function canvasTex(w: number, h: number, dessin: (x: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  dessin(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ambiance(scene: THREE.Scene, a: Amb, dirSoleil: THREE.Vector3, brume: [number, number]) {
  // ciel en dégradé
  const g = new THREE.SphereGeometry(500, 24, 16);
  const p = g.attributes.position;
  const c1 = new THREE.Color(a.horizon), c2 = new THREE.Color(a.milieu), c3 = new THREE.Color(a.haut);
  const cols: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 500;
    const c = new THREE.Color();
    if (y < 0) c.copy(c1);
    else if (y < 0.22) c.copy(c1).lerp(c2, y / 0.22);
    else c.copy(c2).lerp(c3, Math.min(1, (y - 0.22) / 0.45));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false})));
  scene.fog = new THREE.Fog(a.brume, brume[0], brume[1]);
  scene.add(new THREE.HemisphereLight(a.cielLum, a.solLum, a.nuit ? 0.5 : 1.0));
  if (a.soleil) {
    const d = new THREE.DirectionalLight(a.lumiere, 1.6);
    d.position.copy(dirSoleil).multiplyScalar(100);
    scene.add(d);
    const s = new THREE.Group();
    s.add(new THREE.Mesh(new THREE.CircleGeometry(34, 20), basic(a.soleil, {fog: false})));
    const halo = new THREE.Mesh(new THREE.CircleGeometry(70, 20), basic(a.soleil, {fog: false, transparent: true, opacity: 0.22, depthWrite: false}));
    halo.position.z = -1;
    s.add(halo);
    s.position.copy(dirSoleil).normalize().multiplyScalar(440);
    s.lookAt(0, 0, 0);
    scene.add(s);
  } else {
    // étoiles
    const r = rng(99);
    const pos: number[] = [];
    for (let i = 0; i < 500; i++) {
      const th = r() * Math.PI * 2, ph = 0.08 + r() * 1.3;
      pos.push(Math.cos(th) * Math.cos(ph) * 450, Math.sin(ph) * 450, Math.sin(th) * Math.cos(ph) * 450);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({color: '#ffffff', size: 1, sizeAttenuation: false, fog: false})));
  }
}

function texFenetres(seed: number) {
  const r = rng(seed);
  const allumees: boolean[] = Array.from({length: 16}, () => r() < 0.45);
  const map = canvasTex(32, 32, (x) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 32, 32);
    x.fillStyle = '#34405A';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) x.fillRect(i * 8 + 2, j * 8 + 2, 4, 5);
  }, true);
  const emi = canvasTex(32, 32, (x) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (!allumees[i * 4 + j]) continue;
      x.fillStyle = (i + j) % 3 ? '#FFD27A' : '#BFE3FF';
      x.fillRect(i * 8 + 2, j * 8 + 2, 4, 5);
    }
  }, true);
  return {map, emi};
}

function immeuble(w: number, h: number, d: number, couleur: string, tex: any, a: Amb) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    let su = w / 4, sv = h / 4;
    if (f < 2) su = d / 4;
    if (f === 2 || f === 3) { su = 0.02; sv = 0.02; } // toit sans fenêtres
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  const m = lam(a.nuit ? new THREE.Color(couleur).multiplyScalar(0.35).getStyle() : couleur, {
    map: tex.map, emissive: new THREE.Color('#ffffff'), emissiveMap: tex.emi, emissiveIntensity: a.fenetres,
  });
  const b = new THREE.Mesh(g, m);
  b.position.y = h / 2;
  return b;
}

function palmier(r: () => number, h = 7) {
  const g = new THREE.Group();
  const tronc = lam('#7A5230');
  const seg = 6;
  const pente = (r() - 0.5) * 0.5;
  let y = 0;
  for (let i = 0; i < seg; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.015, 0.25 - i * 0.015, h / seg + 0.05, 5), tronc);
    c.position.set(pente * i * i * 0.08, y + h / seg / 2, 0);
    g.add(c);
    y += h / seg;
  }
  const top = new THREE.Vector3(pente * seg * seg * 0.08, h, 0);
  const vert = ['#2F7A3A', '#3C8C40', '#276B33'][Math.floor(r() * 3)];
  const feuille = lam(vert, {side: THREE.DoubleSide});
  for (let k = 0; k < 8; k++) {
    const pivot = new THREE.Group();
    pivot.position.copy(top);
    pivot.rotation.y = (k / 8) * Math.PI * 2 + r() * 0.5;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.4, 3), feuille);
    f.scale.set(1, 1, 0.22);
    f.rotation.z = -Math.PI / 2 - 0.35 - r() * 0.35;
    f.position.set(1.5, -0.45, 0);
    pivot.add(f);
    g.add(pivot);
  }
  const noix = new THREE.Mesh(new THREE.SphereGeometry(0.35, 5, 4), lam('#5A3A1A'));
  noix.position.copy(top).add(new THREE.Vector3(0, -0.2, 0));
  g.add(noix);
  return g;
}

function voiture(couleur: string) {
  const g = new THREE.Group();
  const caisse = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), lam(couleur));
  caisse.position.y = 0.6;
  g.add(caisse);
  const hab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2), lam('#1E2233'));
  hab.position.set(0, 1.15, 0.2);
  g.add(hab);
  const roue = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 8);
  const noir = lam('#111111');
  for (const [x, z] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]) {
    const w = new THREE.Mesh(roue, noir);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w);
  }
  for (const x of [-0.6, 0.6]) {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.05), basic('#FFF6D0'));
    ph.position.set(x, 0.65, -2.02);
    g.add(ph);
    const fe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.05), basic('#FF2A2A'));
    fe.position.set(x, 0.65, 2.02);
    g.add(fe);
  }
  return g;
}

function lampadaire(nuit: boolean) {
  const g = new THREE.Group();
  const m = lam('#3A3D45');
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 6, 5), m);
  mat.position.y = 3;
  g.add(mat);
  const bras = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), m);
  bras.position.set(0.7, 6, 0);
  g.add(bras);
  const lampe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.35), basic(nuit ? '#FFE3A0' : '#D8D0B8'));
  lampe.position.set(1.4, 5.9, 0);
  g.add(lampe);
  if (nuit) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.8, 8, 1, true), basic('#FFD98A', {transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide}));
    cone.position.set(1.4, 2.95, 0);
    g.add(cone);
  }
  return g;
}

// ---------- Décors ----------
function avenue(scene: THREE.Scene, a: Amb, seed: number, longueur = 420) {
  const r = rng(seed);
  const tex = texFenetres(seed + 1);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lam(a.sol));
  sol.rotation.x = -Math.PI / 2;
  scene.add(sol);
  const route = new THREE.Mesh(new THREE.PlaneGeometry(16, longueur + 100), lam(a.nuit ? '#15161B' : '#3A3638'));
  route.rotation.x = -Math.PI / 2;
  route.position.set(0, 0.02, -longueur / 2 + 50);
  scene.add(route);
  const blanc = basic(a.nuit ? '#9A9A80' : '#EDE6CF');
  for (let z = 40; z > -longueur; z -= 7) {
    const tir = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), blanc);
    tir.rotation.x = -Math.PI / 2;
    tir.position.set(0, 0.04, z);
    scene.add(tir);
  }
  for (const cote of [-1, 1]) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, longueur + 100), lam(a.nuit ? '#2A2B33' : '#B9AFA2'));
    tr.position.set(cote * 10.5, 0.15, -longueur / 2 + 50);
    scene.add(tr);
    let z = 30;
    while (z > -longueur) {
      const w = 7 + r() * 7, d = 8 + r() * 8, h = 7 + r() * r() * 48;
      const b = immeuble(w, h, d, MURS[Math.floor(r() * MURS.length)], tex, a);
      b.position.x = cote * (13.5 + w / 2 + r() * 2);
      b.position.z = z - d / 2;
      scene.add(b);
      z -= d + 0.5 + r() * 3;
    }
    for (let zz = 20; zz > -longueur; zz -= 11) {
      if (a.nuit && Math.round(zz / 11) % 2 === 0) {
        const l = lampadaire(true);
        l.position.set(cote * 8.6, 0, zz);
        l.rotation.y = cote > 0 ? Math.PI : 0;
        scene.add(l);
      } else if (!a.nuit) {
        const p = palmier(r, 6 + r() * 3);
        p.position.set(cote * (9.5 + r() * 1.5), 0.3, zz + r() * 4);
        scene.add(p);
      }
    }
  }
  const voitures: any[] = [];
  const couleurs = ['#D93A3A', '#F2C14E', '#3A7BD9', '#EDEDED', '#2E2E2E', '#4FB477', '#E07A2F'];
  for (let i = 0; i < 26; i++) {
    const v = voiture(couleurs[Math.floor(r() * couleurs.length)]);
    const sens = i % 2 ? 1 : -1;
    v.rotation.y = sens > 0 ? Math.PI : 0;
    scene.add(v);
    voitures.push({v, x: sens > 0 ? -3.6 - (r() < 0.5 ? 0 : 3.4) : 3.6 + (r() < 0.5 ? 0 : 3.4), z0: -r() * longueur, vit: 9 + r() * 7, sens});
  }
  return (t: number) => {
    for (const c of voitures) {
      let z = c.z0 + c.sens * c.vit * t;
      z = ((z + longueur) % (longueur + 60) + (longueur + 60)) % (longueur + 60) - longueur;
      c.v.position.set(c.x, 0, z);
    }
  };
}

function villeGrille(scene: THREE.Scene, a: Amb, seed: number, mer = true, videCentre = false) {
  const r = rng(seed);
  const tex = texFenetres(seed + 3);
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), lam(a.sol));
  sol.rotation.x = -Math.PI / 2;
  scene.add(sol);
  for (let i = -6; i <= 6; i++)
    for (let j = -6; j <= 6; j++) {
      const cx = i * 24, cz = j * 24;
      if (mer && cx > 70) continue;
      if (videCentre && Math.abs(i) <= 1 && Math.abs(j) <= 1) continue;
      const bloc = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 18), lam(a.nuit ? '#2A2B33' : '#B9AFA2'));
      bloc.position.set(cx, 0.15, cz);
      scene.add(bloc);
      const centre = Math.exp(-(i * i + j * j) / 9);
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const w = 5 + r() * 6, d = 5 + r() * 6;
        const h = 5 + centre * (20 + r() * 50) + r() * 10;
        const b = immeuble(w, h, d, MURS[Math.floor(r() * MURS.length)], tex, a);
        b.position.x = cx + (r() - 0.5) * (16 - w);
        b.position.z = cz + (r() - 0.5) * (16 - d);
        scene.add(b);
      }
      if (!a.nuit && r() < 0.5) {
        const p = palmier(r, 5 + r() * 2);
        p.position.set(cx + 8.5, 0.3, cz + (r() - 0.5) * 14);
        scene.add(p);
      }
    }
  if (mer) {
    const sable = new THREE.Mesh(new THREE.PlaneGeometry(14, 1200), lam('#E9C88E'));
    sable.rotation.x = -Math.PI / 2;
    sable.position.set(88, 0.05, 0);
    scene.add(sable);
    return eau(scene, a, 95, 300);
  }
  return () => {};
}

function eau(scene: THREE.Scene, a: Amb, x0: number, taille: number, axeZ = false) {
  const g = new THREE.PlaneGeometry(taille * 2, taille * 2, 48, 48);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, lam(a.nuit ? '#0E2A40' : '#2E8A9A', {flatShading: true}));
  if (axeZ) m.position.set(0, 0.1, -x0 - taille);
  else m.position.set(x0 + taille, 0.1, 0);
  scene.add(m);
  const p = g.attributes.position;
  const base = Float32Array.from(p.array as Float32Array);
  return (t: number) => {
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], z = base[i * 3 + 2];
      p.setY(i, Math.sin(x * 0.09 + t * 1.6) * 0.45 + Math.cos(z * 0.11 + t * 1.2) * 0.4);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  };
}


// ---------- Ambiance « nuit néon » et poursuites (génériques, aucun élément officiel) ----------
const NEONS = ['#FF2E88', '#2EF2FF', '#B44CFF', '#FFE14D', '#39FF8A'];
function enseignes(scene: THREE.Scene, seed: number, longueur = 420) {
  const r = rng(seed + 21);
  const clign: {m: THREE.Mesh; h: THREE.Mesh; f: number}[] = [];
  for (const cote of [-1, 1])
    for (let z = 25; z > -longueur; z -= 6 + r() * 8) {
      const c = NEONS[Math.floor(r() * NEONS.length)];
      const vertical = r() < 0.4;
      const w = vertical ? 0.7 : 2.5 + r() * 4, h = vertical ? 3 + r() * 5 : 0.5 + r() * 0.8;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, w), basic(c));
      m.position.set(cote * (13.3 + r() * 0.3), 3.5 + r() * 9, z);
      scene.add(m);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.8 + 1.2, h * 1.8 + 1.2), basic(c, {transparent: true, opacity: 0.22, depthWrite: false}));
      halo.rotation.y = Math.PI / 2;
      halo.position.copy(m.position).add(new THREE.Vector3(-cote * 0.2, 0, 0));
      scene.add(halo);
      if (r() < 0.25) clign.push({m, h: halo, f: 2 + r() * 6});
    }
  // reflets de néon sur la route mouillée
  for (let z = 20; z > -longueur; z -= 9) {
    const c = NEONS[Math.floor(r() * NEONS.length)];
    const ref = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + r() * 2, 5 + r() * 6), basic(c, {transparent: true, opacity: 0.16, depthWrite: false}));
    ref.rotation.x = -Math.PI / 2;
    ref.position.set((r() < 0.5 ? -1 : 1) * (2 + r() * 5), 0.06, z);
    scene.add(ref);
  }
  return (t: number) => {
    for (const c of clign) {
      const on = Math.sin(t * c.f * 3.1 + c.f) > -0.6;
      c.m.visible = on;
      c.h.visible = on;
    }
  };
}

function voiturePolice() {
  const g = voiture('#16171C');
  const portes = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.34, 1.9), lam('#F2F2F2'));
  portes.position.set(0, 0.62, 0.1);
  g.add(portes);
  const rouge = basic('#FF1E1E'), bleu = basic('#1E5BFF'), eteint = basic('#2A2A30');
  const gauche = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.36), rouge);
  const droite = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.36), bleu);
  gauche.position.set(-0.36, 1.5, 0.2);
  droite.position.set(0.36, 1.5, 0.2);
  g.add(gauche, droite);
  const halo = (c: string) => new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), basic(c, {transparent: true, opacity: 0.35, depthWrite: false}));
  const hr = halo('#FF2A2A'), hb = halo('#2A6BFF');
  hr.position.set(-0.4, 1.5, 0.2);
  hb.position.set(0.4, 1.5, 0.2);
  g.add(hr, hb);
  const lr = new THREE.PointLight('#FF2020', 0, 18, 1.4), lb = new THREE.PointLight('#2050FF', 0, 18, 1.4);
  lr.position.set(-1.2, 2.2, 0);
  lb.position.set(1.2, 2.2, 0);
  g.add(lr, lb);
  return {g, gyro(t: number, phase: number) {
    const k = Math.floor(t * 9 + phase) % 2 === 0;
    gauche.material = k ? rouge : eteint;
    droite.material = k ? eteint : bleu;
    lr.intensity = k ? 14 : 0;
    lb.intensity = k ? 0 : 14;
    hr.visible = k;
    hb.visible = !k;
  }};
}

function helico() {
  const g = new THREE.Group();
  const corps = new THREE.Mesh(new THREE.SphereGeometry(1.6, 7, 5), lam('#3A4152', {emissive: new THREE.Color('#1C2232')}));
  corps.scale.set(1, 0.85, 1.7);
  g.add(corps);
  const vitre = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 4), basic('#7FB8FF'));
  vitre.scale.set(1, 0.7, 0.9);
  vitre.position.set(0, 0.25, -1.6);
  g.add(vitre);
  const queue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 5), lam('#3A4152', {emissive: new THREE.Color('#1C2232')}));
  queue.position.set(0, 0.3, 3.6);
  g.add(queue);
  const derive = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 0.8), lam('#C8302E'));
  derive.position.set(0, 0.9, 5.9);
  g.add(derive);
  for (const x of [-0.9, 0.9]) {
    const patin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), lam('#111111'));
    patin.position.set(x, -1.55, 0);
    g.add(patin);
  }
  const rotor = new THREE.Group();
  for (const a of [0, Math.PI / 2]) {
    const pale = new THREE.Mesh(new THREE.BoxGeometry(9, 0.06, 0.35), lam('#0E0F14'));
    pale.rotation.y = a;
    rotor.add(pale);
  }
  rotor.position.y = 1.55;
  g.add(rotor);
  const feu = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), basic('#FF2A2A'));
  feu.position.set(0, -1.2, 0);
  g.add(feu);
  return {g, rotor, feu};
}

function calendrierTex(seed: number) {
  const r = rng(seed);
  return canvasTex(48, 56, (x) => {
    x.fillStyle = '#F4EFE6';
    x.fillRect(0, 0, 48, 56);
    x.fillStyle = '#D9322F';
    x.fillRect(0, 0, 48, 13);
    x.fillStyle = '#ffffff';
    x.fillRect(6, 4, 36, 5);
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 5; j++) {
        x.fillStyle = r() < 0.12 ? '#D9322F' : '#9A938A';
        x.fillRect(3 + i * 6.3, 17 + j * 7.6, 4, 4);
      }
  });
}

// ---------- Plans (décor + mouvement de caméra) ----------
type Monde = {scene: THREE.Scene; camera: THREE.PerspectiveCamera; maj: (t: number) => void};

const PLANS: Record<string, (seed: number, dur: number) => Monde> = {
  avenue_coucher(seed) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(0, 0.07, -1), [30, 300]);
    const anim = avenue(scene, a, seed);
    const camera = new THREE.PerspectiveCamera(72, RW / RH, 0.1, 1200);
    return {scene, camera, maj(t) {
      anim(t);
      const z = 12 - 15 * t;
      camera.position.set(Math.sin(t * 0.7) * 2.2, 2.4 + Math.sin(t * 1.3) * 0.25, z);
      camera.lookAt(Math.sin(t * 0.7) * 1.1, 3.2, z - 40);
      camera.rotation.z += Math.sin(t * 0.9) * 0.035;
    }};
  },
  vue_aerienne(seed) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(0.8, 0.12, -1), [80, 520]);
    const vagues = villeGrille(scene, a, seed);
    const camera = new THREE.PerspectiveCamera(70, RW / RH, 0.1, 1500);
    return {scene, camera, maj(t) {
      vagues(t);
      const ang = -0.5 + t * 0.22;
      const rad = 120 - t * 9;
      camera.position.set(Math.sin(ang) * rad, 70 + t * 6, Math.cos(ang) * rad);
      camera.lookAt(0, 8, 0);
    }};
  },
  tour_boites(seed, dur) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(-0.6, 0.1, -1), [60, 420]);
    villeGrille(scene, a, seed, false, true);
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 30), lam('#C8BBA8'));
    plaza.position.y = 0.25;
    scene.add(plaza);
    const r = rng(seed + 7);
    const couches = 150;
    const N = couches * 4;
    const geo = new THREE.BoxGeometry(2.7, 0.32, 3.8);
    const inst = new THREE.InstancedMesh(geo, lam('#ffffff'), N);
    const pal = ['#E23B3B', '#F2C14E', '#2C64D8', '#1E1E28', '#3DBB6E', '#E8E8E8', '#8A3CD9', '#F07B2F'];
    const data: any[] = [];
    for (let l = 0; l < couches; l++)
      for (let k = 0; k < 4; k++) {
        data.push({x: (k % 2 ? 1.45 : -1.45) + (r() - 0.5) * 0.4, z: (k < 2 ? 2 : -2) + (r() - 0.5) * 0.4, y: 0.5 + l * 0.34, rot: (r() - 0.5) * 0.5});
        inst.setColorAt(l * 4 + k, new THREE.Color(pal[Math.floor(r() * pal.length)]));
      }
    scene.add(inst);
    const camera = new THREE.PerspectiveCamera(74, RW / RH, 0.1, 1200);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    return {scene, camera, maj(t) {
      const prog = Math.min(1, t / (dur * 0.8));
      const visibles = Math.floor(N * (0.08 + 0.92 * (1 - Math.pow(1 - prog, 2))));
      for (let i = 0; i < N; i++) {
        const d = data[i];
        const chute = i > visibles - 12 && i < visibles ? (visibles - i) * 1.5 : 0;
        e.set(0, d.rot, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(d.x, i < visibles ? d.y + chute : -50, d.z), q, s);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      const haut = data[Math.max(0, visibles - 1)].y;
      camera.position.set(16 - t * 1.5, 3 + haut * 0.55, 22 - t * 1.2);
      camera.lookAt(0, haut * 0.75 + 4, 0);
    }};
  },
  autoroute_nuit(seed) {
    const scene = new THREE.Scene();
    const a = AMB.nuit;
    ambiance(scene, a, new THREE.Vector3(0, 1, 0), [20, 260]);
    avenue(scene, a, seed, 700);
    const r = rng(seed + 5);
    const trainees: any[] = [];
    for (let i = 0; i < 90; i++) {
      const sens = i % 2 ? 1 : -1;
      const tr = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 7 + r() * 5), basic(sens > 0 ? '#FFF2C8' : '#FF3030'));
      scene.add(tr);
      trainees.push({tr, x: sens > 0 ? -3.6 - (r() < 0.5 ? 0 : 3.2) : 3.6 + (r() < 0.5 ? 0 : 3.2), z0: -r() * 700, vit: sens > 0 ? 70 + r() * 30 : -(10 + r() * 15), y: 0.5 + r() * 0.3});
    }
    const camera = new THREE.PerspectiveCamera(78, RW / RH, 0.1, 1200);
    return {scene, camera, maj(t) {
      const zc = 10 - 42 * t;
      for (const c of trainees) {
        let z = c.z0 + c.vit * t;
        z = zc - (((zc - z) % 260) + 260) % 260 + 40;
        c.tr.position.set(c.x, c.y, z);
      }
      camera.position.set(1.6 + Math.sin(t * 2) * 0.4, 1.7, zc);
      camera.lookAt(0.8, 2.2, zc - 30);
      camera.rotation.z += Math.sin(t * 1.7) * 0.04;
    }};
  },
  mur_ecrans(seed) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080D');
    scene.fog = new THREE.Fog('#07080D', 10, 60);
    scene.add(new THREE.HemisphereLight('#6070A0', '#000000', 0.5));
    const r = rng(seed);
    const ecrans: {ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; teinte: string; mode: number}[] = [];
    const caisse = lam('#5A5A62');
    const cols = 4, rangs = 7;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rangs; j++) {
        const g = new THREE.Group();
        const tv = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.6, 2.4), caisse);
        g.add(tv);
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 24;
        const tex = new THREE.CanvasTexture(c);
        tex.magFilter = tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        const ecran = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.05), new THREE.MeshBasicMaterial({map: tex, fog: false}));
        ecran.position.z = 1.21;
        g.add(ecran);
        g.position.set((i - (cols - 1) / 2) * 3.45 + (r() - 0.5) * 0.2, (j - (rangs - 1) / 2) * 2.75, (r() - 0.5) * 0.4);
        g.rotation.y = (r() - 0.5) * 0.12;
        scene.add(g);
        ecrans.push({ctx: c.getContext('2d')!, tex, teinte: ['#2B6CFF', '#E23B3B', '#F2C14E', '#3DBB6E'][Math.floor(r() * 4)], mode: r() < 0.12 ? 1 : 0});
      }
    const camera = new THREE.PerspectiveCamera(60, RW / RH, 0.1, 200);
    return {scene, camera, maj(t) {
      const fr = Math.floor(t * 30);
      const rn = rng(seed * 31 + fr);
      for (const e of ecrans) {
        const x = e.ctx;
        if (e.mode === 1 || rn() < 0.04) {
          for (let k = 0; k < 140; k++) {
            const v = Math.floor(rn() * 255);
            x.fillStyle = `rgb(${v},${v},${v})`;
            x.fillRect(Math.floor(rn() * 32), Math.floor(rn() * 24), 2, 1);
          }
        } else {
          x.fillStyle = e.teinte;
          x.fillRect(0, 0, 32, 24);
          x.fillStyle = 'rgba(0,0,0,0.35)';
          x.fillRect(0, (fr * 2) % 24, 32, 3);
          x.fillStyle = '#ffffff';
          x.beginPath();
          x.moveTo(12, 6);
          x.lineTo(22, 12);
          x.lineTo(12, 18);
          x.fill();
          x.fillStyle = 'rgba(255,255,255,0.8)';
          x.fillRect(3, 20, 26 * ((t * 0.4 + e.teinte.length * 0.1) % 1), 2);
        }
        e.tex.needsUpdate = true;
      }
      camera.position.set(Math.sin(t * 0.6) * 2.5, Math.sin(t * 0.4) * 1.2, 27 - t * 1.6);
      camera.lookAt(0, 0, 0);
    }};
  },
  pluie_billets(seed) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(0.6, 0.12, -1), [60, 480]);
    const vagues = villeGrille(scene, a, seed);
    const billet = canvasTex(32, 14, (x) => {
      x.fillStyle = '#6FB765';
      x.fillRect(0, 0, 32, 14);
      x.strokeStyle = '#2F6B2C';
      x.strokeRect(1, 1, 30, 12);
      x.fillStyle = '#2F6B2C';
      x.font = 'bold 11px monospace';
      x.fillText('$', 13, 11);
    });
    const N = 420;
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 0.66), new THREE.MeshLambertMaterial({map: billet, side: THREE.DoubleSide}), N);
    scene.add(inst);
    const r = rng(seed + 11);
    const data = Array.from({length: N}, () => ({x: (r() - 0.5) * 60, y: r() * 60, z: (r() - 0.5) * 60, v: 3 + r() * 3, a: r() * 6, b: r() * 6, w: 1 + r() * 3}));
    const camera = new THREE.PerspectiveCamera(75, RW / RH, 0.1, 1500);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    return {scene, camera, maj(t) {
      vagues(t);
      const cx = 0, cy = 100, cz = 30;
      data.forEach((d, i) => {
        const y = (((d.y - d.v * t) % 60) + 60) % 60 - 10;
        e.set(d.a + t * d.w, d.b + t * d.w * 0.7, Math.sin(t * d.w + d.a) * 0.8);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(cx + d.x, cy + y - 25, cz + d.z - 20), q, s);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      const ang = 0.3 + t * 0.12;
      camera.position.set(Math.sin(ang) * 18, cy - 6 + t * 0.8, cz + Math.cos(ang) * 18);
      camera.lookAt(-Math.sin(ang) * 30, cy - 32, cz - 40);
    }};
  },
  piece_or(seed) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(0, 0.07, -1), [30, 300]);
    const anim = avenue(scene, a, seed);
    const face = canvasTex(32, 32, (x) => {
      x.fillStyle = '#E8B83A';
      x.fillRect(0, 0, 32, 32);
      x.strokeStyle = '#A9761C';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(16, 16, 13, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = '#A9761C';
      x.font = 'bold 20px monospace';
      x.fillText('$', 10, 23);
    });
    const or = {emissive: new THREE.Color('#6B4A00'), emissiveIntensity: 0.9};
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.7, 14), [lam('#D9A42C', or), new THREE.MeshLambertMaterial({map: face, ...or}), new THREE.MeshLambertMaterial({map: face, ...or})]);
    piece.rotation.x = Math.PI / 2;
    const pivot = new THREE.Group();
    pivot.add(piece);
    scene.add(pivot);
    const camera = new THREE.PerspectiveCamera(70, RW / RH, 0.1, 1200);
    return {scene, camera, maj(t) {
      anim(t);
      pivot.position.set(0, 6.5 + Math.sin(t * 2.2) * 0.6, -10);
      pivot.rotation.y = t * 3.2;
      camera.position.set(Math.sin(t * 0.5) * 3, 6, 12 - t * 1.5);
      camera.lookAt(0, 10, -10);
    }};
  },
  plage_coucher(seed) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(0, 0.05, -1), [60, 480]);
    const sable = new THREE.Mesh(new THREE.PlaneGeometry(600, 120), lam('#E2BE84'));
    sable.rotation.x = -Math.PI / 2;
    sable.position.set(0, 0.2, 40);
    scene.add(sable);
    const vagues = eau(scene, a, -20, 300, true);
    const r = rng(seed);
    for (let i = 0; i < 16; i++) {
      const p = palmier(r, 7 + r() * 4);
      p.position.set((i - 8) * 9 + (r() - 0.5) * 4, 0.2, 14 + r() * 14);
      scene.add(p);
    }
    const reflet = new THREE.Mesh(new THREE.PlaneGeometry(26, 300), basic('#FFD98A', {transparent: true, opacity: 0.35, depthWrite: false, fog: false}));
    reflet.rotation.x = -Math.PI / 2;
    reflet.position.set(0, 0.7, -170);
    scene.add(reflet);
    const camera = new THREE.PerspectiveCamera(70, RW / RH, 0.1, 1500);
    return {scene, camera, maj(t) {
      vagues(t);
      camera.position.set(-3 + t * 0.6, 3 + t * 0.9, 34 + t * 2.4);
      camera.lookAt(0, 6, -60);
    }};
  },
  plage_proche(seed) {
    const w = PLANS.plage_coucher(seed, 0);
    return {scene: w.scene, camera: w.camera, maj(t) {
      w.maj(t + 3);
      w.camera.position.set(-12 + t * 2.2, 1.4, 22);
      w.camera.lookAt(-6 + t * 2.2, 5, -40);
    }};
  },

  rue_neon(seed) {
    const scene = new THREE.Scene();
    const a = AMB.neon;
    ambiance(scene, a, new THREE.Vector3(0, 1, 0), [25, 260]);
    const anim = avenue(scene, a, seed);
    const neon = enseignes(scene, seed);
    const camera = new THREE.PerspectiveCamera(74, RW / RH, 0.1, 1200);
    return {scene, camera, maj(t) {
      anim(t);
      neon(t);
      const z = 14 - 11 * t;
      camera.position.set(-4.2 + Math.sin(t * 0.6) * 1.2, 1.5 + Math.sin(t * 1.1) * 0.15, z);
      camera.lookAt(1.5, 4.5, z - 30);
      camera.rotation.z += 0.06 + Math.sin(t * 0.8) * 0.03;
    }};
  },
  poursuite_nuit(seed) {
    const scene = new THREE.Scene();
    const a = AMB.neon;
    ambiance(scene, a, new THREE.Vector3(0, 1, 0), [25, 240]);
    avenue(scene, a, seed, 700);
    const neon = enseignes(scene, seed, 700);
    const fuyard = voiture('#FF8A1E');
    fuyard.scale.set(1.05, 0.85, 1.1);
    scene.add(fuyard);
    const flics = [voiturePolice(), voiturePolice()];
    flics.forEach((f) => scene.add(f.g));
    const camera = new THREE.PerspectiveCamera(72, RW / RH, 0.1, 1200);
    const V = 30;
    return {scene, camera, maj(t) {
      neon(t);
      const zf = 10 - V * t;
      fuyard.position.set(1.6 + Math.sin(t * 2.3) * 1.3, 0, zf);
      fuyard.rotation.y = Math.sin(t * 2.3 + 1.2) * 0.12;
      flics.forEach((f, i) => {
        f.g.position.set((i ? 2.4 : -2.0) + Math.sin(t * 2 + i) * 0.7, 0, zf + 6.5 + i * 4.5);
        f.g.rotation.y = Math.sin(t * 2 + i + 1) * 0.08;
        f.gyro(t, i);
      });
      const sec = Math.sin(t * 37) * 0.05;
      camera.position.set(-3.4 + Math.sin(t * 0.7) * 0.8, 2.3 + sec, zf + 15.5);
      camera.lookAt(0.4, 0.9, zf - 3);
      camera.rotation.z += -0.08 + sec * 0.5;
    }};
  },
  helico_nuit(seed) {
    const scene = new THREE.Scene();
    const a = AMB.nuit;
    ambiance(scene, a, new THREE.Vector3(0, 1, 0), [60, 420]);
    villeGrille(scene, a, seed, false);
    const h = helico();
    scene.add(h.g);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(7, 40, 14, 1, true), basic('#FFF7D6', {transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide}));
    cone.geometry.translate(0, -20, 0);
    scene.add(cone);
    const tache = new THREE.Mesh(new THREE.CircleGeometry(7.5, 16), basic('#FFF4C8', {transparent: true, opacity: 0.4, depthWrite: false}));
    tache.rotation.x = -Math.PI / 2;
    scene.add(tache);
    const camera = new THREE.PerspectiveCamera(66, RW / RH, 0.1, 1500);
    return {scene, camera, maj(t) {
      const hp = new THREE.Vector3(Math.sin(t * 0.4) * 6, 104 + Math.sin(t * 1.3) * 0.8, Math.cos(t * 0.3) * 4);
      h.g.position.copy(hp);
      h.g.rotation.set(0.12, 0.6 + t * 0.15, Math.sin(t * 0.9) * 0.06);
      h.rotor.rotation.y = t * 31;
      h.feu.visible = Math.floor(t * 2.5) % 2 === 0;
      const cible = new THREE.Vector3(Math.sin(t * 0.9) * 22, 0.4, -10 + Math.cos(t * 0.7) * 16);
      cone.position.copy(hp).add(new THREE.Vector3(0, -1.5, 0));
      cone.lookAt(cible);
      cone.rotateX(-Math.PI / 2);
      cone.scale.y = hp.distanceTo(cible) / 40;
      tache.position.copy(cible);
      tache.scale.setScalar(cone.scale.y);
      camera.position.set(hp.x - 17 + t * 1.1, hp.y + 1.5, hp.z + 17);
      camera.lookAt(hp.x + 1, hp.y - 9, hp.z - 5);
    }};
  },
  calendrier(seed) {
    const scene = new THREE.Scene();
    const a = AMB.coucher;
    ambiance(scene, a, new THREE.Vector3(0, 0.07, -1), [40, 320]);
    const anim = avenue(scene, a, seed);
    const r = rng(seed + 4);
    const bloc = new THREE.Group();
    const socle = new THREE.Mesh(new THREE.BoxGeometry(12.4, 14.4, 2.2), lam('#2B2E38'));
    socle.position.z = -1.2;
    bloc.add(socle);
    const anneaux = basic('#C9CED8');
    for (const x of [-4, -1.3, 1.3, 4]) {
      const an = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 4, 8), anneaux);
      an.position.set(x, 7.2, 0.2);
      bloc.add(an);
    }
    const pages: {m: THREE.Mesh; d: number; dx: number; rz: number}[] = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.PlaneGeometry(12, 14);
      g.translate(0, -7, 0);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({map: calendrierTex(seed + i * 7), side: THREE.DoubleSide}));
      m.position.set(0, 7, 0.05 + (9 - i) * 0.02);
      bloc.add(m);
      pages.push({m, d: 0.35 + i * 0.55, dx: (r() - 0.5) * 30, rz: (r() - 0.5) * 3});
    }
    bloc.position.set(0, 9, -14);
    scene.add(bloc);
    const camera = new THREE.PerspectiveCamera(68, RW / RH, 0.1, 1200);
    return {scene, camera, maj(t) {
      anim(t);
      for (const p of pages) {
        const k = Math.max(0, t - p.d);
        p.m.rotation.x = -Math.min(Math.PI * 0.9, k * 7);
        p.m.position.set(k * p.dx * 0.4, 7 + k * 6 - k * k * 9, 0.05 + k * 8);
        p.m.rotation.z = k * p.rz;
        p.m.visible = k < 2.2;
      }
      camera.position.set(Math.sin(t * 0.5) * 3, 7.5, 16 - t * 1.4);
      camera.lookAt(0, 8.5, -14);
    }};
  },
};

export type MondeRendu = {render: (t: number) => void; dispose: () => void};

export function creerMonde(plan: string, seed: number, dur: number, canvas: HTMLCanvasElement): MondeRendu {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(1);
  renderer.setSize(RW, RH, false);
  const m = (PLANS[plan] || PLANS.avenue_coucher)(seed, dur);
  return {
    render(t) {
      m.maj(t);
      renderer.render(m.scene, m.camera);
    },
    dispose() {
      m.scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm: any) => mm?.dispose?.());
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// Trame ordonnée (Bayer 4×4) + palette réduite : l'aspect « console 2000 »
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function tramer(src: HTMLCanvasElement, dst: HTMLCanvasElement, niveaux = 12) {
  const ctx = dst.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, RW, RH);
  const d = im.data;
  const pas = 255 / (niveaux - 1);
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) {
      const i = (y * RW + x) * 4;
      const b = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * pas;
      for (let k = 0; k < 3; k++) {
        const v = d[i + k] + b;
        d[i + k] = Math.max(0, Math.min(255, Math.round(v / pas) * pas));
      }
    }
  ctx.putImageData(im, 0, 0);
}
