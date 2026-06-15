import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import URDFLoader from 'urdf-loader';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const URDF_URL = 'urdf/right.urdf';

// Each finger: the revolute joints that drive it and its tip link.
// Joints are listed in slider display order (top -> bottom): for the fingers
// DIP, PIP, Abd, MCP; for the thumb IP, MCP, Abd, CMC. `label` is the joint name
// shown on the slider.
const FINGERS = [
  { key: 'thumb',  label: 'Thumb',  color: 0xff6b6b, tip: 'r_thumb_tip', joints: [
    { name: 'r_thumb_ip',       label: 'IP' },
    { name: 'r_thumb_mcp',      label: 'MCP' },
    { name: 'r_thumb_cmc_abd',  label: 'Abd' },
    { name: 'r_thumb_cmc_flex', label: 'CMC' },
  ] },
  { key: 'index',  label: 'Index',  color: 0x4c9aff, tip: 'r_index_finger_tip', joints: [
    { name: 'r_index_finger_dip',      label: 'DIP' },
    { name: 'r_index_finger_pip',      label: 'PIP' },
    { name: 'r_index_finger_mcp_abd',  label: 'Abd' },
    { name: 'r_index_finger_mcp_flex', label: 'MCP' },
  ] },
  { key: 'middle', label: 'Middle', color: 0x34d399, tip: 'r_middle_finger_tip', joints: [
    { name: 'r_middle_finger_dip',      label: 'DIP' },
    { name: 'r_middle_finger_pip',      label: 'PIP' },
    { name: 'r_middle_finger_mcp_abd',  label: 'Abd' },
    { name: 'r_middle_finger_mcp_flex', label: 'MCP' },
  ] },
  { key: 'ring',   label: 'Ring',   color: 0xfbbf24, tip: 'r_ring_finger_tip', joints: [
    { name: 'r_ring_finger_dip',      label: 'DIP' },
    { name: 'r_ring_finger_pip',      label: 'PIP' },
    { name: 'r_ring_finger_mcp_abd',  label: 'Abd' },
    { name: 'r_ring_finger_mcp_flex', label: 'MCP' },
  ] },
  { key: 'pinky',  label: 'Pinky',  color: 0xc084fc, tip: 'r_pinky_tip', joints: [
    { name: 'r_pinky_dip',      label: 'DIP' },
    { name: 'r_pinky_pip',      label: 'PIP' },
    { name: 'r_pinky_mcp_abd',  label: 'Abd' },
    { name: 'r_pinky_mcp_flex', label: 'MCP' },
  ] },
];

const colorHex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
const viewer = document.getElementById('viewer');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.001, 100);
camera.position.set(0.18, 0.12, 0.25);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// Lighting
scene.add(new THREE.HemisphereLight(0xffffff, 0x33373d, 1.1));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(0.3, 0.5, 0.4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-0.3, 0.2, -0.4);
scene.add(fillLight);

// Grid (placed at the base of the model once it loads)
const grid = new THREE.GridHelper(0.6, 24, 0x3a4250, 0x232a33);
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

// Root group: converts URDF Z-up into Three.js Y-up.
const root = new THREE.Group();
root.rotation.x = -Math.PI / 2;
scene.add(root);

// Holds the range-of-motion envelope surfaces (world coordinates).
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let robot = null;
const meshes = [];            // every visual THREE.Mesh
const fingerEnvelopes = {};   // key -> THREE.Mesh (convex-hull range-of-motion surface)
let skeleton = null;          // { points: Points, lines: LineSegments, bones: [[linkA, linkB], ...] }

const ui = {
  toggleMeshes: document.getElementById('toggle-meshes'),
  meshOpacity: document.getElementById('mesh-opacity'),
  toggleSkeleton: document.getElementById('toggle-skeleton'),
  toggleGrid: document.getElementById('toggle-grid'),
  fingerToggles: document.getElementById('finger-toggles'),
  jointSliders: document.getElementById('joint-sliders'),
  resetPose: document.getElementById('reset-pose'),
  loading: document.getElementById('loading'),
  loadingText: document.getElementById('loading-text'),
};

// ---------------------------------------------------------------------------
// Load the URDF
// ---------------------------------------------------------------------------
const manager = new THREE.LoadingManager();
const loader = new URDFLoader(manager);

loader.loadMeshCb = (path, mgr, urdfMaterial, done) => {
  new STLLoader(mgr).load(
    path,
    (geometry) => {
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: 0xcfd6dd,
        metalness: 0.15,
        roughness: 0.55,
        transparent: true,
        opacity: parseFloat(ui.meshOpacity.value),
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      meshes.push(mesh);
      done(mesh);
    },
    undefined,
    (err) => done(null, err),
  );
};

loader.load(URDF_URL, (result) => {
  robot = result;
  root.add(robot);

  scene.updateMatrixWorld(true);

  buildJointSliders();
  buildFingerToggles();
  buildSkeleton();

  manager.onLoad = onAssetsReady;
  // If meshes were cached / already done, fire manually.
  if (meshes.length > 0 && manager.itemsLoaded >= manager.itemsTotal) onAssetsReady();
});

