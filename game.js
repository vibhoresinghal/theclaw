const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

// Constants must be defined first
const CLAW_Y_TOP = 40;
const CLAW_SPEED = 3.5;
const GRAB_RADIUS = 55;
const SEPARATOR_X_RATIO = 0.15;

let engine, render, runner;
let chuteEngine, chuteRender, chuteRunner;
let items = [];
let chuteItemsPhysics = [];
let gameState = 'idle';
let VW = 460, VH = 350;
let clawX = VW / 2, clawCurrentY = CLAW_Y_TOP;
let gameTimer = 60, timerInterval = null;
let miniMeCount = 0, gameActive = false;
let grabbedItem = null, clawOpen = 1, clawAnimFrame = 0;
let clawSway = 0, clawSwayVel = 0; // Current sway angle and its velocity
let keysPressed = {};
let CVW = 0, CVH = 0; // Chute Viewport Dimensions
let viewportEl, chuteEl;
let faceImages = [];
for (let i = 1; i <= 5; i++) {
  let img = new Image();
  img.src = `face${i}.png`;
  faceImages.push(img);
}

// ===== AUDIO ENGINE =====
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  gain.gain.value = 0.15;

  if (type === 'move') {
    osc.frequency.value = 600; osc.type = 'sine';
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.start(now); osc.stop(now + 0.06);
  } else if (type === 'drop') {
    osc.frequency.value = 400; osc.type = 'triangle';
    osc.frequency.linearRampToValueAtTime(200, now + 0.3);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'grab') {
    osc.frequency.value = 500; osc.type = 'square';
    osc.frequency.linearRampToValueAtTime(800, now + 0.15);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'collect') {
    osc.frequency.value = 523; osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.start(now); osc.stop(now + 0.5);
    const o2 = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    o2.connect(g2); g2.connect(audioCtx.destination);
    o2.frequency.value = 659; o2.type = 'sine';
    g2.gain.setValueAtTime(0.15, now + 0.12);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o2.start(now + 0.12); o2.stop(now + 0.5);
    const o3 = audioCtx.createOscillator();
    const g3 = audioCtx.createGain();
    o3.connect(g3); g3.connect(audioCtx.destination);
    o3.frequency.value = 784; o3.type = 'sine';
    g3.gain.setValueAtTime(0.15, now + 0.24);
    g3.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    o3.start(now + 0.24); o3.stop(now + 0.6);
  } else if (type === 'yay') {
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.12, now + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
      o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.3);
    });
  } else if (type === 'release') {
    osc.frequency.value = 300; osc.type = 'triangle';
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now); osc.stop(now + 0.15);
  }
}

// ===== START GAME =====
function startGame() {
  audioCtx.resume();
  const landing = document.getElementById('landing');
  landing.classList.add('hidden');
  setTimeout(() => {
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('game-screen').style.opacity = '1';
    initPhysics();
    gameActive = true;
    startTimer();
  }, 1000);
}

function restartGame() {
  // Reset everything
  const finale = document.getElementById('finale');
  finale.classList.remove('active', 'visible');
  miniMeCount = 0; gameTimer = 60; grabbedItem = null;
  gameState = 'idle'; clawOpen = 1; clawAnimFrame = 0;
  keysPressed = {};
  document.getElementById('score-value').textContent = '0';

  // Clean up chute physics
  if (chuteRunner) Runner.stop(chuteRunner);
  if (chuteRender) Render.stop(chuteRender);
  if (chuteEngine) Engine.clear(chuteEngine);
  chuteItemsPhysics = [];

  // Clean up old physics
  if (runner) Runner.stop(runner);
  if (render) Render.stop(render);
  if (engine) Engine.clear(engine);

  const canvas = document.getElementById('game-canvas');
  const parent = canvas.parentElement;
  canvas.remove();
  const newCanvas = document.createElement('canvas');
  newCanvas.id = 'game-canvas';
  parent.insertBefore(newCanvas, parent.firstChild);

  document.getElementById('game-screen').classList.add('active');
  document.getElementById('game-screen').style.opacity = '1';
  document.getElementById('game-screen').style.transition = '';
  initPhysics();
  gameActive = true;
  startTimer();
}

