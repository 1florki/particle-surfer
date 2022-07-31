import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/110/three.module.js';

import {
  Noise
} from 'https://1florki.github.io/jsutils2/noise.js'
/*
import {
  Gradient
} from 'https://1florki.github.io/threejsutils/gradient.js'
*/

class Particle {
  constructor(opt) {
    opt = opt || {};

    this.pos = new THREE.Vector3(0, 0, 0);
    this.speed = new THREE.Vector3(0, 0, 0);
    this.acc = new THREE.Vector3(0, 0, 0);
    this.time = opt.time || Math.random() * 2;
    this.maxTime = this.time

    this.size = Math.max(Math.pow(Math.random(), 2) * 7, 3)
    if (opt.size) this.reset(opt.size);
  }

  reset(size) {
    this.setPos((Math.random() - 0.5) * 2 * size.x, (Math.random() - 0.5) * 2 * size.y, 0);
    this.acc.set(0, 0, 0);
    this.speed.set(0, 0, 0);
    this.time = Math.random() * 3.8 + 0.7
    this.maxTime = this.time
  }


  setPos(x, y, z) {
    this.pos.set(x, y, z);
  }
  update(dt, maxSpeed) {
    this.speed.add(this.acc);
    this.speed.clampLength(0, maxSpeed);
    this.pos.add(this.speed);

    this.time -= dt;
  }
  isDead(size) {
    return (Math.abs(this.pos.x) > size.x || Math.abs(this.pos.y) > size.y || this.time < 0)
  }
}

class Particles {
  constructor(opt) {
    opt = opt || {};

    this.num = opt.num || 6000;
    this.size = opt.size || new THREE.Vector3(1, 1, 1);

    this.maxSpeed = opt.maxSpeed || 0.033;

    this.newNoise(opt.seed || 0);

    this.alphaMult = 1

    this.dark = true

    this.createParticles();
  }
  newNoise(seed) {
    this.noise = new Noise({
      min: -0.01,
      max: 0.01,
      scale: 0.15,
      octaves: 2,
      persistence: 0.7,
      seed: seed
    })
  }
  applyNoiseForce(p, dt) {
    p.acc.x = (this.noise.getValue(p.pos.x, p.pos.y + 23) + 0.002);
    p.acc.y = this.noise.getValue(p.pos.x + 100, p.pos.y);
  }

