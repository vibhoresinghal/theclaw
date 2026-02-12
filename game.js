const { Engine, Render, Runner, Bodies, Body, Composite, Events } = Matter;

let engine, render, runner;
let items = [];
let gameState = 'idle';
let clawX = 0, clawCurrentY = 40;
let gameTimer = 60, timerInterval = null;
let miniMeCount = 0, gameActive = false;
let grabbedItem = null, clawOpen = 1, clawAnimFrame = 0;
let keysPressed = {};
let VW = 460, VH = 350;
let viewportEl;
let faceImages = [];
for (let i = 1; i <= 5; i++) {
  let img = new Image();
  img.src = `face${i}.png`;
  faceImages.push(img);
}


const CLAW_Y_TOP = 40;
const CLAW_SPEED = 3.5;
const GRAB_RADIUS = 55;
const SEPARATOR_X_RATIO = 0.18;

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
  document.querySelector('.chute-items').innerHTML = '';

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
  const sepX = Math.floor(VW * SEPARATOR_X_RATIO);

  Composite.add(engine.world, [
    Bodies.rectangle(VW / 2, VH + 15, VW, 30, wallOpts),
    Bodies.rectangle(-15, VH / 2, 30, VH, wallOpts),
    Bodies.rectangle(VW + 15, VH / 2, 30, VH, wallOpts),
    // Separator wall — from bottom up to 55% height, leaves gap at top for claw
    Bodies.rectangle(sepX, VH - (VH * 0.45) / 2, 6, VH * 0.45, {
      isStatic: true,
      render: { fillStyle: '#d4809a', strokeStyle: '#c0607a', lineWidth: 2 },
      chamfer: { radius: 3 },
      label: 'separator'
    }),
    // Small angled ramp in chute zone to guide items down
    Bodies.rectangle(sepX / 2 - 5, VH * 0.52, sepX - 10, 5, {
      isStatic: true, angle: 0.15,
      render: { fillStyle: '#d4809a', strokeStyle: '#c0607a', lineWidth: 1 },
      label: 'ramp'
    }),
  ]);

  clawX = VW / 2;
  spawnItems(sepX);

  Render.run(render);
  runner = Runner.create();
  Runner.run(runner, engine);
  Events.on(render, 'afterRender', customDraw);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

// ===== SPAWN ITEMS =====
function spawnItems(sepX) {
  items = [];
  const startX = sepX + 25, endX = VW - 30;
  const startY = VH - 130;

  for (let i = 0; i < 15; i++) {
    const x = startX + Math.random() * (endX - startX);
    const y = startY + Math.random() * 80 - 40;
    const r = 15 + Math.random() * 5;
    const body = Bodies.circle(x, y, r, {
      restitution: 0.45, friction: 0.3, density: 0.002,
      render: { visible: false }, label: 'heart'
    });
    items.push({ body, type: 'heart', radius: r, caught: false });
    Composite.add(engine.world, body);
  }

  for (let i = 0; i < 5; i++) {
    const x = startX + Math.random() * (endX - startX);
    const y = startY + Math.random() * 60 - 80;
    const body = Bodies.circle(x, y, 28, {
      restitution: 0.35, friction: 0.4, density: 0.003,
      render: { visible: false }, label: 'minime'
    });
    items.push({ body, type: 'minime', radius: 28, caught: false, img: faceImages[i % faceImages.length] });
    Composite.add(engine.world, body);
  }
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
        const inChute = clawX < sepX + 10;
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
  // Pick the topmost item (lowest Y = highest on screen)
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
  const chuteEl = document.querySelector('.prize-chute');
  const chuteRect = chuteEl.getBoundingClientRect();

  const size = item.radius * 2;
  const iconCanvas = createItemCanvas(item.type, size, item.img);
  iconCanvas.style.cssText = `
    position: fixed;
    z-index: 200;
    pointer-events: none;
    left: ${vpRect.left + clawX - item.radius}px;
    top: ${vpRect.top + clawCurrentY + 10}px;
    transition: all 0.55s cubic-bezier(0.4, 0, 0.65, 1);
  `;
  document.body.appendChild(iconCanvas);

  // Animate to chute center
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      iconCanvas.style.left = `${chuteRect.left + chuteRect.width / 2 - item.radius}px`;
      iconCanvas.style.top = `${chuteRect.top + chuteRect.height * 0.6}px`;
      iconCanvas.style.opacity = '0.85';
    });
  });

  setTimeout(() => {
    iconCanvas.remove();
    collectItem(item);
  }, 600);
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
  yay.textContent = '🎉 Yay!';
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
    }, 1600);
  }, 600);
}