// ===== PHYSICS INIT =====
function initPhysics() {
  viewportEl = document.querySelector('.glass-viewport');
  VW = viewportEl.clientWidth;
  VH = viewportEl.clientHeight;

  engine = Engine.create({ gravity: { x: 0, y: 1.2 } });

  render = Render.create({
    element: viewportEl,
    engine: engine,
    canvas: document.getElementById('game-canvas'),
    options: { width: VW, height: VH, wireframes: false, background: 'transparent', pixelRatio: window.devicePixelRatio || 1 }
  });

  const wallOpts = { isStatic: true, render: { visible: false } };
  const sepX = Math.floor(VW * SEPARATOR_X_RATIO); // Reverted to LEFT side

  Composite.add(engine.world, [
    Bodies.rectangle(VW / 2, VH + 15, VW, 30, wallOpts),
    Bodies.rectangle(-15, VH / 2, 30, VH, wallOpts),
    Bodies.rectangle(VW + 15, VH / 2, 30, VH, wallOpts),
    // Separator wall (Left side)
    Bodies.rectangle(sepX, VH - (VH * 0.45) / 2, 6, VH * 0.45, {
      isStatic: true,
      render: { fillStyle: '#ff85a1', strokeStyle: '#000', lineWidth: 2 },
      chamfer: { radius: 3 },
      label: 'separator'
    }),
    // Small angled ramp (Left side)
    Bodies.rectangle(sepX / 2 - 5, VH * 0.52, sepX - 10, 5, {
      isStatic: true, angle: 0.15,
      render: { fillStyle: '#ff85a1', strokeStyle: '#000', lineWidth: 1 },
      label: 'ramp'
    }),
  ]);

  clawX = VW * 0.6; // Start more towards the right
  spawnItems(sepX);

  Render.run(render);
  runner = Runner.create();
  Runner.run(runner, engine);
  Events.on(render, 'afterRender', customDraw);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // --- SECOND PHYSICS ENGINE: THE CHUTE ---
  chuteEl = document.querySelector('.chute-items');
  CVW = chuteEl.clientWidth;
  CVH = chuteEl.clientHeight;

  chuteEngine = Engine.create({ gravity: { x: 0, y: 1.0 } });
  chuteRender = Render.create({
    element: chuteEl, engine: chuteEngine,
    canvas: document.getElementById('chute-canvas'),
    options: { width: CVW, height: CVH, wireframes: false, background: 'transparent', pixelRatio: window.devicePixelRatio || 1 }
  });

  const cWallOpts = { isStatic: true, render: { visible: false } };
  Composite.add(chuteEngine.world, [
    Bodies.rectangle(CVW / 2, CVH + 15, CVW, 30, cWallOpts), // floor
    Bodies.rectangle(-15, CVH / 2, 30, CVH, cWallOpts),    // left
    Bodies.rectangle(CVW + 15, CVH / 2, 30, CVH, cWallOpts)  // right
  ]);

  Render.run(chuteRender);
  chuteRunner = Runner.create();
  Runner.run(chuteRunner, chuteEngine);

  // Override chute render to draw our items
  Events.on(chuteRender, 'afterRender', () => {
    const ctx = chuteRender.context;
    chuteItemsPhysics.forEach(item => {
      const pos = item.body.position;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(item.body.angle);
      if (item.type === 'heart') drawHeart(ctx, 0, 0, item.radius);
      else drawMiniMe(ctx, 0, 0, item.radius, item.img);
      ctx.restore();
    });
  });
}

// ===== SPAWN ITEMS =====
function spawnItems(sepX) {
  items = [];
  const startX = sepX + 25, endX = VW - 30; // Main play area is on the RIGHT

  // 1. Foundation: 8 Hearts at the bottom to act as a base
  for (let i = 0; i < 8; i++) {
    const x = startX + Math.random() * (endX - startX);
    const y = VH - 30 - (Math.random() * 20);
    const r = 15 + Math.random() * 5;
    const body = Bodies.circle(x, y, r, {
      restitution: 0.45, friction: 0.3, density: 0.002,
      render: { visible: false }, label: 'heart'
    });
    items.push({ body, type: 'heart', radius: r, caught: false });
    Composite.add(engine.world, body);
  }

  // 2. Randomized Mix: Faces and more Hearts jumbled together
  const mainPool = [
    ...Array(5).fill('minime'),
    ...Array(15).fill('heart') // Increased to 15 hearts for a fuller mix
  ];

  mainPool.forEach((type, i) => {
    const x = startX + Math.random() * (endX - startX);
    // Vertical range from "middle" depth to "top" of the pile
    const y = VH - 150 + (Math.random() * 90);

    if (type === 'minime') {
      const body = Bodies.circle(x, y, 28, {
        restitution: 0.35, friction: 0.4, density: 0.003,
        render: { visible: false }, label: 'minime'
      });
      items.push({ body, type: 'minime', radius: 28, caught: false, img: faceImages[i % faceImages.length] });
      Composite.add(engine.world, body);
    } else {
      const r = 15 + Math.random() * 5;
      const body = Bodies.circle(x, y, r, {
        restitution: 0.45, friction: 0.3, density: 0.002,
        render: { visible: false }, label: 'heart'
      });
      items.push({ body, type: 'heart', radius: r, caught: false });
      Composite.add(engine.world, body);
    }
  });
}

