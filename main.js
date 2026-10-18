// Breakout demo (single-file game logic)
// Author: Copilot assistant (generated assets: canvas + WebAudio)

(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // HUD
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const levelEl = document.getElementById('level');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  // Responsive scale: keep logical size but fit viewport
  const LOGICAL_WIDTH = 800;
  const LOGICAL_HEIGHT = 600;
  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / LOGICAL_WIDTH, window.devicePixelRatio || 1);
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
    canvas.style.width = Math.min(rect.width, LOGICAL_WIDTH) + "px";
    canvas.style.height = (LOGICAL_HEIGHT * (parseFloat(canvas.style.width) / LOGICAL_WIDTH)) + "px";
  }
  // Call on load and resize
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // WebAudio simple sfx
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function beep(freq=440, type='sine', duration=0.06, gain=0.08){
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  // Game state
  let score = 0;
  let lives = 3;
  let level = 1;
  let paused = false;
  let running = false;

  // Paddle
  const paddle = {
    w: 120,
    h: 14,
    x: LOGICAL_WIDTH/2 - 60,
    y: LOGICAL_HEIGHT - 60,
    speed: 8,
    dx: 0
  };

  // Ball
  const ball = {
    r: 9,
    x: LOGICAL_WIDTH/2,
    y: paddle.y - 10,
    speed: 5,
    vx: 0,
    vy: 0,
    stuck: true
  };

  // Bricks
  const brickConfigBase = {
    rows: 5,
    cols: 10,
    padding: 8,
    offsetTop: 80,
    offsetLeft: 40,
    brickW: Math.floor((LOGICAL_WIDTH - 80 - (9 * 8)) / 10),
    brickH: 20
  };
  let bricks = [];

  function makeBricks(levelNum){
    const cfg = Object.assign({}, brickConfigBase);
    // increase rows every few levels
    cfg.rows = Math.min(7, brickConfigBase.rows + Math.floor((levelNum-1)/2));
    cfg.cols = Math.min(12, brickConfigBase.cols);
    cfg.brickW = Math.floor((LOGICAL_WIDTH - cfg.offsetLeft*2 - (cfg.cols-1) * cfg.padding) / cfg.cols);
    bricks = [];
    for (let r=0;r<cfg.rows;r++){
      const row = [];
      for (let c=0;c<cfg.cols;c++){
        // hp or value based on row
        const hp = 1 + Math.floor(r / 2); // some bricks take 2 hits
        row.push({
          x: cfg.offsetLeft + c * (cfg.brickW + cfg.padding),
          y: cfg.offsetTop + r * (cfg.brickH + cfg.padding),
          w: cfg.brickW,
          h: cfg.brickH,
          hp,
          alive: true,
          colorIdx: r % 6
        });
      }
      bricks.push(row);
    }
  }

  // Controls
  const keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.code === 'Space') {
      togglePause();
      e.preventDefault();
    }
    // resume audio on user gesture
    if (audioCtx.state === 'suspended') audioCtx.resume();
  });
  document.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  // Touch controls: tap left/right side to move; drag to paddle
  let touchId = null;
  canvas.addEventListener('touchstart', e => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    handleTouchMove(t);
    e.preventDefault();
  }, {passive:false});
  canvas.addEventListener('touchmove', e => {
    const t = [...e.changedTouches].find(tt=>tt.identifier===touchId)||e.changedTouches[0];
    if (t) handleTouchMove(t);
    e.preventDefault();
  }, {passive:false});
  canvas.addEventListener('touchend', e => { touchId = null; }, {passive:false});
  function handleTouchMove(t){
    const rect = canvas.getBoundingClientRect();
    const x = (t.clientX - rect.left) * (LOGICAL_WIDTH / rect.width);
    paddle.x = Math.max(0, Math.min(LOGICAL_WIDTH - paddle.w, x - paddle.w/2));
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w/2;
    }
  }

  // Game loop
  let lastTime = 0;
  function loop(ts){
    if (!running) return;
    if (!paused){
      const dt = Math.min(50, ts - lastTime);
      update(dt/16.67);
      draw();
    } else {
      draw(); // draw paused overlay
      drawPaused();
    }
    lastTime = ts;
    requestAnimationFrame(loop);
  }

  // Update physics
  function update(step=1){
    // paddle movement by keyboard
    if (keys['arrowleft'] || keys['a']) paddle.x -= paddle.speed * step;
    if (keys['arrowright'] || keys['d']) paddle.x += paddle.speed * step;
    paddle.x = Math.max(0, Math.min(LOGICAL_WIDTH - paddle.w, paddle.x));

    // ball
    if (ball.stuck) {
      ball.x = paddle.x + paddle.w/2;
      ball.y = paddle.y - ball.r - 2;
    } else {
      ball.x += ball.vx * ball.speed * step;
      ball.y += ball.vy * ball.speed * step;

      // wall collision
      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; beep(220, 'square', 0.04, 0.06); }
      if (ball.x + ball.r > LOGICAL_WIDTH) { ball.x = LOGICAL_WIDTH - ball.r; ball.vx *= -1; beep(220, 'square', 0.04, 0.06); }
      if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; beep(300, 'sine', 0.04, 0.04); }

      // paddle collision
      if (rectCircleCollide({x:paddle.x,y:paddle.y,w:paddle.w,h:paddle.h}, ball)){
        // reflect based on hit position
        const rel = (ball.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
        const angle = rel * (Math.PI/3); // max 60deg
        const speed = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
        ball.vx = Math.sin(angle);
        ball.vy = -Math.cos(angle);
        // slightly increase speed
        ball.speed = Math.min(10, ball.speed * 1.03);
        ball.y = paddle.y - ball.r - 1;
        beep(520 + Math.abs(rel)*400, 'sawtooth', 0.03, 0.06);
      }

      // out of bounds
      if (ball.y - ball.r > LOGICAL_HEIGHT){
        loseLife();
      }

      // bricks
      let bricksLeft = 0;
      outer: for (let r=0;r<bricks.length;r++){
        for (let c=0;c<bricks[r].length;c++){
          const b = bricks[r][c];
          if (!b.alive) continue;
          bricksLeft++;
          if (rectCircleCollide(b, ball)){
            // simple collision response: invert vy; better: check side impact
            // detect overlap on x vs y
            const overlapX = Math.max(0, Math.min(ball.x + ball.r, b.x + b.w) - Math.max(ball.x - ball.r, b.x));
            const overlapY = Math.max(0, Math.min(ball.y + ball.r, b.y + b.h) - Math.max(ball.y - ball.r, b.y));
            if (overlapX < overlapY) ball.vx *= -1;
            else ball.vy *= -1;
            b.hp--;
            beep(660 - (r*40), 'triangle', 0.05, 0.06);
            if (b.hp <= 0){
              b.alive = false;
              score += 10;
              // small bonus for higher rows
              score += Math.max(0, (bricks.length - r - 1));
            } else {
              score += 5;
            }
            break outer;
          }
        }
      }

      if (bricksLeft === 0){
        // next level
        levelUp();
      }
    }

    // update HUD
    scoreEl.textContent = `Score: ${score}`;
    livesEl.textContent = `Lives: ${lives}`;
    levelEl.textContent = `Level: ${level}`;
  }

  function levelUp(){
    level++;
    // reset ball & paddle
    paddle.w = Math.max(70, paddle.w - 6); // shrink paddle slightly
    ball.speed = Math.min(7, 5 + level*0.4);
    ball.stuck = true;
    makeBricks(level);
    beep(880, 'sine', 0.15, 0.08);
  }

  function loseLife(){
    lives--;
    beep(120, 'sine', 0.25, 0.12);
    if (lives <= 0){
      // game over -> restart
      running = false;
      paused = false;
      draw();
      setTimeout(()=> {
        alert(`Game Over\nScore: ${score}`);
        initGame();
      }, 20);
    } else {
      ball.stuck = true;
      ball.speed = Math.max(4, 5 + (level-1)*0.4);
      ball.vx = 0; ball.vy = -1;
      paddle.x = LOGICAL_WIDTH/2 - paddle.w/2;
    }
  }

  function rectCircleCollide(rect, circle){
    // rect: {x,y,w,h}, circle: {x,y,r}
    const cx = circle.x;
    const cy = circle.y;
    const rx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ry = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - rx;
    const dy = cy - ry;
    return (dx*dx + dy*dy) <= (circle.r * circle.r);
  }

  // Draw
  function draw(){
    // clear
    ctx.clearRect(0,0,LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // background grid subtle
    ctx.save();
    ctx.fillStyle = '#041220';
    ctx.fillRect(0,0,LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.restore();

    // bricks
    for (let r=0;r<bricks.length;r++){
      for (let c=0;c<bricks[r].length;c++){
        const b = bricks[r][c];
        if (!b.alive) continue;
        const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        const cols = ['#ffb4a2','#ffd6a5','#fdffb6','#caffbf','#9bf6ff','#bde0fe'];
        const base = cols[b.colorIdx % cols.length];
        grad.addColorStop(0, shade(base, -12 - r*4));
        grad.addColorStop(1, shade(base, 6 + r*3));
        ctx.fillStyle = grad;
        roundRect(ctx, b.x, b.y, b.w, b.h, 4, true, false);
        // small inner shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.strokeRect(b.x+1, b.y+1, b.w-2, b.h-2);
      }
    }

    // paddle
    const pgrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.w, paddle.y + paddle.h);
    pgrad.addColorStop(0, '#ffffff22');
    pgrad.addColorStop(1, '#ffffff44');
    ctx.fillStyle = pgrad;
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6, true, false);
    // paddle glow
    ctx.fillStyle = 'rgba(255,209,102,0.06)';
    ctx.fillRect(paddle.x-6, paddle.y-6, paddle.w+12, 6);

    // ball
    const bgrad = ctx.createRadialGradient(ball.x-3, ball.y-3, 2, ball.x, ball.y, ball.r);
    bgrad.addColorStop(0, '#fff');
    bgrad.addColorStop(1, '#bde0fe');
    ctx.fillStyle = bgrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
    ctx.fill();

    // HUD texts
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = '18px system-ui, sans-serif';
  }

  function drawPaused(){
    if (!paused) return;
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,12,0.55)';
    ctx.fillRect(0,0,LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Paused', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2 - 20);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Press Space to resume', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2 + 14);
    ctx.restore();
  }

  // Utility: rounded rect
  function roundRect(ctx,x,y,w,h,r,fill,stroke){
    if (typeof r === 'undefined') r = 5;
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // color shade helper
  function shade(hex, percent){
    const c = hex.replace('#','');
    const num = parseInt(c,16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00FF) + percent;
    let b = (num & 0x0000FF) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + (r<<16 | g<<8 | b).toString(16).padStart(6,'0');
  }

  // Start / init
  function initGame(){
    score = 0;
    lives = 3;
    level = 1;
    paused = false;
    running = true;
    paddle.w = 120;
    paddle.x = LOGICAL_WIDTH/2 - paddle.w/2;
    ball.r = 9;
    ball.speed = 5;
    ball.vx = 0;
    ball.vy = -1;
    ball.stuck = true;
    makeBricks(level);
    lastTime = performance.now();
    requestAnimationFrame(loop);
    draw();
  }

  function startGame(){
    if (!running) {
      initGame();
    } else {
      // restart
      initGame();
    }
    // serve ball
    serve();
  }

  function serve(){
    if (!ball.stuck) return;
    ball.stuck = false;
    // initial angle
    const ang = (Math.random()*Math.PI/3) - Math.PI/6; // -30..30deg
    ball.vx = Math.sin(ang);
    ball.vy = -Math.cos(ang);
  }

  function togglePause(){
    if (!running) return;
    paused = !paused;
    if (!paused) {
      lastTime = performance.now();
      requestAnimationFrame(loop);
    } else {
      draw();
      drawPaused();
    }
  }

  // Buttons
  startBtn.addEventListener('click', () => {
    startGame();
  });
  pauseBtn.addEventListener('click', () => {
    togglePause();
  });

  // initial draw
  draw();

  // Auto-start a small attract mode: show ball on paddle
  ball.stuck = true;
  ball.x = paddle.x + paddle.w/2;
  ball.y = paddle.y - ball.r - 2;

  // If user clicks canvas, serve ball
  canvas.addEventListener('click', () => {
    if (!running) startGame();
    else if (ball.stuck) serve();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  });

  // export for external use (debug)
  window.__breakout = {
    startGame, serve, togglePause, getState: ()=>({score,lives,level})
  };

})();
