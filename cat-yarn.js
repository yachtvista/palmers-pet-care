// The cat and the ball of yarn on top of the homepage's local nav bar. Plays once when the bar
// comes into view: bat the ball, chase it, play, then sit with a swishing tail. Decorative only.
(function () {
  const stage = document.querySelector('.cat-yarn');
  if (!stage || !stage.animate) return;
  const cat = stage.querySelector('.cy-cat'), ball = stage.querySelector('.cy-ball'), spin = ball.querySelector('svg');
  const thread = stage.querySelector('.cy-thread');
  const stand = cat.querySelector('.cy-stand'), sit = cat.querySelector('.cy-sit');
  const legs = [...cat.querySelectorAll('.cy-leg')], paw = cat.querySelector('.cy-paw');
  const tail = cat.querySelector('.cy-tail'), sitTail = cat.querySelector('.cy-sit-tail'), eye = cat.querySelector('.cy-sit-eye');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const W = () => stage.clientWidth, cw = () => cat.offsetWidth, bd = () => ball.offsetWidth;
  const at = (el, x, y = 0) => { el.style.translate = `${x}px ${y}px`; };
  const run = (el, frames, opts) => el.animate(frames, { fill: 'forwards', ...opts }).finished;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let catX = 0, ballX = 0, turns = 0;

  function place() {
    catX = 0; ballX = cw() * 0.9;
    at(cat, catX); at(ball, ballX); thread.style.left = `${ballX + bd() / 2}px`; thread.style.width = '0px';
  }
  // Roll the ball to x, turning it as it goes and paying out the thread behind it.
  function roll(to, duration, easing) {
    const from = ballX, r = bd() / 2; ballX = to;
    const deg = ((to - from) / r) * (180 / Math.PI), a = turns; turns += deg;
    const start = parseFloat(thread.style.left);
    return Promise.all([
      run(ball, [{ translate: `${from}px 0` }, { translate: `${to}px 0` }], { duration, easing }),
      run(spin, [{ rotate: `${a}deg` }, { rotate: `${turns}deg` }], { duration, easing }),
      run(thread, [{ width: `${Math.max(0, from + r - start)}px` }, { width: `${Math.max(0, to + r - start)}px` }], { duration, easing }),
    ]);
  }
  function walk(on) {
    walk.anims = walk.anims || [];
    walk.anims.forEach((a) => a.cancel()); walk.anims = [];
    if (!on) return;
    legs.forEach((leg, i) => walk.anims.push(leg.animate([{ rotate: '-24deg' }, { rotate: '24deg' }], { duration: 230, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: i === 0 || i === 3 ? -230 : 0 }))); // diagonal pairs step together
    walk.anims.push(stand.animate([{ translate: '0 0' }, { translate: '0 -1.5px' }], { duration: 230, iterations: Infinity, direction: 'alternate' }));
  }
  const bat = () => run(paw, [{ rotate: '0deg' }, { rotate: '-75deg', offset: 0.45 }, { rotate: '0deg' }], { duration: 300, easing: 'ease-out' });
  function sitDown() {
    run(stand, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
    run(sit, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    if (reduce) return;
    sitTail.animate([{ rotate: '-10deg' }, { rotate: '22deg' }], { duration: 650, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    eye.animate([{ scale: '1 1' }, { scale: '1 1', offset: 0.94 }, { scale: '1 0.1', offset: 0.97 }, { scale: '1 1' }], { duration: 4200, iterations: Infinity });
  }
  // After the show, hold the final spot as a percentage so it survives a resize.
  function settle() {
    const w = W();
    [[cat, catX], [ball, ballX]].forEach(([el, x]) => { el.getAnimations().forEach((a) => { if (a.effect.getKeyframes().some((k) => 'translate' in k)) { a.commitStyles(); a.cancel(); } }); el.style.translate = `${(x / w) * 100}cqw 0`; });
    thread.getAnimations().forEach((a) => { a.commitStyles(); a.cancel(); });
    const left = parseFloat(thread.style.left), width = parseFloat(thread.style.width);
    thread.style.left = `${(left / w) * 100}cqw`; thread.style.width = `${(width / w) * 100}cqw`;
  }

  async function show() {
    const tailIdle = tail.animate([{ rotate: '-6deg' }, { rotate: '8deg' }], { duration: 900, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
    await wait(500);
    // 1. A tap, then a proper bat that sends the ball rolling.
    await bat(); await roll(ballX + 6, 220, 'ease-out'); await wait(250);
    await bat();
    const far = Math.max(ballX + 80, Math.min(W() * 0.62, W() - bd() - 24));
    const rollFar = roll(far, 1500 + (far - ballX) * 1.2, 'cubic-bezier(.15,.75,.35,1)');
    await wait(550);
    // 2. Chase: trot up behind the ball.
    walk(true);
    const target = far - cw() * 0.92, from = catX; catX = target;
    await run(cat, [{ translate: `${from}px 0` }, { translate: `${target}px 0` }], { duration: Math.max(900, (target - from) * 3.1), easing: 'ease-in-out' });
    walk(false); await rollFar; tailIdle.cancel();
    // 3. Play: crouch and wiggle, pounce, then bat it about.
    await run(stand, [{ translate: '0 0', rotate: '0deg' }, { translate: '0 3px', rotate: '-3deg' }, { translate: '0 3px', rotate: '3deg' }, { translate: '0 3px', rotate: '-3deg' }, { translate: '0 3px', rotate: '2deg' }, { translate: '0 3px', rotate: '0deg' }], { duration: 750 });
    const hop = catX; catX += 16;
    const pushed = roll(ballX + 30, 520, 'ease-out');
    await run(cat, [{ translate: `${hop}px 0` }, { translate: `${hop + 9}px -14px`, offset: 0.45 }, { translate: `${catX}px 0` }], { duration: 380, easing: 'ease-out' });
    run(stand, [{ translate: '0 3px' }, { translate: '0 0' }], { duration: 200 });
    await pushed; await wait(150);
    walk(true); const step = catX; catX = ballX - cw() * 0.88;
    await run(cat, [{ translate: `${step}px 0` }, { translate: `${catX}px 0` }], { duration: 420, easing: 'ease-in-out' }); walk(false);
    await bat(); await roll(ballX + 12, 260, 'ease-out');
    await wait(200); await bat(); await roll(ballX - 7, 300, 'ease-in-out');
    await wait(350);
    // 4. Sit down beside it, tail going.
    if (ballX < catX + cw() * 0.74) await roll(catX + cw() * 0.78, 250, 'ease-out');
    sitDown(); settle();
  }

  place();
  if (reduce) { const x = Math.min(W() * 0.3, W() - cw() - bd() - 8); catX = x; ballX = x + cw() * 0.8; at(cat, catX); at(ball, ballX); sitDown(); return; }
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect(); show();
  }, { threshold: 0.9 });
  io.observe(stage.parentElement);
})();