// ===== CUSTOM DRAW =====
function customDraw() {
  const ctx = render.context;
  updateClaw();

  const sepX = Math.floor(VW * SEPARATOR_X_RATIO);

  ctx.save();

  // Draw chute zone label
  ctx.fillStyle = 'rgba(212, 128, 154, 0.15)';
  ctx.fillRect(0, 0, sepX - 3, VH);
  ctx.fillStyle = '#d4809a';
  ctx.font = 'bold 9px Outfit';
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(sepX / 2, VH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('⬇ DROP HERE ⬇', 0, 0);
  ctx.restore();

  // Arrow pointing down in chute zone
  if (gameState === 'holding' && clawX < sepX + 10) {
    ctx.fillStyle = 'rgba(255,77,109,0.3)';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⬇', sepX / 2, VH - 20);
  }

  // Claw rope
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(clawX, 0); ctx.lineTo(clawX, clawCurrentY); ctx.stroke();
  ctx.setLineDash([]);

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

  // Highlight grab zone when dropping
  if (gameState === 'dropping' || gameState === 'grabbing') {
    ctx.strokeStyle = 'rgba(255,77,109,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(clawX, clawCurrentY + 28, GRAB_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawHeart(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y);
  const s = size / 16; ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-1, -4, -16, -6, -16, 4);
  ctx.bezierCurveTo(-16, 12, 0, 20, 0, 24);
  ctx.bezierCurveTo(0, 20, 16, 12, 16, 4);
  ctx.bezierCurveTo(16, -6, 1, -4, 0, 6);
  ctx.closePath();
  const grad = ctx.createRadialGradient(0, 8, 2, 0, 8, 20);
  grad.addColorStop(0, '#ff6b8a'); grad.addColorStop(1, '#cc2244');
  ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = '#a01030'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(-5, 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  ctx.restore();
}

function drawMiniMe(ctx, x, y, r, img) {
  const displayImg = img || faceImages[0];
  if (displayImg && displayImg.complete && displayImg.naturalWidth !== 0) {
    ctx.drawImage(displayImg, x - r, y - r, r * 2, r * 2);
  } else {
    // Fallback if image fails to load
    ctx.save(); ctx.translate(x, y);
    const grad = ctx.createRadialGradient(0, -2, 2, 0, 0, r);
    grad.addColorStop(0, '#ffe8b0'); grad.addColorStop(1, '#f4c87a');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = '#c4943a'; ctx.lineWidth = 2.5; ctx.stroke();
    // Eyes
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(-5, -3, 2.5, 0, Math.PI * 2); ctx.arc(5, -3, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -4, 1, 0, Math.PI * 2); ctx.arc(6, -4, 1, 0, Math.PI * 2); ctx.fill();
    // Smile
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 1, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    // Blush
    ctx.fillStyle = 'rgba(255,130,140,0.4)';
    ctx.beginPath(); ctx.ellipse(-8, 3, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, 3, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    // Label
    ctx.fillStyle = '#c45a7a'; ctx.font = 'bold 7px Outfit'; ctx.textAlign = 'center';
    ctx.fillText('ME', 0, r + 2);
    ctx.restore();
  }
}

function drawClaw(ctx, x, y, openness) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#bbb'; ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(-12, -6, 24, 14, 4); ctx.fill(); ctx.stroke();
  const angle = 0.15 + openness * 0.45;
  // Left arm
  ctx.save(); ctx.rotate(-angle);
  ctx.fillStyle = '#ccc'; ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, 6); ctx.lineTo(-6, 30); ctx.lineTo(-10, 32);
  ctx.lineTo(-8, 34); ctx.lineTo(0, 32); ctx.lineTo(3, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  // Right arm
  ctx.save(); ctx.rotate(angle);
  ctx.fillStyle = '#ccc'; ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(3, 6); ctx.lineTo(6, 30); ctx.lineTo(10, 32);
  ctx.lineTo(8, 34); ctx.lineTo(0, 32); ctx.lineTo(-3, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
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