let assetsReady = false;
function onAssetsReady() {
  if (assetsReady) return;
  assetsReady = true;
  scene.updateMatrixWorld(true);
  frameCamera();
  positionGrid();
  applyMeshOpacity(parseFloat(ui.meshOpacity.value));
  setMeshVisibility(ui.toggleMeshes.checked);
  computeAllEnvelopes();
  ui.loading.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// Camera framing
// ---------------------------------------------------------------------------
function frameCamera() {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length() || 0.3;

  controls.target.copy(center);
  const dir = new THREE.Vector3(0.6, 0.45, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, size * 1.1);
  camera.near = size / 100;
  camera.far = size * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

function positionGrid() {
  const box = new THREE.Box3().setFromObject(root);
  grid.position.set(0, box.min.y, 0);
}

// ---------------------------------------------------------------------------
// Joint sliders
// ---------------------------------------------------------------------------
function buildJointSliders() {
  ui.jointSliders.innerHTML = '';
  for (const finger of FINGERS) {
    const group = document.createElement('div');
    group.className = 'joint-group';

    const title = document.createElement('div');
    title.className = 'joint-group-title';
    title.innerHTML = `<span class="dot" style="background:${colorHex(finger.color)}"></span>${finger.label}`;
    group.appendChild(title);

    for (const { name: jointName, label } of finger.joints) {
      const joint = robot.joints[jointName];
      if (!joint) continue;
      // Slider values are in degrees; the URDF (and setJointValue) use radians.
      const lowerDeg = THREE.MathUtils.radToDeg(Number(joint.limit.lower));
      const upperDeg = THREE.MathUtils.radToDeg(Number(joint.limit.upper));

      const wrap = document.createElement('div');
      wrap.className = 'joint';

      const head = document.createElement('div');
      head.className = 'joint-head';
      const valSpan = document.createElement('span');
      valSpan.className = 'joint-val';
      valSpan.textContent = '0°';
      head.innerHTML = `<span>${label}</span>`;
      head.appendChild(valSpan);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = lowerDeg;
      slider.max = upperDeg;
      slider.step = 1;
      slider.value = 0;

      slider.addEventListener('input', () => {
        const deg = parseFloat(slider.value);
        robot.setJointValue(jointName, THREE.MathUtils.degToRad(deg));
        valSpan.textContent = `${Math.round(deg)}°`;
        scene.updateMatrixWorld(true);
        updateSkeleton();
      });

      wrap.appendChild(head);
      wrap.appendChild(slider);
      group.appendChild(wrap);

      slider._jointName = jointName;
      slider._valSpan = valSpan;
    }
    ui.jointSliders.appendChild(group);
  }
}

ui.resetPose.addEventListener('click', () => {
  ui.jointSliders.querySelectorAll('input[type="range"]').forEach((slider) => {
    slider.value = 0;
    robot.setJointValue(slider._jointName, 0);
    slider._valSpan.textContent = '0°';
  });
  scene.updateMatrixWorld(true);
  updateSkeleton();
});

// ---------------------------------------------------------------------------
// Kinematic skeleton (lines between connected link origins + joint nodes)
// ---------------------------------------------------------------------------
function buildSkeleton() {
  const bones = [];
  const nodes = new Set();
  for (const name in robot.joints) {
    const joint = robot.joints[name];
    const parentLink = joint.parent;                       // URDFLink Object3D
    const childLink = joint.children.find((c) => c.isURDFLink);
    if (parentLink && childLink) {
      bones.push([parentLink, childLink]);
      nodes.add(parentLink);
      nodes.add(childLink);
    }
  }
  const nodeList = [...nodes];

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bones.length * 6), 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, depthTest: false });
  const lines = new THREE.LineSegments(lineGeom, lineMat);
  lines.renderOrder = 5;
  scene.add(lines);

  // A solid sphere dot at every joint origin (rotation center).
  const dotGeom = new THREE.SphereGeometry(1, 14, 14);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff9f1c, depthTest: false });
  const dots = new THREE.InstancedMesh(dotGeom, dotMat, nodeList.length);
  dots.frustumCulled = false;
  dots.renderOrder = 6;
  scene.add(dots);

  skeleton = { bones, nodeList, lines, dots };
  updateSkeleton();
  setSkeletonVisibility(ui.toggleSkeleton.checked);
}