// ===== INPUT =====
function onKeyDown(e) {
  if (!gameActive) return;
  keysPressed[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (gameState === 'idle') { gameState = 'dropping'; playSound('drop'); }
    else if (gameState === 'holding') { gameState = 'releasing'; clawAnimFrame = 0; playSound('release'); }
  }
}
function onKeyUp(e) { keysPressed[e.code] = false; }

// ===== CLAW STATE MACHINE =====
function updateClaw() {
  if (!gameActive) return;
  const sepX = Math.floor(VW * SEPARATOR_X_RATIO);

  // Calculate Sway (Pendulum Physics)
  const swayTarget = keysPressed['ArrowLeft'] ? 0.08 : (keysPressed['ArrowRight'] ? -0.08 : 0);
  clawSwayVel += (swayTarget - clawSway) * 0.1;
  clawSwayVel *= 0.85; // Friction
  clawSway += clawSwayVel;

  if (gameState === 'idle') {
    if (keysPressed['ArrowLeft']) clawX = Math.max(20, clawX - CLAW_SPEED);
    if (keysPressed['ArrowRight']) clawX = Math.min(VW - 20, clawX + CLAW_SPEED);
    clawCurrentY = CLAW_Y_TOP; clawOpen = 1;
  }

  if (gameState === 'dropping') {
    clawCurrentY += 3.2;
    // Stop early if the claw tip reaches the topmost item under it
    const tipY = clawCurrentY + 30;
    let hitItem = false;
    for (const item of items) {
      if (item.caught) continue;
      const dx = Math.abs(item.body.position.x - clawX);
      const dy = tipY - item.body.position.y;
      // Item is within horizontal reach and claw tip has reached or passed it
      if (dx < GRAB_RADIUS * 0.8 && dy >= -5 && dy < 20) {
        hitItem = true;
        break;
      }
    }
    const maxDrop = VH - 50;
    if (hitItem || clawCurrentY >= maxDrop) {
      if (clawCurrentY > maxDrop) clawCurrentY = maxDrop;
      gameState = 'grabbing'; clawAnimFrame = 0;
    }
  }

  if (gameState === 'grabbing') {
    clawAnimFrame++;
    clawOpen = Math.max(0, 1 - clawAnimFrame / 10);
    if (clawAnimFrame >= 10) {
      grabbedItem = tryGrab();
      if (grabbedItem) playSound('grab');
      gameState = 'lifting';
    }
  }

  if (gameState === 'lifting') {
    clawCurrentY -= 2.8;
    if (grabbedItem) {
      Body.setPosition(grabbedItem.body, { x: clawX, y: clawCurrentY + 32 });
      Body.setVelocity(grabbedItem.body, { x: 0, y: 0 });
    }
    if (clawCurrentY <= CLAW_Y_TOP) {
      clawCurrentY = CLAW_Y_TOP;
      gameState = grabbedItem ? 'holding' : 'idle';
      clawOpen = grabbedItem ? 0.05 : 1;
    }
  }

  if (gameState === 'holding') {
    if (keysPressed['ArrowLeft']) clawX = Math.max(20, clawX - CLAW_SPEED);
    if (keysPressed['ArrowRight']) clawX = Math.min(VW - 20, clawX + CLAW_SPEED);
    if (grabbedItem) {
      Body.setPosition(grabbedItem.body, { x: clawX, y: clawCurrentY + 32 });
      Body.setVelocity(grabbedItem.body, { x: 0, y: 0 });
    }
  }

  if (gameState === 'releasing') {
    clawAnimFrame++;
    clawOpen = Math.min(1, clawAnimFrame / 8);
    if (clawAnimFrame >= 8) {
      if (grabbedItem) {
        const inChute = clawX < sepX + 10; // Check left side
        if (inChute) {
          // Animate drop into tube
          animateDropToChute(grabbedItem);
          Composite.remove(engine.world, grabbedItem.body);
          grabbedItem.caught = true;
        } else {
          // Drop back — give it a small push
          Body.setVelocity(grabbedItem.body, { x: 0, y: 3 });
        }
        grabbedItem = null;
      }
      gameState = 'idle'; clawOpen = 1;
    }
  }
}