  createParticles() {
    this.parts = [];
    this.scales = new Float32Array(this.num);
    this.alpha = new Float32Array(this.num);
    this.colorData = new Float32Array(this.num * 3);
    this.positionData = new Float32Array(this.num * 3);


    for (let i = 0; i < this.num; i++) {
      this.parts.push(new Particle({
        size: this.size
      }));
      this.scales[i] = 1
      this.alpha[i] = 0.5
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positionData, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colorData, 3));
    this.geo.setAttribute('scale', new THREE.BufferAttribute(this.scales, 1));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      vertexShader: document.getElementById('vertexshader').textContent,
      fragmentShader: document.getElementById('fragmentshader').textContent
    });

    this.mesh = new THREE.Points(this.geo, material);
  }
  update(dt, num) {
    for (let i = 0; i < this.num; i++) {
      let p = this.parts[i];

      this.applyNoiseForce(p, dt);
      p.update(dt, this.maxSpeed);

      this.positionData[i * 3] = p.pos.x;
      this.positionData[i * 3 + 1] = p.pos.y;
      this.positionData[i * 3 + 2] = p.pos.z;

      if (this.dark) {
        this.colorData[i * 3] = num * ((p.acc.x + 0.01) * 80 + 0.2);
        this.colorData[i * 3 + 1] = (1 - num) * ((p.acc.x + 0.01) * 80 + 0.2);
        this.colorData[i * 3 + 2] = (p.acc.y + 0.01) * 50 + 0.2;
      } else {
        this.colorData[i * 3] = num * (0.5 - (p.acc.x + 0.01) * 80 + 0.2) + (1 - num) * (p.acc.x + 0.01) * 80;
        this.colorData[i * 3 + 1] = (p.acc.y + p.acc.x) * 80;
        this.colorData[i * 3 + 2] = num * (p.acc.y + 0.01) * 50 + 0.2;
      }

      this.scales[i] = p.time / p.maxTime * 0.025 * p.size

      this.alpha[i] = Math.min((p.maxTime - p.time) * 2, 1) * this.alphaMult

      if (p.isDead(this.size) || this.scales[i] < 0.05) {
        p.reset(this.size);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.scale.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }

}


var renderer, scene, light, camera, keys = {},
  mesh, camNode, clock, particles = [],
  player, playerPart, active = 0,
  size, stop = false,
  stats;

const levels = [[15693, 83395], [54971, 5891], [29338, 42504], [87125, 3695], [12641, 84336], [81706, 92840], [81342, 18215], [68226, 9387], [50415, 61135], [40356, 68917], [21870, 34087], [77604, 4641], [35813, 32668], [78288, 60840], [83166, 59559], [14271, 26324], [43298, 94833], ];

let level = 0;

let viewSize = 10.5

let darkMode = true;

let goal, borders = [];

const darkModeSettings = {
  background: new THREE.Color(0x000000).convertSRGBToLinear(),
  border: new THREE.Color(0x999999).convertSRGBToLinear(),
  goal: new THREE.Color(0xffffff).convertSRGBToLinear(),
  player: new THREE.Color(0xffffff).convertSRGBToLinear(),
}

const lightModeSettings = {
  background: new THREE.Color(0xffffff).convertSRGBToLinear(),
  border: new THREE.Color(0xbbbbbb).convertSRGBToLinear(),
  goal: new THREE.Color(0x000000).convertSRGBToLinear(),
  player: new THREE.Color(0x000000).convertSRGBToLinear(),
}

function setupScene() {
  stats = new Stats();
  document.body.appendChild(stats.dom);


  renderer = new THREE.WebGLRenderer({
    antialising: false,
    depth: false
  });

  renderer.autoClear = true

  renderer.setSize(window.innerWidth, window.innerHeight);
  //renderer.setPixelRatio(window.devicePixelRatio);
  renderer.gammaFactor = 2.2;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', onResize, false);

  scene = new THREE.Scene();

  document.addEventListener("keydown", (event) => {
    keys[event.key] = true
    if (event.key == " ") {
      switchActive();
    }
    if (event.key == "s") {
      stop = !stop;
    }
    if (event.key == "l") {
      nextLevel();
    }
    if (event.key == "t") {
      darkMode = !darkMode
      updateTheme();
    }
    if (event.key == "f") {
      toggleFullScreen();
      console.log("hi")
    }
    if (event.key == "r") {
      let s1 = Math.floor(Math.random() * 100000);
      let s2 = Math.floor(Math.random() * 100000);
      particles[0].newNoise(s1);
      particles[1].newNoise(s2);
      console.log("random level [" + s1 + ", " + s2 + "]");
      resetPlayer();
    }
  }, false);

  document.addEventListener("mouseup", (event) => {
    switchActive();
  });

  scene.background = darkModeSettings.background;
  //scene.fog = new THREE.Fog(fogColor, 4.5, 4.7);

  size = new THREE.Vector3(10, 3.5, 10);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20);
  updateCamera()
  camera.position.z = 9

  clock = new THREE.Clock();

  let part1 = new Particles({
    size: size,
    seed: levels[level][0]
  });
  let part2 = new Particles({
    size: size,
    seed: levels[level][1]
  });

  particles.push(part1);
  particles.push(part2);
  
  part1.mesh.matrixAutoUpdate = false
  part2.mesh.matrixAutoUpdate = false
  scene.add(part1.mesh);
  scene.add(part2.mesh);
  switchActive();
  // new THREE.SphereGeometry(0.15, 8, 8)
  player = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.23, 16), new THREE.MeshBasicMaterial({
    color: 0xffffff,
  }))
  playerPart = new Particle();
  playerPart.pos.set(-size.x * 5 / 6, 0, 0);
  playerPart.time = 1000000;
  scene.add(player);

  let borderColor = 0x444444 //0xcf1020
  let goalColor = 0xffffff //0xcf1020
  let border = new THREE.Mesh(new THREE.BoxGeometry(size.x * 2, 0.1, 0.15), new THREE.MeshBasicMaterial({
    color: darkModeSettings.border
  }));
  border.position.y = size.y;
  scene.add(border);
  borders.push(border)
  border.updateMatrix()
  border.matrixAutoUpdate = false

  let border2 = border.clone();
  border2.position.y = -size.y;
  scene.add(border2)
  borders.push(border2)
  border2.updateMatrix()
  border2.matrixAutoUpdate = false

  let border3 = new THREE.Mesh(new THREE.BoxGeometry(0.1, size.y * 2 + 0.1, 0.15), new THREE.MeshBasicMaterial({
    color: darkModeSettings.border
  }));
  border3.position.x = -size.x;
  scene.add(border3)
  borders.push(border3)
  border3.updateMatrix()
  border3.matrixAutoUpdate = false

  goal = new THREE.Mesh(new THREE.BoxGeometry(0.1, size.y * 2 + 0.1, 0.15), new THREE.MeshBasicMaterial({
    color: darkModeSettings.goal
  }));
  goal.position.x = size.x;
  scene.add(goal)
  goal.updateMatrix()
  goal.matrixAutoUpdate = false

  let params = new URLSearchParams(location.search);
  let theme = params.get('theme')
  darkMode = theme != "light"
  updateTheme();
}

