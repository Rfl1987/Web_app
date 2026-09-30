import { isAuthed, showLoginScreen, clearSession } from './auth';
import './style.css';
import { tr } from './i18n';
import type { SyncStatus } from './sync';
import { enqueue, processQueue, retryFailed, retryAllFailed, getQueue } from './sync';
import { savePhoto, deletePhoto, getThumbUrl, getPhotoUrl, getSignatureUrl, saveSignature, dataUrlToBlob, invalidatePhoto } from './storage';

type Handover = {
  id: string;
  customerName: string;
  licenseNumber: string;
  vehicle: string;
  returnDate: string;
  returnTime: string;
  handoverAt: string;
  photos: string[];
  signature: string;
  synced: boolean;
syncStatus?: SyncStatus;
syncError?: string;
syncedAt?: string;
};

type DamageMark = { x: number; y: number; r: number };

export { getHandovers, saveHandovers };
const STORAGE_KEY = 'myauto-handovers';
const app = document.querySelector<HTMLDivElement>('#app')!;

function getHandovers(): Handover[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveHandovers(items: Handover[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function nowText() {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function value(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() || '';
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, char => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return map[char];
  });
}

function updateItem(item: Handover) {
  const items = getHandovers();
  const index = items.findIndex(x => x.id === item.id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
  saveHandovers(items);
}

function dashboard() {
  const items = getHandovers();
  app.innerHTML = `
<main class="shell">
<header class="topbar">
<img class="app-logo" src="/carlogo.png" alt="MyAuto Rent a Car" />
<button class="icon-btn logout-btn" id="menuBtn" title="Logout">⎋</button>
</header>
<section class="hero">
<div>
<p class="eyebrow">RENTAL OPERATIONS</p>
<h1>Vehicle handovers</h1>
<p class="muted">Create, document and confirm every vehicle delivery.</p>
</div>
</section>
<button class="primary large" id="newBtn">
<span class="plus">＋</span>
New Handover
</button>
<section class="stats">
<div class="stat">
<strong>${items.length}</strong>
<span>Total</span>
</div>
<div class="stat">
<strong>${items.filter(x => !x.synced).length}</strong>
<span>Not synced</span>
</div>
<div class="stat">
<strong>${items.filter(x => x.syncStatus === 'failed').length}</strong>
<span>Failed</span>
</div>
</section>
<div class="sync-actions">
<button class="secondary" id="retryAllBtn">Retry failed</button>
<button class="primary" id="syncNowBtn">Sync now</button>
</div>
<section class="section">
<div class="section-title">
<h2>Recent handovers</h2>
</div>
<div id="handoverList">
${
  items.length
    ? items
        .slice()
        .reverse()
        .map(
          item => `
<button class="handover-card" data-id="${item.id}">
<div class="vehicle-icon">🚗</div>
<div class="card-main">
<strong>${escapeHtml(item.vehicle)}</strong>
<span>${escapeHtml(item.customerName)}</span>
<small>${item.handoverAt}</small>
</div>
<div class="status ${(item.syncStatus || (item.synced ? 'synced' : 'none'))}">
${statusLabel(item)}
</div>
</button>
`
        )
        .join('')
    : `
<div class="empty">
<div class="empty-icon">＋</div>
<strong>No handovers yet</strong>
<span>Create your first vehicle handover.</span>
</div>
`
}
</div>
</section>
</main>
`;
  document.querySelector('#newBtn')?.addEventListener('click', newHandover);
  document.querySelector('#menuBtn')?.addEventListener('click', () => {
    if (confirm('Logout from MyAuto?')) {
      clearSession();
      showLoginScreen(() => dashboard());
    }
  });
  document.querySelector('#syncNowBtn')?.addEventListener('click', async () => {
    const btn = document.querySelector<HTMLButtonElement>('#syncNowBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing...'; }
    await processQueue();
    dashboard();
  });
  document.querySelector('#retryAllBtn')?.addEventListener('click', async () => {
    retryAllFailed();
    dashboard();
  });
  document.addEventListener('sync-status-changed', () => {
    if (document.querySelector('#syncNowBtn')) dashboard();
  });
  document.querySelectorAll<HTMLButtonElement>('.handover-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = getHandovers().find(x => x.id === card.dataset.id);
      if (item) showHandover(item);
    });
  });
}

