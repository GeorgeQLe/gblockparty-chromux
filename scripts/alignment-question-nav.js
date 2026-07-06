(function () {
  const blocks = Array.from(document.querySelectorAll('.qblock, .gate'))
    .filter((block, index, all) => {
      if (all.some(other => other !== block && other.contains(block))) return false;
      return block.querySelector('input[type="radio"], input[type="checkbox"], input[type="text"], textarea:not([readonly])');
    });
  if (!blocks.length) return;

  function isAnswered(block) {
    const radios = Array.from(block.querySelectorAll('input[type="radio"]'));
    const radioNames = Array.from(new Set(radios.map(input => input.name).filter(Boolean)));
    if (radioNames.length) {
      return radioNames.every(name => block.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`));
    }
    const checks = Array.from(block.querySelectorAll('input[type="checkbox"]'));
    if (checks.length) return checks.some(input => input.checked);
    const textInputs = Array.from(block.querySelectorAll('input[type="text"], textarea:not([readonly])'));
    return textInputs.some(input => input.value.trim());
  }

  function unanswered() {
    return blocks.filter(block => !isAnswered(block));
  }

  function jump(fromBlock, dir) {
    const open = unanswered();
    if (!open.length) return;
    const currentIndex = open.indexOf(fromBlock);
    const baseIndex = currentIndex === -1 ? open.findIndex(block => blocks.indexOf(block) > blocks.indexOf(fromBlock)) : currentIndex;
    const nextIndex = (baseIndex + dir + open.length) % open.length;
    const target = open[nextIndex];
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('question-nav-highlight');
    setTimeout(() => target.classList.remove('question-nav-highlight'), 1400);
  }

  const style = document.createElement('style');
  style.textContent = `
    .question-nav{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin:.55rem 0 0;color:var(--muted,#8b949e);font-size:.86rem}
    .question-nav button{min-height:32px;border:1px solid var(--border,#30363d);border-radius:6px;background:transparent;color:var(--accent,#58a6ff);cursor:pointer}
    .question-nav button:disabled{opacity:.45;cursor:not-allowed}
    .question-nav-highlight{outline:2px solid var(--accent,#58a6ff);outline-offset:3px}
  `;
  document.head.appendChild(style);

  function makeNav(block) {
    const nav = document.createElement('div');
    nav.className = 'question-nav';
    nav.innerHTML = '<button type="button" data-dir="-1">prev unanswered</button><span></span><button type="button" data-dir="1">next unanswered</button>';
    nav.addEventListener('click', event => {
      const button = event.target.closest('button[data-dir]');
      if (button) jump(block, Number(button.dataset.dir));
    });
    return nav;
  }

  const navs = blocks.map(block => {
    const nav = makeNav(block);
    block.appendChild(nav);
    return nav;
  });
  const compile = document.querySelector('#compile');
  if (compile) {
    const nav = makeNav(blocks[0]);
    compile.insertBefore(nav, compile.firstElementChild ? compile.firstElementChild.nextSibling : null);
    navs.push(nav);
  }

  function update() {
    const count = unanswered().length;
    navs.forEach(nav => {
      nav.querySelector('span').textContent = count ? `${count} left` : 'All answered';
      nav.querySelectorAll('button').forEach(button => { button.disabled = !count; });
    });
  }
  document.addEventListener('input', update);
  document.addEventListener('change', update);
  update();
}());