function updateTheme() {
  if (darkMode) {
    scene.background = darkModeSettings.background
    goal.material.color = darkModeSettings.goal
    for (let b of borders) {
      b.material.color = darkModeSettings.border
    }

    player.material.color = darkModeSettings.player

    for (let p of particles) {
      p.dark = true
    }
  } else {
    scene.background = lightModeSettings.background
    goal.material.color = lightModeSettings.goal
    for (let b of borders) {
      b.material.color = lightModeSettings.border
    }

    player.material.color = lightModeSettings.player
    for (let p of particles) {
      p.dark = false
    }
  }
}

function nextLevel() {
  level++;
  if (level >= levels.length) level = 0;

  particles[0].newNoise(levels[level][0]);
  particles[1].newNoise(levels[level][1]);
  console.log("level: " + level + " [" + levels[level][0] + ", " + levels[level][1] + "]");
}

function switchActive() {
  active++;
  if (active >= particles.length) active = 0;
  for (let i = 0; i < particles.length; i++) {
    //particles[i].mesh.material.size = 1.7;
    particles[i].alphaMult = 0.0;
    //particles[i].mesh.position.z = -0.1;
  }
  particles[active].alphaMult = 1;
  //particles[active].mesh.material.size = 1.7;
  particles[active].mesh.position.z = 0;
}

function resetPlayer() {
  playerPart.reset(size);
  playerPart.pos.set(-size.x * 5 / 6, 0, 0);
  playerPart.time = 1000000;
}

function animate(now) {
  requestAnimationFrame(animate);

  // animation loop here

  let dt = clock.getDelta();

  //console.log(dt * 30)
  //console.log(dt);
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].shouldUpdate != false) particles[i].update(dt, i);

    if (particles[i].alphaMult <= 0) particles[i].shouldUpdate = false
    else particles[i].shouldUpdate = true
  }
  if (!stop) {

    particles[active].applyNoiseForce(playerPart);
    playerPart.update(dt, particles[active].maxSpeed);
    player.position.copy(playerPart.pos);
    if (playerPart.isDead(size)) {
      if (playerPart.pos.x >= size.x) {
        nextLevel();
      }
      resetPlayer();
    }
    //camera.position.x = (playerPart.pos.x + camera.position.x * 49) / 50;
  }
  //console.log(playerPart.pos);
  renderer.render(scene, camera);
  stats.update();
}

function updateCamera() {
  let aspect = window.innerWidth / window.innerHeight;
  camera.top = viewSize;
  camera.bottom = -viewSize;
  camera.right = viewSize;
  camera.left = -viewSize;
  if (aspect > 1) {
    camera.top = viewSize / aspect
    camera.bottom = -viewSize / aspect
    camera.rotation.z = 0
  } else {
    camera.right = viewSize * aspect
    camera.left = -viewSize * aspect
    camera.rotation.z = Math.PI / 2
  }
  camera.updateProjectionMatrix();
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCamera()
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}
setupScene();
animate();