function newHandover() {
  const handoverAt = nowText();
  app.innerHTML = `
<main class="shell">
<header class="page-header">
<button class="back" id="backBtn">←</button>
<div>
<div class="brand small-brand">MY<span>AUTO</span></div>
<h1>New Handover</h1>
</div>
</header>
<form id="handoverForm" class="form">
<section class="panel">
<div class="panel-title">
<span class="step">1</span>
<div>
<h2>Customer & vehicle</h2>
<p>Enter the rental information.</p>
</div>
</div>
<label>
Customer name
<input id="customerName" required placeholder="John Smith" />
</label>
<label>
Driver license number
<input id="licenseNumber" required placeholder="DL-12345678" />
</label>
<label>
Vehicle
<input id="vehicle" required placeholder="Toyota Camry — 10-AA-123" />
</label>
<label>
Return date
<input id="returnDate" required type="date" />
</label>
<label>
Return time
<input id="returnTime" required type="time" />
</label>
<div class="automatic">
<span>Handover time</span>
<strong>${handoverAt}</strong>
<small>Automatically recorded</small>
</div>
</section>
<button class="primary" type="submit">
Save & Continue
<span>→</span>
</button>
</form>
</main>
`;
  document.querySelector('#backBtn')?.addEventListener('click', dashboard);
  document.querySelector<HTMLFormElement>('#handoverForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const item: Handover = {
      id: crypto.randomUUID(),
      customerName: value('customerName'),
      licenseNumber: value('licenseNumber'),
      vehicle: value('vehicle'),
      returnDate: value('returnDate'),
      returnTime: value('returnTime'),
      handoverAt,
      photos: [],
      signature: '',
      synced: false
    };
    const items = getHandovers();
    items.push(item);
    saveHandovers(items);
    showHandover(item);
  });
}



