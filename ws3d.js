// Shared 3D wingsuit layer.
//
// The planner draws the pilot icon in every filled slot. Rather than a flat
// SVG per slot, this module renders ALL pilots through ONE WebGLRenderer: a
// single transparent <canvas> overlaid on the formation grid, an orthographic
// camera looking straight down (1 world unit == 1 CSS pixel), and one extruded
// wingsuit model per filled cell positioned over its slot. The model is the
// same silhouette as ws() in app.js, given depth — body in the pilot's suit
// colour, a slate back-rig riding the spine, and dark vents + head.
//
// app.js calls window.WS3D.sync(wrap, pilots, W, H) at the end of render().
// The flat ws() SVG stays in each slot underneath this canvas, so it shows
// through as a fallback when WebGL/modules are unavailable (e.g. file://) and
// serves as the drag image while a pilot is dragged.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// the icon markup, matching app.js ws() plus the slate back-rig (path index 1,
// the shortened centre panel). Fills here are placeholders — materials are
// assigned by path index below, and the body colour is set per pilot.
const ICON = `<svg viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"><g transform="translate(28,28)">
<path d="M-3.5,-15 Q-12,-15 -22,-12 L-14,8 L-14,22 L14,22 L14,8 L22,-12 Q12,-15 3.5,-15 Z" fill="#2b4fd8"/>
<path d="M-3.5,-14 L3.5,-14 L4.8,-2 L-4.8,-2 Z" fill="#39404f"/>
<ellipse cx="-20" cy="-11" rx="1.6" ry="1.2" fill="#2a2f38"/>
<ellipse cx="20" cy="-11" rx="1.6" ry="1.2" fill="#2a2f38"/>
<ellipse cx="-13" cy="21" rx="1.6" ry="1.2" fill="#2a2f38"/>
<ellipse cx="13" cy="21" rx="1.6" ry="1.2" fill="#2a2f38"/>
<circle cx="0" cy="-19" r="3" fill="#2a2f38"/>
</g></svg>`;

const PX = 40 / 56;   // viewBox unit -> px; reproduces the old 40px slot icon
const DB = 3;         // body slab thickness, in icon units (toward the camera)

// materials: rig + dark are shared; body is cached per suit colour
const rigMat  = new THREE.MeshStandardMaterial({ color: 0x39404f, roughness: 0.62, metalness: 0.06, side: THREE.DoubleSide });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.5, side: THREE.DoubleSide });
const bodyMats = new Map();
function bodyMat(color){
  let m = bodyMats.get(color);
  if (!m){
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.42, metalness: 0.12, side: THREE.DoubleSide });
    bodyMats.set(color, m);
  }
  return m;
}

// build the pilot once; each filled slot gets a lightweight clone (clones share
// geometry + materials, only the body material is swapped to the suit colour)
function buildTemplate(){
  const tmpl = new THREE.Group();
  const paths = new SVGLoader().parse(ICON).paths;
  paths.forEach((path, pi) => {
    const isBody = pi === 0, isRig = pi === 1;
    const depth = isRig ? 2.6 : DB;
    SVGLoader.createShapes(path).forEach(shape => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: isRig ? 0.9 : (isBody ? 0.45 : 0.3),
        bevelSize:      isRig ? 0.7 : (isBody ? 0.35 : 0.25),
        bevelSegments:  isRig ? 5 : 3,
        curveSegments: 18,
      });
      geo.translate(-28, -28, -depth / 2);   // viewBox centre -> origin; slab centred on z=0
      const mesh = new THREE.Mesh(geo, isBody ? bodyMat('#2b4fd8') : (isRig ? rigMat : darkMat));
      if (isBody) mesh.name = 'body';
      else if (isRig) mesh.position.z = DB / 2 + 0.2;   // bulge off the back (toward camera)
      else mesh.position.z = 0.25;                      // vents/head sit just proud
      tmpl.add(mesh);
    });
  });
  return tmpl;
}

let renderer, scene, camera, pilotGroup, tmpl;
let curW = 0, curH = 0, lastSig = '';

function init(){
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:4;';

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);  // upper-left (world y is down), toward viewer
  key.position.set(-0.5, -0.8, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8aa0c8, 0.4);
  fill.position.set(0.6, 0.5, 0.7);
  scene.add(fill);

  // ortho camera; near<0 so the camera at the origin sees the thin slabs in z
  camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);
  pilotGroup = new THREE.Group();
  scene.add(pilotGroup);
  tmpl = buildTemplate();
}

function resize(W, H){
  if (W === curW && H === curH) return;
  curW = W; curH = H;
  renderer.setSize(W, H);                 // top=0, bottom=H -> world y runs downward, matching CSS px
  camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H;
  camera.updateProjectionMatrix();
}

// pilots: [{x, y, color}] in CSS px (icon centre); W,H = canvas size in px
function sync(wrap, pilots, W, H){
  if (!renderer) init();
  if (renderer.domElement.parentNode !== wrap) wrap.appendChild(renderer.domElement);  // wrap is rebuilt each render
  resize(W, H);

  const sig = W + 'x' + H + '|' + pilots.map(p => p.x + ',' + p.y + ',' + p.color).join(';');
  if (sig !== lastSig){
    lastSig = sig;
    for (let i = pilotGroup.children.length - 1; i >= 0; i--) pilotGroup.remove(pilotGroup.children[i]);
    // pilots arrive in row-major order; nudge each one slightly toward the
    // camera so later cells (lower rows, tucked diamonds) layer over earlier
    // ones — matching how the flat SVG slots stacked in DOM order
    pilots.forEach((p, i) => {
      const g = tmpl.clone();
      g.getObjectByName('body').material = bodyMat(p.color);
      g.scale.setScalar(PX);
      g.position.set(p.x, p.y, i * 0.3);
      pilotGroup.add(g);
    });
  }
  renderer.render(scene, camera);
}

window.WS3D = { sync };
window.dispatchEvent(new Event('ws3d-ready'));
