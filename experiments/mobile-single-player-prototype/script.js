(() => {
  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    round: 5,
    hand: 3,
    totalHands: 10,
    tricksWon: 2,
    score: 38,
    delta: +6,
    trump: { suit: 'hearts', label: '♥ Hearts' },
    trumpBroken: false,
    view: 'hand',
  };

  // Elements
  const cardsEl = qs('#cardSurface');
  
  const finalizeBtn = qs('#finalizeBtn');
  const toastEl = qs('#toast');
  const sheet = qs('#sheet');
  const sheetHandle = qs('#sheetHandle');
  const statTrump = qs('#statTrump');
  const statBroken = qs('#statBroken');
  const toggleTrumpBrokenBtn = qs('#toggleTrumpBrokenBtn');
  const editScoreBtn = qs('#editScoreBtn');
  const tableView = qs('#tableView');
  const sheetScore = qs('#sheetScore');
  const sheetDelta = qs('#sheetDelta');
  // Stats sheet nodes
  const statRound = qs('#statRound');
  const statHand = qs('#statHand');
  const statHandTotal = qs('#statHandTotal');
  const statTricks = qs('#statTricks');
  const statScore = qs('#statScore');
  const statDelta = qs('#statDelta');
  const statTrumpVal = qs('#statTrumpVal');
  const statBrokenVal = qs('#statBrokenVal');

  const modal = qs('#modal');
  const modalClose = qs('#modalClose');
  const modalCancel = qs('#modalCancel');
  const modalConfirm = qs('#modalConfirm');
  const modalTricks = qs('#modalTricks');
  const modalTrumpBroken = qs('#modalTrumpBroken');
  const modalDelta = qs('#modalDelta');
  const modalFrom = qs('#modalFrom');
  const modalTo = qs('#modalTo');

  function render() {
    sheetScore.textContent = String(state.score);
    sheetDelta.textContent = `${state.delta >= 0 ? '+' : ''}${state.delta}`;

    // Stats sheet
    if (statRound) statRound.textContent = String(state.round);
    if (statHand) statHand.textContent = String(state.hand);
    if (statHandTotal) statHandTotal.textContent = String(state.totalHands);
    if (statTricks) statTricks.textContent = String(state.tricksWon);
    if (statScore) statScore.textContent = String(state.score);
    if (statDelta) statDelta.textContent = `${state.delta >= 0 ? '+' : ''}${state.delta}`;
    if (statTrumpVal) statTrumpVal.textContent = state.trump.suit === 'hearts' ? '♥' : state.trump.suit === 'diamonds' ? '♦' : state.trump.suit === 'clubs' ? '♣' : '♠';
    if (statBrokenVal) statBrokenVal.textContent = state.trumpBroken ? 'Yes' : 'No';
    if (statBroken) statBroken.setAttribute('aria-pressed', String(state.trumpBroken));
  
    // Always show condensed table; cards live in hand dock
  }

  function showToast(msg, timeout = 1800) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => (toastEl.hidden = true), 160);
    }, timeout);
  }

  // Card interactions
  function toggleCard(card) {
    card.classList.toggle('selected');
    const pressed = card.getAttribute('aria-pressed') === 'true';
    card.setAttribute('aria-pressed', String(!pressed));
  }
  cardsEl.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) toggleCard(card);
  });
  cardsEl.addEventListener('keydown', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleCard(card);
    }
  });

  // No reveal/clear actions; selection toggles per-card.

  // No view toggle; table is default.

  // Group and sort cards by suit desc and rank desc
  const rankOrder = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
  const suitOrder = ['spades','hearts','diamonds','clubs'];
  function sortHand() {
    const cards = Array.from(cardsEl.querySelectorAll('.card'));
    const groups = { spades: [], hearts: [], diamonds: [], clubs: [] };
    cards.forEach((c) => {
      const s = c.getAttribute('data-suit');
      groups[s] && groups[s].push(c);
    });
    // Sort each group by rank desc
    for (const s of Object.keys(groups)) {
      groups[s].sort((a, b) => rankOrder.indexOf(a.getAttribute('data-rank')) - rankOrder.indexOf(b.getAttribute('data-rank')));
    }
    // Append in suit order, tightly grouped (no separators for compactness)
    for (const s of suitOrder) {
      if (!groups[s].length) continue;
      groups[s].forEach((node) => cardsEl.appendChild(node));
    }
  }

  // Finalize modal
  function openModal() {
    modalTricks.textContent = String(state.tricksWon);
    modalTrumpBroken.textContent = state.trumpBroken ? 'Yes' : 'No';
    modalDelta.textContent = `${state.delta >= 0 ? '+' : ''}${state.delta}`;
    modalFrom.textContent = String(state.score);
    modalTo.textContent = String(state.score + state.delta);
    modal.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
  }
  const detailsBtn = qs('#detailsBtn');
  if (finalizeBtn) finalizeBtn.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
  modalConfirm.addEventListener('click', () => {
    // Simulate advancing state
    state.score += state.delta;
    state.delta = Math.round((Math.random() - 0.3) * 10); // new random delta
    state.tricksWon = Math.max(0, Math.min(10, state.tricksWon + (Math.random() > 0.5 ? 1 : -1)));
    if (state.hand < state.totalHands) {
      state.hand += 1;
    } else {
      state.round += 1; state.hand = 1;
    }
    closeModal();
    render();
    showToast('Round finalized');
  });

  // Chips and sheet actions
  const trumpSuits = [
    { suit: 'hearts', label: '♥ Hearts' },
    { suit: 'diamonds', label: '♦ Diamonds' },
    { suit: 'clubs', label: '♣ Clubs' },
    { suit: 'spades', label: '♠ Spades' },
  ];
  statTrump.addEventListener('click', () => {
    const i = trumpSuits.findIndex((s) => s.suit === state.trump.suit);
    state.trump = trumpSuits[(i + 1) % trumpSuits.length];
    render();
    showToast(`Trump set: ${state.trump.label}`, 1200);
  });
  function toggleTrumpBroken() {
    state.trumpBroken = !state.trumpBroken;
    render();
    showToast(`Trump broken: ${state.trumpBroken ? 'Yes' : 'No'}`, 1200);
  }
  statBroken.addEventListener('click', toggleTrumpBroken);
  toggleTrumpBrokenBtn.addEventListener('click', toggleTrumpBroken);

  // No label toggle; full labels always shown.

  editScoreBtn.addEventListener('click', () => {
    const v = prompt('Enter score delta (e.g., +3 or -2):', String(state.delta));
    if (v == null) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return showToast('Invalid number', 1200);
    state.delta = Math.trunc(n);
    render();
  });

  // Bottom sheet behavior
  // States: peek, mid, full — cycle on tap; allow drag to nearest snap
  const SheetState = { Peek: 'peek', Mid: 'mid', Full: 'full' };
  let sheetState = SheetState.Peek;
  function setSheetState(s) {
    sheet.classList.remove('sheet--peek', 'sheet--mid', 'sheet--full');
    if (s === SheetState.Peek) sheet.classList.add('sheet--peek');
    if (s === SheetState.Mid) sheet.classList.add('sheet--mid');
    if (s === SheetState.Full) sheet.classList.add('sheet--full');
    sheet.setAttribute('aria-expanded', String(s !== SheetState.Peek));
    sheetHandle.setAttribute('aria-expanded', String(s !== SheetState.Peek));
    sheetState = s;
  }
  setSheetState(SheetState.Peek);

  sheetHandle.addEventListener('click', () => {
    const next = sheetState === SheetState.Peek ? SheetState.Mid : sheetState === SheetState.Mid ? SheetState.Full : SheetState.Peek;
    setSheetState(next);
  });

  if (detailsBtn) {
    detailsBtn.addEventListener('click', () => {
      setSheetState(SheetState.Full);
    });
  }

  // Drag
  let startY = 0;
  let startTransform = 0; // px
  let dragging = false;
  const onPointerDown = (e) => {
    dragging = true;
    startY = e.clientY;
    const m = getComputedStyle(sheet).transform; // matrix(a,b,c,d,tx,ty)
    const ty = /
      matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([^)]+)\)
    /x.test(m) ? parseFloat(m.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([^)]+)\)/)[1]) : 0;
    startTransform = ty;
    sheet.style.transition = 'none';
    sheet.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const nextTy = Math.max(-window.innerHeight * 0.06, startTransform + dy); // cap near full
    sheet.style.transform = `translateY(${nextTy}px)`;
  };
  const onPointerUp = (e) => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    // Decide nearest snap: peek (~calc), mid (~40vh), full (~6vh)
    const rect = sheet.getBoundingClientRect();
    const visible = window.innerHeight - rect.top; // px of visible height
    const vh = window.innerHeight;
    const targets = [
      { s: SheetState.Peek, h: 56 },
      { s: SheetState.Mid, h: vh - vh * 0.40 },
      { s: SheetState.Full, h: vh - vh * 0.06 },
    ];
    let nearest = targets[0];
    let min = Infinity;
    for (const t of targets) {
      const diff = Math.abs(visible - t.h);
      if (diff < min) { min = diff; nearest = t; }
    }
    setSheetState(nearest.s);
    sheet.releasePointerCapture(e.pointerId);
  };
  sheetHandle.addEventListener('pointerdown', onPointerDown);
  sheetHandle.addEventListener('pointermove', onPointerMove);
  sheetHandle.addEventListener('pointerup', onPointerUp);
  sheetHandle.addEventListener('pointercancel', onPointerUp);

  // Init
  render();
  sortHand();
})();