function showHandover(item: Handover) {
  const locked = !!item.signature;
  app.innerHTML = `
<main class="shell">
<header class="page-header">
<button class="back" id="backBtn">←</button>
<div>
<div class="brand small-brand">MY<span>AUTO</span></div>
<h1>Vehicle inspection</h1>
</div>
</header>
<section class="vehicle-summary">
<span class="status ${item.synced ? 'synced' : 'pending'}">
${item.synced ? 'Synced' : 'Saved locally'}
</span>
<h2>${escapeHtml(item.vehicle)}</h2>
<p>${escapeHtml(item.customerName)}</p>
<div class="summary-row">
<span>License</span>
<strong>${escapeHtml(item.licenseNumber)}</strong>
</div>
<div class="summary-row">
<span>Handover</span>
<strong>${item.handoverAt}</strong>
</div>
<div class="summary-row">
<span>Return</span>
<strong>${item.returnDate} · ${item.returnTime}</strong>
</div>
</section>
${locked ? `<div class="lock-note">🔒 Handover saved and locked. Only “Send information” remains.</div>` : ''}
<section class="panel">
<div class="panel-title">
<span class="step">2</span>
<div>
<h2>Vehicle photos</h2>
<p>${locked ? 'Record is locked. Tap a photo to preview.' : 'Photograph every side and any visible damage. Tap a photo to preview.'}</p>
</div>
</div>
${
  locked
    ? ''
    : `
<button class="camera-btn" id="cameraBtn" type="button">
<span class="camera-icon">⌾</span>
<strong>Take vehicle photos</strong>
<small>Open camera and take a photo</small>
</button>
<input id="photoInput" type="file" accept="image/*" multiple hidden />
`
}
<div class="photo-grid" id="photoGrid">
${
  item.photos.length
    ? item.photos
        .map(
          (photo, index) => `
<div class="photo" data-index="${index}">
<img data-photo="${photo}" alt="Vehicle photo ${index + 1}" />
<span>${index + 1}</span>
${locked ? '' : `<button class="photo-delete" data-index="${index}" type="button" aria-label="Delete">×</button>`}
</div>
`
        )
        .join('')
    : `<div class="photo-empty">No photos captured yet.</div>`
}
</div>
</section>
<section class="panel">
<div class="panel-title">
<span class="step">3</span>
<div>
<h2>Damage marking</h2>
<p>Drag on a photo to draw a red circle around damage.</p>
</div>
</div>
<button class="secondary" id="damageBtn" ${item.photos.length && !locked ? '' : 'disabled'}>
Mark damage on a photo
</button>
</section>
<section class="panel">
<div class="panel-title">
<span class="step">4</span>
<div>
<h2>Customer signature</h2>
<p>${locked ? 'Signature saved with the record.' : 'Customer confirms the vehicle condition.'}</p>
</div>
</div>
<div class="signature-box${locked ? ' locked' : ''}">
${locked ? `<img id="signatureImg" alt="Customer signature" />` : `<canvas id="signatureCanvas" width="600" height="240"></canvas>`}
<span>Customer signature</span>
</div>
${locked ? '' : `<button class="secondary" id="clearSignature">Clear signature</button>`}
</section>
<div class="bottom-actions${locked ? ' single' : ''}">
${locked ? '' : `<button class="secondary" id="saveBtn">Save locally</button>`}
${item.syncStatus === 'synced' ? '<button class="primary" id="sendBtn" disabled>✓ Synced</button>' : '<button class="primary" id="sendBtn">Send information</button>'}
</div>
</main>
`;
  document.querySelectorAll<HTMLImageElement>('#photoGrid img[data-photo]').forEach(img => {
    getThumbUrl(img.dataset.photo || '').then(u => {
      if (u) img.src = u;
    });
  });
  if (locked) {
    getSignatureUrl(item.id).then(u => {
      const el = document.querySelector<HTMLImageElement>('#signatureImg');
      if (el && u) el.src = u;
    });
  }
  document.querySelector('#backBtn')?.addEventListener('click', dashboard);
  document.querySelector('#cameraBtn')?.addEventListener('click', () => {
    openCamera(item);
  });
  document.querySelector<HTMLInputElement>('#photoInput')?.addEventListener('change', async e => {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    try {
      for (const file of files) {
        const id = await savePhoto(item.id, file);
        item.photos.push(id);
      }
      updateItem(item);
      showHandover(item);
    } catch (err) {
      alert('Could not save photos: ' + (err as Error).message);
    }
  });
  document.querySelectorAll<HTMLDivElement>('.photo').forEach(el => {
    el.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.photo-delete')) return;
      photoPreview(item, Number(el.dataset.index));
    });
  });
  if (!locked) {
    document.querySelectorAll<HTMLButtonElement>('.photo-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (confirm('Delete this photo?')) {
          const idx = Number(btn.dataset.index);
          await deletePhoto(item.photos[idx]);
          item.photos.splice(idx, 1);
          updateItem(item);
          showHandover(item);
        }
      });
    });
  }
  document.querySelector('#damageBtn')?.addEventListener('click', () => {
    if (!item.photos.length || locked) return;
    damageEditor(item);
  });
  if (!locked) setupSignature(item);
  document.querySelector('#saveBtn')?.addEventListener('click', async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#signatureCanvas');
    let ink = false;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] !== 0) {
          ink = true;
          break;
        }
      }
      if (ink) {
        try {
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
          if (blob) await saveSignature(item.id, blob);
          item.signature = 'idb';
        } catch (err) {
          alert('Could not save signature: ' + (err as Error).message);
          return;
        }
      }
    }
    updateItem(item);
    if (ink) {
      alert('Handover saved and locked. Only “Send information” remains.');
      showHandover(item);
    } else {
      alert(tr('Handover saved locally.'));
    }
  });
  document.querySelector('#sendBtn')?.addEventListener('click', async () => {
    if (item.syncStatus === 'synced') return;
    updateItem(item);
    enqueue(item.id);
    const btn = document.querySelector<HTMLButtonElement>('#sendBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending...';
    }
    await processQueue();
    const fresh = getHandovers().find(x => x.id === item.id);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send information';
    }
    if (fresh?.syncStatus === 'synced') {
      alert('Handover sent successfully.');
    } else if (fresh?.syncStatus === 'failed') {
      alert('Send failed: ' + (fresh.syncError || 'unknown') + '. Will retry when online.');
    } else {
      alert('Queued for sync. Will send when online.');
    }
    showHandover(getHandovers().find(x => x.id === item.id) || item);
  });
}