const DOT_RADIUS = 0.0017;             // metres
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _scale = new THREE.Vector3(DOT_RADIUS, DOT_RADIUS, DOT_RADIUS);
function updateSkeleton() {
  if (!skeleton) return;
  const lp = skeleton.lines.geometry.attributes.position;
  skeleton.bones.forEach(([a, b], i) => {
    a.getWorldPosition(_v); lp.setXYZ(i * 2, _v.x, _v.y, _v.z);
    b.getWorldPosition(_v); lp.setXYZ(i * 2 + 1, _v.x, _v.y, _v.z);
  });
  lp.needsUpdate = true;

  skeleton.nodeList.forEach((n, i) => {
    n.getWorldPosition(_v);
    _m.compose(_v, _q, _scale);
    skeleton.dots.setMatrixAt(i, _m);
  });
  skeleton.dots.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Range-of-motion envelopes
// For each finger we Monte-Carlo sample its joint space, collect the resulting
// fingertip positions, and wrap them in a convex hull -> a smooth translucent
// surface showing the reachable volume.
// ---------------------------------------------------------------------------
const ENVELOPE_SAMPLES = 4000;

function computeAllEnvelopes() {
  // Save the current pose so sampling does not disturb what the user set.
  const saved = {};
  for (const finger of FINGERS) {
    for (const j of finger.joints) saved[j.name] = robot.joints[j.name].angle;
  }

  for (const finger of FINGERS) {
    computeFingerEnvelope(finger, saved);
  }

  // Restore.
  for (const jn in saved) robot.setJointValue(jn, saved[jn]);
  scene.updateMatrixWorld(true);
  updateSkeleton();
}

function computeFingerEnvelope(finger, saved) {
  const tipLink = robot.links[finger.tip];
  if (!tipLink) return;

  const limits = finger.joints.map(({ name }) => {
    const j = robot.joints[name];
    return { name, lower: Number(j.limit.lower), upper: Number(j.limit.upper) };
  });

  const points = [];
  const tmp = new THREE.Vector3();
  for (let s = 0; s < ENVELOPE_SAMPLES; s++) {
    for (const lim of limits) {
      robot.setJointValue(lim.name, lim.lower + Math.random() * (lim.upper - lim.lower));
    }
    robot.updateMatrixWorld(true);
    tipLink.getWorldPosition(tmp);
    points.push(tmp.clone());
  }
  // Reset this finger to the saved pose before moving on.
  for (const lim of limits) robot.setJointValue(lim.name, saved[lim.name]);

  // Replace any existing envelope for this finger.
  if (fingerEnvelopes[finger.key]) {
    cloudGroup.remove(fingerEnvelopes[finger.key]);
    fingerEnvelopes[finger.key].geometry.dispose();
    fingerEnvelopes[finger.key].material.dispose();
  }

  let geom;
  try {
    geom = new ConvexGeometry(points);
  } catch (e) {
    console.warn(`Could not build envelope for ${finger.key}:`, e);
    return;
  }
  geom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: finger.color,
    metalness: 0.0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const envelope = new THREE.Mesh(geom, mat);
  envelope.renderOrder = 2;
  envelope.visible = isFingerActive(finger.key);
  fingerEnvelopes[finger.key] = envelope;
  cloudGroup.add(envelope);
}

// ---------------------------------------------------------------------------
// Finger toggle buttons
// ---------------------------------------------------------------------------
const activeFingers = new Set();   // envelopes off by default

function isFingerActive(key) { return activeFingers.has(key); }

function buildFingerToggles() {
  ui.fingerToggles.innerHTML = '';
  for (const finger of FINGERS) {
    const btn = document.createElement('button');
    btn.className = 'finger-btn';
    btn.style.color = colorHex(finger.color);
    btn.innerHTML = `<span class="dot" style="background:${colorHex(finger.color)}"></span>${finger.label}`;
    btn.addEventListener('click', () => {
      if (activeFingers.has(finger.key)) {
        activeFingers.delete(finger.key);
        btn.classList.remove('active');
      } else {
        activeFingers.add(finger.key);
        btn.classList.add('active');
      }
      if (fingerEnvelopes[finger.key]) fingerEnvelopes[finger.key].visible = activeFingers.has(finger.key);
    });
    ui.fingerToggles.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Display toggles
// ---------------------------------------------------------------------------
function setMeshVisibility(visible) {
  for (const m of meshes) m.visible = visible;
}
function applyMeshOpacity(opacity) {
  for (const m of meshes) {
    m.material.opacity = opacity;
    m.material.transparent = opacity < 1;
    m.material.depthWrite = opacity >= 1;
    m.material.needsUpdate = true;
  }
}
function setSkeletonVisibility(visible) {
  if (!skeleton) return;
  skeleton.lines.visible = visible;
  skeleton.dots.visible = visible;
}

ui.toggleMeshes.addEventListener('change', () => setMeshVisibility(ui.toggleMeshes.checked));
ui.meshOpacity.addEventListener('input', () => applyMeshOpacity(parseFloat(ui.meshOpacity.value)));
ui.toggleSkeleton.addEventListener('change', () => setSkeletonVisibility(ui.toggleSkeleton.checked));
ui.toggleGrid.addEventListener('change', () => { grid.visible = ui.toggleGrid.checked; });

// ---------------------------------------------------------------------------
// Render loop & resize
// ---------------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
