(function(){
  // Particles + constellation lines overlay
  const cfg = {
    baseCount: 40,            // base particle count (scaled by viewport)
    minSize: 1.0,
    maxSize: 3.5,
    minSpeed: 10,            // px/sec
    maxSpeed: 80,            // px/sec
    lineDistance: 300,       // px threshold to draw a line
    lineMaxAlpha: 0.12,
    particleAlpha: 0.9,
    spawnPadding: 40         // spawn below bottom
  };
  // Maximum simultaneous connections per particle (reduce visual clutter)
  cfg.maxConnections = 3;

  function createCanvas() {
    const c = document.createElement('canvas');
    c.className = 'ub-particles-canvas';
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.position = 'fixed';
    c.style.left = '0';
    c.style.top = '0';
    c.style.pointerEvents = 'none';
    c.style.zIndex = '0';
    document.body.appendChild(c);
    return c;
  }

  const canvas = createCanvas();
  const ctx = canvas.getContext('2d');
  let DPR = Math.max(1, window.devicePixelRatio || 1);
  let W = 0, H = 0, particles = [];

  function resize() {
    DPR = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    W = Math.max(300, Math.floor(rect.width));
    H = Math.max(200, Math.floor(rect.height));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // scale particle count with viewport area
    const area = (W * H) / (1366 * 768);
    const targetCount = Math.max(12, Math.round(cfg.baseCount * area));
    while (particles.length < targetCount) particles.push(makeParticle(true));
    while (particles.length > targetCount) particles.pop();
  }

  function rand(a,b){return a + Math.random()*(b-a);} 

  function makeParticle(spawnInside){
    const size = rand(cfg.minSize, cfg.maxSize);
    const x = rand(0, W);
    const y = spawnInside ? rand(H*0.2,H) : H + rand(0, cfg.spawnPadding);
    const speed = rand(cfg.minSpeed, cfg.maxSpeed) / 1000; // px/ms
    const vx = rand(-10,10)/1000; // slight horizontal drift px/ms
    const vy = -speed; // upwards
    const hue = 175 + Math.random()*40; // teal-ish range
    return {x,y,vx,vy,size,hue,alpha: cfg.particleAlpha};
  }

  let last = performance.now();
  function step(now){
    const dt = Math.min(60, now - last);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(step);
  }

  function update(dt){
    for (let p of particles){
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // small horizontal wrap
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      // recycle when off top
      if (p.y < -cfg.spawnPadding) {
        Object.assign(p, makeParticle(false));
      }
    }
  }

  function render(){
    ctx.clearRect(0,0,W,H);
    // draw lines first (so particles glow sits above)
    ctx.lineWidth = 1;
    // Track connections and prefer nearest neighbors. We sort candidate
    // neighbors by distance per particle, draw up to `cfg.maxConnections`
    // and use a Set to avoid drawing the same pair twice.
    const connCounts = new Array(particles.length).fill(0);
    const drawn = new Set();
    for (let i = 0; i < particles.length; i++) {
      if (connCounts[i] >= cfg.maxConnections) continue;
      const a = particles[i];
      // Build neighbor list with distances
      const neighbors = [];
      for (let j = 0; j < particles.length; j++){
        if (j === i) continue;
        const b = particles[j];
        const dx = a.x - b.x; const dy = a.y - b.y;
        const d2 = dx*dx + dy*dy;
        const dist = Math.sqrt(d2);
        if (dist < cfg.lineDistance) neighbors.push({ idx: j, dist });
      }
      // Prefer nearest neighbors — sort and keep only the closest up to
      // `cfg.maxConnections` to avoid checking distant particles.
      neighbors.sort((u,v)=>u.dist - v.dist);
      if (neighbors.length > cfg.maxConnections) neighbors.length = cfg.maxConnections;
      for (let k = 0; k < neighbors.length && connCounts[i] < cfg.maxConnections; k++){
        const j = neighbors[k].idx;
        const key = i < j ? i + ':' + j : j + ':' + i;
        if (drawn.has(key)) continue;
        if (connCounts[j] >= cfg.maxConnections) continue;
        const b = particles[j];
        const dist = neighbors[k].dist;
        const alpha = (1 - dist / cfg.lineDistance) * cfg.lineMaxAlpha;
        ctx.strokeStyle = `rgba(0,240,194,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        connCounts[i]++;
        connCounts[j]++;
        drawn.add(key);
      }
    }
    // draw particles
    for (let p of particles){
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(4, p.size*6));
      const color = `rgba(0,240,194,${p.alpha})`;
      g.addColorStop(0, color);
      g.addColorStop(0.35, `rgba(0,240,194,${Math.max(0.18,p.alpha*0.35)})`);
      g.addColorStop(1, 'rgba(0,240,194,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Initialize
  function init(){
    resize();
    window.addEventListener('resize', throttle(resize, 250));
    // ensure canvas sits behind content but above body background
    // some themes set body::before at z-index:0; we keep canvas at 0 and bump content to 1 via CSS
    last = performance.now();
    requestAnimationFrame(step);
  }

  function throttle(fn, wait){ let t=0, timer=null; return function(){ const now=Date.now(); if(now-t>wait){ t=now; fn.apply(this,arguments);} else { clearTimeout(timer); timer = setTimeout(()=>{ t=Date.now(); fn.apply(this,arguments);}, wait - (now-t)); } } }

  // Delay init until DOM is ready; allow theme scripts to run first
  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(init, 200);
  } else {
    document.addEventListener('DOMContentLoaded', ()=>setTimeout(init,200));
  }

})();