function damageEditor(item: Handover, initialIndex = 0) {
  let photoIndex = Math.min(initialIndex, item.photos.length - 1);
  type Pt = { x: number; y: number };
  type Mark = { type: 'pen'; points: Pt[] } | { type: 'circle'; x: number; y: number; r: number };
  let marks: Mark[] = [];
  let mode: 'pen' | 'circle' | 'scroll' = 'pen';
  let drawing = false;
  let currentPen: Pt[] = [];
  let circleStart: Pt = { x: 0, y: 0 };
  let circleCurrent: Pt = { x: 0, y: 0 };
  const view = { s: 1, tx: 0, ty: 0 };
  let panning = false;
  let panLast: Pt = { x: 0, y: 0 };
  let scrollLastY = 0;
  const pointers = new Map<number, Pt>();
  let pinching = false;
  let pinchStartDist = 0;
  let pinchStartMid: Pt = { x: 0, y: 0 };
  let pinchStartView = { s: 1, tx: 0, ty: 0 };

  const render = () => {
    view.s = 1;
    view.tx = 0;
    view.ty = 0;
    app.innerHTML = `
<main class="shell">
<header class="page-header">
<button class="back" id="backBtn">←</button>
<div>
<div class="brand small-brand">MY<span>AUTO</span></div>
<h1>Mark damage</h1>
</div>
</header>
<p class="muted damage-help">
Pen: draw freehand. Circle: drag from center. Scroll: move page or pan when zoomed. Pinch to zoom.
</p>
<div class="damage-photo-strip" id="damageStrip">
${item.photos
  .map(
    (p, i) => `
<button type="button" class="damage-thumb ${i === photoIndex ? 'active' : ''}" data-index="${i}">
<img data-photo="${p}" alt="Photo ${i + 1}" />
<span>${i + 1}</span>
</button>
`
  )
  .join('')}
</div>
<div class="damage-tools">
<button type="button" class="damage-tool ${mode === 'pen' ? 'active' : ''}" data-mode="pen">✏ Pen</button>
<button type="button" class="damage-tool ${mode === 'circle' ? 'active' : ''}" data-mode="circle">◯ Circle</button>
<button type="button" class="damage-tool ${mode === 'scroll' ? 'active' : ''}" data-mode="scroll">✋ Scroll</button>
</div>
<div class="damage-actions">
<button class="secondary" id="undoDamage">Undo</button>
<button class="secondary" id="clearDamage">Clear</button>
</div>
<button class="primary" id="saveDamage">Save damage marking</button>
<div class="damage-viewport" id="damageViewport">
<div class="damage-zoom">
<button type="button" id="zoomOutBtn">−</button>
<span id="zoomLabel">100%</span>
<button type="button" id="zoomInBtn">+</button>
<button type="button" id="zoomResetBtn">⟲</button>
</div>
<div class="damage-transform" id="damageTransform">
<img id="damageImage" alt="Vehicle damage" />
<canvas id="damageCanvas"></canvas>
</div>
</div>
</main>
`;
    wireDamage();
  };

  const strokePts = (ctx: CanvasRenderingContext2D, pts: Pt[]) => {
    if (!pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y);
    ctx.stroke();
  };

  const redraw = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('#damageCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#ff3030';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const m of marks) {
      if (m.type === 'pen') strokePts(ctx, m.points);
      else {
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (drawing && mode === 'pen') strokePts(ctx, currentPen);
    if (drawing && mode === 'circle') {
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(
        circleStart.x,
        circleStart.y,
        Math.hypot(circleCurrent.x - circleStart.x, circleCurrent.y - circleStart.y),
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const getPos = (e: PointerEvent) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#damageCanvas')!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const wireDamage = () => {
    document.querySelector('#backBtn')?.addEventListener('click', () => showHandover(item));
    const img = document.querySelector<HTMLImageElement>('#damageImage')!;
    const canvas = document.querySelector<HTMLCanvasElement>('#damageCanvas')!;
    const viewport = document.querySelector<HTMLDivElement>('#damageViewport')!;
    const transformEl = document.querySelector<HTMLDivElement>('#damageTransform')!;
    const label = document.querySelector<HTMLElement>('#zoomLabel')!;

    document.querySelectorAll<HTMLImageElement>('.damage-thumb img[data-photo]').forEach(t => {
      getThumbUrl(t.dataset.photo || '').then(u => {
        if (u) t.src = u;
      });
    });
    getPhotoUrl(item.photos[photoIndex]).then(u => {
      if (u) img.src = u;
    });
    const sizeCanvas = () => {
      canvas.width = img.clientWidth;
      canvas.height = img.clientHeight;
      redraw();
    };
    if (img.complete && img.naturalWidth) sizeCanvas();
    img.addEventListener('load', sizeCanvas);
    window.addEventListener('resize', sizeCanvas);

    const clampView = () => {
      view.s = Math.max(1, Math.min(6, view.s));
      const vpW = viewport.clientWidth;
      const baseH = transformEl.offsetHeight || viewport.clientHeight;
      view.tx = Math.max(vpW * (1 - view.s), Math.min(0, view.tx));
      view.ty = Math.max(baseH * (1 - view.s), Math.min(0, view.ty));
    };
    const applyView = () => {
      clampView();
      transformEl.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
      label.textContent = `${Math.round(view.s * 100)}%`;
    };
    const zoomAround = (mid: Pt, newScale: number) => {
      const s2 = Math.max(1, Math.min(6, newScale));
      view.tx = mid.x - (s2 / view.s) * (mid.x - view.tx);
      view.ty = mid.y - (s2 / view.s) * (mid.y - view.ty);
      view.s = s2;
      applyView();
    };
    applyView();

    document.querySelector('.damage-zoom')?.addEventListener('pointerdown', e => e.stopPropagation());
    document.querySelector('#zoomInBtn')?.addEventListener('click', () => {
      zoomAround({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }, view.s * 1.5);
    });
    document.querySelector('#zoomOutBtn')?.addEventListener('click', () => {
      zoomAround({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }, view.s / 1.5);
    });
    document.querySelector('#zoomResetBtn')?.addEventListener('click', () => {
      view.s = 1;
      view.tx = 0;
      view.ty = 0;
      applyView();
    });

    document.querySelectorAll<HTMLButtonElement>('.damage-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = (btn.dataset.mode as 'pen' | 'circle' | 'scroll') || 'pen';
        drawing = false;
        currentPen = [];
        document.querySelectorAll<HTMLButtonElement>('.damage-tool').forEach(b =>
          b.classList.toggle('active', b === btn)
        );
      });
    });

    const vpPoint = (e: MouseEvent) => {
      const r = viewport.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    viewport.addEventListener('pointerdown', e => {
      const p = vpPoint(e);
      pointers.set(e.pointerId, p);
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
        pinchStartMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinchStartView = { s: view.s, tx: view.tx, ty: view.ty };
        pinching = true;
        if (drawing) {
          drawing = false;
          currentPen = [];
          redraw();
        }
        return;
      }
      if (pinching) return;
      if (mode === 'scroll') {
        if (view.s > 1) {
          panning = true;
          panLast = p;
        } else {
          scrollLastY = e.clientY;
        }
        return;
      }
      drawing = true;
      const cp = getPos(e);
      if (mode === 'pen') currentPen = [cp];
      else {
        circleStart = cp;
        circleCurrent = cp;
      }
      redraw();
    });
    viewport.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const p = vpPoint(e);
      pointers.set(e.pointerId, p);
      if (pinching && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const s2 = Math.max(1, Math.min(6, (pinchStartView.s * dist) / (pinchStartDist || 1)));
        view.s = s2;
        view.tx = mid.x - (s2 / pinchStartView.s) * (pinchStartMid.x - pinchStartView.tx);
        view.ty = mid.y - (s2 / pinchStartView.s) * (pinchStartMid.y - pinchStartView.ty);
        applyView();
        return;
      }
      if (mode === 'scroll') {
        if (panning) {
          view.tx += p.x - panLast.x;
          view.ty += p.y - panLast.y;
          panLast = p;
          applyView();
        } else if (view.s === 1) {
          window.scrollBy(0, scrollLastY - e.clientY);
          scrollLastY = e.clientY;
        }
        return;
      }
      if (!drawing) return;
      const cp = getPos(e);
      if (mode === 'pen') {
        const last = currentPen[currentPen.length - 1];
        if (!last || Math.hypot(cp.x - last.x, cp.y - last.y) > 1.5) currentPen.push(cp);
      } else {
        circleCurrent = cp;
      }
      redraw();
    });
    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinching = false;
      if (pointers.size === 0) {
        if (drawing) {
          drawing = false;
          if (mode === 'pen') {
            if (currentPen.length > 1) marks.push({ type: 'pen', points: currentPen });
            currentPen = [];
          } else {
            const cp = getPos(e);
            const r = Math.hypot(cp.x - circleStart.x, cp.y - circleStart.y);
            if (r > 6) marks.push({ type: 'circle', x: circleStart.x, y: circleStart.y, r });
          }
          redraw();
        }
        panning = false;
      }
    };
    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', endPointer);
    viewport.addEventListener('dblclick', e => {
      zoomAround(vpPoint(e), view.s > 1 ? 1 : 2.5);
    });

    document.querySelectorAll<HTMLButtonElement>('.damage-thumb').forEach(btn => {
      btn.addEventListener('click', () => {
        photoIndex = Number(btn.dataset.index);
        marks = [];
        render();
      });
    });
    document.querySelector('#undoDamage')?.addEventListener('click', () => {
      marks.pop();
      redraw();
    });
    document.querySelector('#clearDamage')?.addEventListener('click', () => {
      marks = [];
      redraw();
    });
    document.querySelector('#saveDamage')?.addEventListener('click', () => {
      const combined = document.createElement('canvas');
      combined.width = img.naturalWidth;
      combined.height = img.naturalHeight;
      const ctx = combined.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const scaleX = combined.width / canvas.width;
      const scaleY = combined.height / canvas.height;
      const scale = Math.max(scaleX, scaleY);
      ctx.strokeStyle = '#ff3030';
      ctx.lineWidth = 3 * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const m of marks) {
        if (m.type === 'pen') {
          ctx.beginPath();
          ctx.moveTo(m.points[0].x * scaleX, m.points[0].y * scaleY);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x * scaleX, m.points[i].y * scaleY);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(m.x * scaleX, m.y * scaleY, m.r * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      combined.toBlob(
        async b => {
          if (!b) return;
          try {
            await savePhoto(item.id, b, item.photos[photoIndex]);
            updateItem(item);
            showHandover(item);
          } catch (err) {
            alert('Could not save damage marking: ' + (err as Error).message);
          }
        },
        'image/jpeg',
        0.9
      );
    });
  };

  render();
}
function setupSignature(item: Handover) {
  const canvas = document.querySelector<HTMLCanvasElement>('#signatureCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111';
  let drawing = false;
  const position = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  };
  canvas.addEventListener('pointerdown', e => {
    drawing = true;
    const p = position(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = position(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  window.addEventListener('pointerup', () => {
    drawing = false;
  });
  document.querySelector('#clearSignature')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}


function photoPreview(item: Handover, index: number) {
  const locked = !!item.signature;
  const existing = document.querySelector('#photoPreviewModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'photoPreviewModal';
  modal.innerHTML = `
<div class="photo-preview-modal">
<div class="photo-preview-top">
<button type="button" id="closePhotoPreview" class="ppv-close">×</button>
<strong class="ppv-title">Photo ${index + 1}</strong>
${locked ? '<span></span>' : '<button type="button" id="deletePhotoPreview" class="ppv-delete">Delete</button>'}
</div>
<div class="photo-preview-wrap" id="ppvWrap">
<img id="ppvImage" alt="Preview" />
</div>
<div class="ppv-hint">Pinch to zoom</div>
</div>
`;
  document.body.appendChild(modal);
  const img = modal.querySelector<HTMLImageElement>('#ppvImage')!;
  const wrap = modal.querySelector<HTMLDivElement>('#ppvWrap')!;
  getPhotoUrl(item.photos[index]).then(u => {
    if (u) img.src = u;
  });
  let scale = 1;
  let startDist = 0;
  let startScale = 1;
  const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const applyScale = () => {
    img.style.transform = `scale(${scale})`;
  };
  wrap.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches[0], e.touches[1]);
        startScale = scale;
      }
    },
    { passive: true }
  );
  wrap.addEventListener(
    'touchmove',
    e => {
      if (e.touches.length === 2) {
        const d = dist(e.touches[0], e.touches[1]);
        scale = Math.max(1, Math.min(5, startScale * (d / startDist)));
        applyScale();
      }
    },
    { passive: true }
  );
  wrap.addEventListener('dblclick', () => {
    scale = scale > 1 ? 1 : 2;
    applyScale();
  });
  modal.querySelector('#closePhotoPreview')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target === wrap) {
      if (scale === 1) modal.remove();
      else {
        scale = 1;
        applyScale();
      }
    }
  });
  modal.querySelector('#deletePhotoPreview')?.addEventListener('click', async () => {
    if (confirm('Delete this photo?')) {
      await deletePhoto(item.photos[index]);
      item.photos.splice(index, 1);
      updateItem(item);
      modal.remove();
      showHandover(item);
    }
  });
}
function openCamera(item: Handover) {
  const existing = document.querySelector('#cameraModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'cameraModal';
  modal.innerHTML = `
<div class="camera-modal">
<div class="camera-screen camera-live">
<div class="camera-top">
<strong>Vehicle photo</strong>
<button type="button" id="closeCamera">×</button>
</div>
<div class="camera-video-wrap" id="cameraVideoWrap">
<video id="cameraVideo" autoplay playsinline muted></video>
</div>
<div class="camera-bottom">
<button type="button" class="camera-fallback" id="cameraFallback">
Choose photo
</button>
<button type="button" class="camera-capture" id="capturePhoto">
<span></span>
</button>
<div style="width:72px"></div>
</div>
</div>
<div class="camera-screen camera-preview" hidden>
<div class="camera-top">
<button type="button" id="previewRetake">↺</button>
<strong>Preview</strong>
<button type="button" id="previewConfirm">✓</button>
</div>
<div class="preview-image-wrap" id="previewWrap">
<img id="previewImage" alt="Preview" />
</div>
<div class="ppv-hint">Pinch to zoom</div>
</div>
<canvas id="cameraCanvas" hidden></canvas>
</div>
`;
  document.body.appendChild(modal);
  const video = modal.querySelector<HTMLVideoElement>('#cameraVideo')!;
  const videoWrap = modal.querySelector<HTMLDivElement>('#cameraVideoWrap')!;
  const canvas = modal.querySelector<HTMLCanvasElement>('#cameraCanvas')!;
  const closeBtn = modal.querySelector<HTMLButtonElement>('#closeCamera')!;
  const captureBtn = modal.querySelector<HTMLButtonElement>('#capturePhoto')!;
  const fallbackBtn = modal.querySelector<HTMLButtonElement>('#cameraFallback')!;
  const input = document.querySelector<HTMLInputElement>('#photoInput')!;
  const liveScreen = modal.querySelector<HTMLDivElement>('.camera-live')!;
  const previewScreen = modal.querySelector<HTMLDivElement>('.camera-preview')!;
  const previewImage = modal.querySelector<HTMLImageElement>('#previewImage')!;
  const previewWrap = modal.querySelector<HTMLDivElement>('#previewWrap')!;
  const retakeBtn = modal.querySelector<HTMLButtonElement>('#previewRetake')!;
  const confirmBtn = modal.querySelector<HTMLButtonElement>('#previewConfirm')!;
  let stream: MediaStream | null = null;
  let videoTrack: MediaStreamTrack | null = null;
  let imageCapture: ImageCapture | null = null;
  let focusModes: string[] = [];
  let capturedBlobUrl: string | null = null;
  let capturedBlob: Blob | null = null;
  const closeCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    if (capturedBlobUrl) URL.revokeObjectURL(capturedBlobUrl);
    modal.remove();
  };
  closeBtn.addEventListener('click', closeCamera);
  fallbackBtn.addEventListener('click', () => {
    closeCamera();
    input.click();
  });
  const canvasFallbackCapture = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      if (!video.videoWidth || !video.videoHeight) return reject(new Error('no video'));
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.92);
    });
  const showPreview = async (blob: Blob) => {
    capturedBlob = blob;
    capturedBlobUrl = URL.createObjectURL(blob);
    previewImage.src = capturedBlobUrl;
    previewImage.style.transform = '';
    liveScreen.hidden = true;
    previewScreen.hidden = false;
  };
  const showLive = () => {
    if (capturedBlobUrl) URL.revokeObjectURL(capturedBlobUrl);
    capturedBlobUrl = null;
    capturedBlob = null;
    liveScreen.hidden = false;
    previewScreen.hidden = true;
  };
  retakeBtn.addEventListener('click', showLive);
  confirmBtn.addEventListener('click', async () => {
    if (!capturedBlob) return;
const id = await savePhoto(item.id, capturedBlob);
item.photos.push(id);
    updateItem(item);
    closeCamera();
    showHandover(item);
  });
  captureBtn.addEventListener('click', async () => {
    try {
      let blob: Blob;
      if (imageCapture && typeof imageCapture.takePhoto === 'function') {
        try {
          blob = await imageCapture.takePhoto({ quality: 0.95 } as PhotoSettings);
        } catch {
          blob = await canvasFallbackCapture();
        }
      } else {
        blob = await canvasFallbackCapture();
      }
      await showPreview(blob);
    } catch {
      // silent
    }
  });
  videoWrap.addEventListener('pointerdown', e => {
    const rect = videoWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ring = document.createElement('div');
    ring.className = 'focus-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    videoWrap.appendChild(ring);
    setTimeout(() => ring.remove(), 900);
    if (!videoTrack) return;
    const nx = Math.min(1, Math.max(0, x / rect.width));
    const ny = Math.min(1, Math.max(0, y / rect.height));
    (async () => {
      try {
        const caps: any = videoTrack!.getCapabilities?.() || {};
        const advanced: any = {};
        if (caps.focusPointOfInterest) {
          advanced.focusPointOfInterest = { x: nx, y: ny };
          advanced.focusMode = 'single-shot';
        } else if (focusModes.includes('single-shot')) {
          advanced.focusMode = 'single-shot';
        } else if (focusModes.includes('continuous')) {
          advanced.focusMode = 'continuous';
        } else {
          return;
        }
        await videoTrack!.applyConstraints({ advanced: [advanced] });
        if (advanced.focusMode === 'single-shot' && focusModes.includes('continuous')) {
          setTimeout(() => {
            videoTrack
              ?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] })
              .catch(() => {});
          }, 1500);
        }
      } catch {
        // ignore
      }
    })();
  });
  let scale = 1;
  let startDist = 0;
  let startScale = 1;
  const tdist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  previewWrap.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length === 2) {
        startDist = tdist(e.touches[0], e.touches[1]);
        startScale = scale;
      }
    },
    { passive: true }
  );
  previewWrap.addEventListener(
    'touchmove',
    e => {
      if (e.touches.length === 2) {
        const d = tdist(e.touches[0], e.touches[1]);
        scale = Math.max(1, Math.min(5, startScale * (d / startDist)));
        previewImage.style.transform = `scale(${scale})`;
      }
    },
    { passive: true }
  );
  if (!navigator.mediaDevices?.getUserMedia) {
    closeCamera();
    input.click();
    return;
  }
  navigator.mediaDevices
    .getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    })
    .then(async mediaStream => {
      stream = mediaStream;
      videoTrack = mediaStream.getVideoTracks()[0] || null;
      video.srcObject = mediaStream;
      try {
        if (typeof ImageCapture !== 'undefined' && videoTrack) {
          imageCapture = new ImageCapture(videoTrack);
        }
      } catch {
        imageCapture = null;
      }
      try {
        if (!videoTrack) return;
        const caps: any = videoTrack.getCapabilities?.() || {};
        focusModes = (caps.focusMode as string[] | undefined) || [];
        if (focusModes.includes('continuous')) {
          await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
        }
      } catch {
        // ignore capability errors
      }
    })
    .catch(() => {
      closeCamera();
      input.click();
    });
}
function setupInspector() {
  if (document.querySelector('#elementInspector')) return;
  const button = document.createElement('button');
  button.id = 'elementInspector';
  button.type = 'button';
  button.textContent = '</>';
  button.title = 'Element inspector';
  document.body.appendChild(button);
  let active = false;
  let panel: HTMLDivElement | null = null;
  const closePanel = () => {
    panel?.remove();
    panel = null;
  };
  const createPanel = (element: HTMLElement) => {
    closePanel();
    let selector = element.tagName.toLowerCase();
    if (element.id) selector += `#${element.id}`;
    else if (element.classList.length) selector += '.' + Array.from(element.classList).join('.');
    const styles = getComputedStyle(element);
    const code = `<${element.tagName.toLowerCase()}${element.id ? ` id="${element.id}"` : ''}${element.className && typeof element.className === 'string' ? ` class="${element.className}"` : ''}>
${element.textContent?.trim().slice(0, 120) || ''}
</${element.tagName.toLowerCase()}>
Selector: ${selector}
CSS:
color: ${styles.color};
background: ${styles.backgroundColor};
font-size: ${styles.fontSize};
border: ${styles.border};
padding: ${styles.padding};
margin: ${styles.margin};`;
    panel = document.createElement('div');
    panel.className = 'inspector-panel';
    panel.innerHTML = `
<div class="inspector-header">
<strong>Element</strong>
<button type="button" id="closeInspectorPanel">×</button>
</div>
<pre id="inspectorCode"></pre>
<button type="button" class="primary" id="copyInspectorCode">
Copy
</button>
`;
    document.body.appendChild(panel);
    const codeEl = panel.querySelector('#inspectorCode');
    codeEl!.textContent = code;
    panel.querySelector('#closeInspectorPanel')?.addEventListener('click', closePanel);
    panel.querySelector('#copyInspectorCode')?.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(code);
      const copyBtn = panel?.querySelector<HTMLButtonElement>('#copyInspectorCode');
      if (copyBtn) {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          if (copyBtn) copyBtn.textContent = 'Copy';
        }, 1200);
      }
    });
  };
  button.addEventListener('click', () => {
    active = !active;
    button.classList.toggle('active', active);
    closePanel();
  });
  document.addEventListener(
    'click',
    event => {
      if (!active) return;
      const target = event.target as HTMLElement;
      if (
        target === button ||
        button.contains(target) ||
        target.closest('#elementInspector') ||
        target.closest('.inspector-panel')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      createPanel(target);
    },
    true
  );
}