// ===== GRAB =====
function tryGrab() {
  // Collect all items within grab range
  const tipY = clawCurrentY + 30;
  const candidates = [];
  for (const item of items) {
    if (item.caught) continue;
    const dx = Math.abs(item.body.position.x - clawX);
    const dy = Math.abs(item.body.position.y - tipY);
    if (dx < GRAB_RADIUS && dy < 30) {
      candidates.push(item);
    }
  }
  if (candidates.length === 0) return null;
  // Prioritize minime faces over hearts
  const faces = candidates.filter(c => c.type === 'minime');
  if (faces.length > 0) {
    faces.sort((a, b) => a.body.position.y - b.body.position.y);
    return faces[0];
  }
  // Otherwise pick the topmost heart
  candidates.sort((a, b) => a.body.position.y - b.body.position.y);
  return candidates[0];
}

// ===== CREATE CANVAS ICON FOR AN ITEM =====
function createItemCanvas(type, size, img) {
  const canvas = document.createElement('canvas');
  const s = size || 36;
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  ctx.translate(s / 2, s / 2);
  if (type === 'heart') {
    drawHeart(ctx, 0, 0, s * 0.55);
  } else {
    drawMiniMe(ctx, 0, 0, s * 0.5, img);
  }
  return canvas;
}

// ===== ANIMATE DROP INTO CHUTE =====
function animateDropToChute(item) {
  const vpRect = viewportEl.getBoundingClientRect();
  const cRect = chuteEl.getBoundingClientRect();

  const size = item.radius * 2;
  const iconCanvas = createItemCanvas(item.type, size, item.img);
  const startLeft = vpRect.left + clawX - item.radius;
  const startTop = vpRect.top + clawCurrentY + 10;

  iconCanvas.style.cssText = `
    position: fixed; z-index: 200; pointer-events: none;
    left: ${startLeft}px; top: ${startTop}px;
    transition: top 0.4s cubic-bezier(0.5, 0, 1, 1);
  `;
  document.body.appendChild(iconCanvas);

  // Straight drop animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      iconCanvas.style.top = `${cRect.top + 10}px`;
    });
  });

  // Once it "hits" the chute bottom visually, spawn it in the second physics engine
  setTimeout(() => {
    iconCanvas.remove();

    // Calculate relative X in the chute
    const relX = (startLeft + item.radius) - cRect.left;
    const clampedX = Math.max(15, Math.min(CVW - 15, relX));

    const body = Bodies.circle(clampedX, -20, item.radius, {
      restitution: 0.3, friction: 0.5, density: 0.005,
      render: { visible: false }
    });

    chuteItemsPhysics.push({ body, type: item.type, radius: item.radius, img: item.img });
    Composite.add(chuteEngine.world, body);

    // Final bookkeeping
    if (item.type === 'minime') {
      miniMeCount++;
      document.getElementById('score-value').textContent = miniMeCount;
      showYay(); playSound('yay');
      if (miniMeCount >= 5) endGame();
    } else {
      playSound('collect');
    }
  }, 410);
}

// ===== COLLECT =====
function collectItem(item) {
  const chuteItems = document.querySelector('.chute-items');
  const wrapper = document.createElement('div');
  wrapper.className = 'chute-item';
  const size = Math.max(36, item.radius * 1.5);
  const icon = createItemCanvas(item.type, size, item.img);
  wrapper.appendChild(icon);
  chuteItems.appendChild(wrapper);

  if (item.type === 'minime') {
    miniMeCount++;
    document.getElementById('score-value').textContent = miniMeCount;
    showYay(); playSound('yay');
    if (miniMeCount >= 5) endGame();
  } else {
    playSound('collect');
  }
}

function showYay() {
  const yay = document.createElement('div');
  yay.className = 'yay-pop';
  yay.textContent = '💋 Mwwah!';
  yay.style.left = '50%'; yay.style.top = '50%';
  yay.style.transform = 'translate(-50%,-50%)';
  document.body.appendChild(yay);
  setTimeout(() => yay.remove(), 1200);
}

