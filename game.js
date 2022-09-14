import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/110/three.module.js';

import {
  Noise
} from 'https://1florki.github.io/jsutils2/noise.js'



/*
* TODO:
*
*/

/*
Menu:
- play levels
- Play random
- Play found
- play loaded


Pause menu:
- skip level
- (share levels)
- light/dark theme
- back to menu
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

    this.pixelRatio = opt.pixelRatio || 1;

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
    p.acc.x = (this.noise.getValue(p.pos.x, p.pos.y + 23) + 0.002) * dt * 60.0;
    p.acc.y = this.noise.getValue(p.pos.x + 100, p.pos.y) * dt * 60.0;
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

      this.scales[i] = p.time / p.maxTime * 0.025 * p.size * this.pixelRatio

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
  clock, particles = [],
  player, playerPart, active = 0,
  size, stop = true,
  stats;

let levelIndex = 0;

let currentLevel = 0;

const mainLevels = [100];
let ownLevels;
let loadedLevels;

// 0 => main levels
// 1 => random levels
// 2 => own levels
// 3 => loaded levels
let levelType = 0;

let darkMode = true;

let goal, borders = [],
  mainButtons = [];

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
  document.body.appendChild(renderer.domElement);

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.gammaFactor = 2.2;
  renderer.outputEncoding = THREE.sRGBEncoding;

  scene = new THREE.Scene();

  scene.background = darkModeSettings.background;
  //scene.fog = new THREE.Fog(fogColor, 4.5, 4.7);

  size = new THREE.Vector3(10, 3.5, 10);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20);
  updateCamera()
  camera.position.z = 9

  clock = new THREE.Clock();

  setupGame();
  setupEvents();

  let params = new URLSearchParams(location.search);
  let theme = params.get('theme');

  darkMode = (theme != "light");


  let loaded = params.get('levels');
  if (loaded) {
    loadedLevels = intArrayFromString(loaded)
    console.log("loaded levels");
    console.log(loadedLevels);
  }

  updateTheme();

  ownLevels = intArrayFromString(localStorage.getItem('ownLevels')) || [];

  console.log("found levels");
  console.log(ownLevels);
}

function intArrayFromString(s) {
  if (s) {
    let stringArray = s.split(",");
    let intArray = [];
    for (let l of stringArray) {
      let num = parseInt(l);
      if (num != NaN) {
        intArray.push(num);
      }
    }
    return intArray;
  }
}

function setupEvents() {
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCamera()
  }, false);

  document.addEventListener("keydown", (event) => {
    keys[event.key] = true
    if (event.key == " ") {
      switchActive();
    }
    if (event.key == "p") {
      if (stop) resumeGame()
      else pauseGame();
    }
    if (event.key == "s") {
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
      particles[1].newNoise(s1 + 1);
      console.log("random level [" + s1 + "]");
      resetPlayer();
    }
  }, false);

  renderer.domElement.addEventListener("mouseup", (event) => {
    switchActive();
  });

  document.addEventListener("touchend", (event) => {
    switchActive();
  });


  let pauseButton = document.getElementById("pause");
  pauseButton.onclick = () => {
    if (stop) resumeGame()
    else pauseGame();
  }

  let button1 = document.getElementById("button1");

  button1.onclick = () => {
    resumeGame();
  }

  let button2 = document.getElementById("button2");

  button2.onclick = () => {
    levelType = 1
    nextLevel()
    resumeGame();
  }

  let button3 = document.getElementById("button3");

  button3.onclick = () => {
    levelIndex = 0
    levelType = 2
    nextLevel();
    resumeGame();
  }

}

function setupGame() {

  let part1 = new Particles({
    size: size,
    seed: 0,
    pixelRatio: window.devicePixelRatio
  });
  let part2 = new Particles({
    size: size,
    seed: 0,
    pixelRatio: window.devicePixelRatio
  });

  particles.push(part1);
  particles.push(part2);

  part1.mesh.matrixAutoUpdate = false
  part2.mesh.matrixAutoUpdate = false
  scene.add(part1.mesh);
  scene.add(part2.mesh);

  switchActive();
  nextLevel();

  player = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.23, 16), new THREE.MeshBasicMaterial({
    color: 0xffffff,
  }))
  playerPart = new Particle();
  playerPart.pos.set(-size.x * 5 / 6, 0, 0);
  playerPart.time = 1000000;
  scene.add(player);


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

function pauseGame() {
  stop = true;
  let buttonDiv = document.getElementById("buttonDiv");
  buttonDiv.style.display = "inline-block"

  let pauseButton = document.getElementById("pause");
  pauseButton.style.display = "none"
}

function resumeGame() {

  let buttonDiv = document.getElementById("buttonDiv");
  buttonDiv.style.display = "none"
  stop = false

  let pauseButton = document.getElementById("pause");
  pauseButton.style.display = "inline-block"
}

function playLevel(x) {
  particles[0].newNoise(x);
  particles[1].newNoise(x + 1);

  console.log("playing level " + x);
  
  let level = document.getElementById("level");
  level.innerHTML = x
}

function nextLevel() {

  // 0 => main levels
  // 1 => random levels
  // 2 => own levels
  // 3 => loaded levels
  if (levelType == 0) {
    if (levelIndex >= mainLevels.length) levelIndex = 0;

    currentLevel = mainLevels[levelIndex];
    playLevel(currentLevel);
    levelIndex++;
  } else if (levelType == 1) {
    currentLevel = Math.floor(Math.random() * 1000000);
    playLevel(currentLevel);
  } else if (levelType == 2) {
    console.log(levelIndex)
    if (levelIndex >= ownLevels.length) {
      levelType = 1;
      nextLevel();
      console.log("hi")
      return;
    }
    
    currentLevel = ownLevels[levelIndex];
    playLevel(currentLevel);
    levelIndex++;

  } else if (levelType == 3) {

  }
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
  playerPart.pos.set(-size.x * 9 / 10, 0, 0);
  playerPart.time = 1000000;
}

function saveLevel(x) {
  if(levelType == 1) {
    ownLevels.push(x);
    localStorage.setItem('ownLevels', ownLevels);
  }
}

function updateCamera() {
  let aspect = window.innerWidth / window.innerHeight;
  camera.top = size.x + 0.5;
  camera.bottom = -(size.x + 0.5);
  camera.right = size.x + 0.5;
  camera.left = -(size.x + 0.5);
  if (aspect > 1) {
    camera.top = (size.x + 0.5) / aspect
    camera.bottom = -(size.x + 0.5) / aspect
    camera.rotation.z = 0
  } else {
    camera.right = (size.x + 0.5) * aspect
    camera.left = -(size.x + 0.5) * aspect
    camera.rotation.z = Math.PI / 2
  }
  camera.updateProjectionMatrix();
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

    particles[active].applyNoiseForce(playerPart, dt);
    playerPart.update(dt, particles[active].maxSpeed);
    player.position.copy(playerPart.pos);
    if (playerPart.isDead(size)) {
      if (playerPart.pos.x >= size.x) {
        saveLevel(currentLevel);
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

setupScene();
animate();