function startApp() {
  dashboard();
  window.setTimeout(() => {
    migrateLegacy().catch(e => console.error('[migrate]', e));
  }, 300);
}
if (isAuthed()) {
  startApp();
} else {
  showLoginScreen(() => startApp());
}
setupInspector();

async function migrateLegacy() {
  const items = getHandovers();
  let changed = false;
  for (const item of items) {
    for (let i = 0; i < item.photos.length; i++) {
      if (item.photos[i].startsWith('data:')) {
        try {
          const blob = await dataUrlToBlob(item.photos[i]);
          item.photos[i] = await savePhoto(item.id, blob);
          changed = true;
        } catch {
          // skip broken entry
        }
      }
    }
    if (item.signature.startsWith('data:')) {
      try {
        await saveSignature(item.id, await dataUrlToBlob(item.signature));
        item.signature = 'idb';
        changed = true;
      } catch {
        // skip
      }
    }
  }
  if (changed) saveHandovers(items);
}

function statusLabel(item: Handover): string {
  const key: SyncStatus = item.syncStatus || (item.synced ? 'synced' : 'none');
  const map: Record<SyncStatus, string> = {
    none: 'Saved',
    queued: 'Queued',
    syncing: 'Syncing',
    synced: 'Synced',
    failed: 'Failed'
  };
  return map[key] || 'Saved';
}