// ===== TIMER =====
function startTimer() {
  gameTimer = 60;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    gameTimer--;
    updateTimerDisplay();
    if (gameTimer <= 0) { clearInterval(timerInterval); endGame(); }
  }, 1000);
}
function updateTimerDisplay() {
  document.getElementById('timer-display').textContent = '0:' + String(gameTimer).padStart(2, '0');
}

// ===== END GAME =====
function endGame() {
  if (!gameActive) return;
  gameActive = false;
  clearInterval(timerInterval);

  // Update Finale Text Context based on score
  const eyebrow = document.getElementById('finale-eyebrow');
  const title = document.getElementById('finale-title');
  const subtitle = document.getElementById('finale-subtitle');

  if (miniMeCount >= 5) {
    eyebrow.textContent = '✨ You caught all Vibhu\'s ✨';
    title.innerHTML = 'No matter which<br>version of me<br>you catch…';
    subtitle.innerHTML = '…every single one of them<br>is already yours. Forever. 💕';
  } else {
    eyebrow.textContent = `✨ You caught ${miniMeCount} Vibhu's ✨`;
    title.innerHTML = 'Even if you only<br>catch a few of me…';
    subtitle.innerHTML = '…every version of me<br>already belongs to you. 💕';
  }

  setTimeout(() => {
    document.getElementById('game-screen').style.opacity = '0';
    document.getElementById('game-screen').style.transition = 'opacity 1.5s';
    const finale = document.getElementById('finale');
    finale.classList.add('active');
    setTimeout(() => finale.classList.add('visible'), 100);
    setTimeout(() => {
      document.getElementById('game-screen').classList.remove('active');
      if (runner) Runner.stop(runner);
      if (render) Render.stop(render);
      if (chuteRunner) Runner.stop(chuteRunner);
      if (chuteRender) Render.stop(chuteRender);
    }, 1600);
  }, 600);
}

// ===== CUSTOM DRAW =====
function customDraw() {
  const ctx = render.context;
  updateClaw();

  const sepX = Math.floor(VW * SEPARATOR_X_RATIO);
  const outlineColor = '#4a1a2c';

  ctx.save();

  // Chute zone indicator - subtle on the LEFT
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, 0, sepX, VH);

  // Arrow pointing down and label
  ctx.fillStyle = outlineColor;
  ctx.font = 'bold 20px Fredoka One';
  ctx.textAlign = 'center';
  ctx.fillText('▼', sepX / 2, VH * 0.25);
  ctx.font = '12px Fredoka One';
  ctx.fillText('DROP', sepX / 2, VH * 0.15);

  // Claw Cable - Matching the reference image style
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 6; // Thicker outline
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(clawX, 0);
  ctx.lineTo(clawX, clawCurrentY);
  ctx.stroke();

  // Inner cable color
  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(clawX, 0);
  ctx.lineTo(clawX, clawCurrentY - 10);
  ctx.stroke();

  drawClaw(ctx, clawX, clawCurrentY, clawOpen);

  for (const item of items) {
    if (item.caught) continue;
    const pos = item.body.position;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(item.body.angle);
    if (item.type === 'heart') drawHeart(ctx, 0, 0, item.radius * 1.1);
    else drawMiniMe(ctx, 0, 0, item.radius, item.img);
    ctx.restore();
  }

  // Grab zone feedback
  if (gameState === 'dropping' || gameState === 'grabbing') {
    ctx.strokeStyle = 'rgba(74, 26, 44, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(clawX, clawCurrentY + 28, GRAB_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

// ===== DRAWING HELPERS =====
function drawHeart(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 16;
  ctx.scale(s, s);

  const outlineColor = '#4a1a2c';
  const heartColor = '#c9184a'; // Redder tint

  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-1, -4, -16, -6, -16, 4);
  ctx.bezierCurveTo(-16, 12, 0, 20, 0, 24);
  ctx.bezierCurveTo(0, 20, 16, 12, 16, 4);
  ctx.bezierCurveTo(16, -6, 1, -4, 0, 6);
  ctx.closePath();

  // Subtle gradient for depth
  const grad = ctx.createRadialGradient(0, 4, 4, 0, 8, 20);
  grad.addColorStop(0, '#ff4d6d'); // Brighter red top
  grad.addColorStop(1, '#b3002d'); // Deep red bottom

  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Simple, tiny highlight
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-5, 2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMiniMe(ctx, x, y, r, img) {
  const displayImg = img || faceImages[0];
  const outlineColor = '#4a1a2c';
  ctx.save();
  if (displayImg && displayImg.complete && displayImg.naturalWidth !== 0) {
    ctx.drawImage(displayImg, x - r, y - r, r * 2, r * 2);
  } else {
    // Fallback logic - Cute face
    const grad = ctx.createRadialGradient(0, -2, 2, 0, 0, r);
    grad.addColorStop(0, '#ffe8b0'); grad.addColorStop(1, '#f4c87a');
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = outlineColor; ctx.lineWidth = 3; ctx.stroke();
    // Eyes
    ctx.fillStyle = outlineColor;
    ctx.beginPath(); ctx.arc(-5, -3, 2.5, 0, Math.PI * 2); ctx.arc(5, -3, 2.5, 0, Math.PI * 2); ctx.fill();
    // Smile
    ctx.strokeStyle = outlineColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 1, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}

function drawClaw(ctx, x, y, openness) {
  ctx.save();
  ctx.translate(x, y);

  // Apply Sway
  ctx.rotate(clawSway);

  const outlineColor = '#47313a'; // Match the soft dark sketch outline
  const headColor = '#e6e6e6';   // Clean light grey
  const armColor = '#f2f2f2';    // Brighter grey for arms
  const heartColor = '#ffb3c1';  // Pastel pink for the mascot heart

  // 1. Decorative Heart (The mascot on top)
  ctx.save();
  ctx.translate(0, -22);
  ctx.scale(0.6, 0.6); // Mini heart
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-1, -4, -16, -6, -16, 4);
  ctx.bezierCurveTo(-16, 12, 0, 20, 0, 24);
  ctx.bezierCurveTo(0, 20, 16, 12, 16, 4);
  ctx.bezierCurveTo(16, -6, 1, -4, 0, 6);
  ctx.closePath();
  ctx.fillStyle = heartColor;
  ctx.fill();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();

  // 2. Main Housing (The rounded grey block)
  ctx.fillStyle = headColor;
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-22, -10, 44, 18, 10);
  ctx.fill();
  ctx.stroke();

  const angle = 0.1 + openness * 0.6;

  // 3. Arms with Circular Joints
  const drawArmPair = (side) => {
    ctx.save();
    ctx.translate(side * 14, 5);
    ctx.scale(side, 1); // Perfectly mirror the coordinate system for this side

    ctx.rotate(angle); // Positive angle rotates 'outward' for both arms

    // Shoulder Joint Circle
    ctx.fillStyle = headColor;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Arm Segment (drawn once, mirrored by scale)
    ctx.fillStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(-3.5, 6);
    ctx.lineTo(3.5, 6);
    // Tapered and curved look pulling outward (+X)
    ctx.quadraticCurveTo(10, 20, 6, 38);
    ctx.lineTo(0, 38);
    ctx.quadraticCurveTo(4, 20, -3.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  };

  drawArmPair(-1);
  drawArmPair(1);

  ctx.restore();
}

// ===== FLOATING HEARTS =====
function createFloatingHearts() {
  const container = document.querySelector('.hearts-bg');
  const emojis = ['❤', '💕', '💗', '♥', '💖'];
  for (let i = 0; i < 30; i++) {
    const h = document.createElement('div');
    h.className = 'float-heart';
    h.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    h.style.left = Math.random() * 100 + '%';
    h.style.fontSize = (14 + Math.random() * 24) + 'px';
    h.style.animationDuration = (8 + Math.random() * 12) + 's';
    h.style.animationDelay = (Math.random() * 15) + 's';
    container.appendChild(h);
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  createFloatingHearts();
  const wrapper = document.querySelector('.machine-wrapper');
  const decos = ['💖', '⭐', '💕', '✨', '♥', '🌸'];
  for (let i = 0; i < 10; i++) {
    const d = document.createElement('span');
    d.className = 'deco';
    d.textContent = decos[Math.floor(Math.random() * decos.length)];
    d.style.left = (10 + Math.random() * 80) + '%';
    d.style.top = (50 + Math.random() * 45) + '%';
    d.style.fontSize = (10 + Math.random() * 10) + 'px';
    d.style.transform = `rotate(${Math.random() * 40 - 20}deg)`;
    wrapper.appendChild(d);
  }
});
