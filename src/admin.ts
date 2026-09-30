import { isAuthed, showLoginScreen } from './auth';
import './style.css';
import { supabase, SUPABASE_URL } from './supabase';

type Row = {
  id: string;
  customer_name: string;
  license_number: string;
  vehicle: string;
  return_date: string;
  return_time: string;
  handover_at: string;
  photo_paths: string[];
  signature_path: string;
  created_at: string;
};

const app = document.querySelector<HTMLDivElement>('#app')!;
const pub = (p: string) => `${SUPABASE_URL}/storage/v1/object/public/handovers/${p}`;

function escapeHtml(text: string) {
  return String(text).replace(/[&<>"']/g, c => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[c] || c;
  });
}

function shell(inner: string) {
  app.innerHTML = `<main class="shell">${inner}</main>`;
}

async function load(): Promise<Row[]> {
  const { data, error } = await supabase.from('handovers').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Row[];
}

async function list() {
  shell('<p class="muted">Loading…</p>');
  try {
    const rows = await load();
    shell(`
<header class="topbar">
<div>
<div class="brand">MY<span>AUTO</span> Admin</div>
<div class="subtitle">Server handovers</div>
</div>
<button class="icon-btn" id="refreshBtn">⟳</button>
</header>
<section class="section">
<div>
${
  rows.length
    ? rows
        .map(
          r => `
<button class="handover-card" data-id="${r.id}">
<div class="vehicle-icon">🚗</div>
<div class="card-main">
<strong>${escapeHtml(r.vehicle)}</strong>
<span>${escapeHtml(r.customer_name)} · ${escapeHtml(r.license_number)}</span>
<small>${escapeHtml(r.handover_at)} · ${(r.photo_paths || []).length} photos</small>
</div>
<div class="status synced">Synced</div>
</button>
`
        )
        .join('')
    : `<div class="empty"><strong>No handovers on server yet</strong><span>Send one from the phone app.</span></div>`
}
</div>
</section>
`);
    document.querySelector('#refreshBtn')?.addEventListener('click', list);
    document.querySelectorAll<HTMLButtonElement>('.handover-card').forEach(c =>
      c.addEventListener('click', () => {
        const row = rows.find(x => x.id === c.dataset.id);
        if (row) detail(row);
      })
    );
  } catch (e) {
    shell(`<div class="empty"><strong>Load failed</strong><span>${escapeHtml((e as Error).message)}</span></div>`);
  }
}

function detail(r: Row) {
  shell(`
<header class="page-header">
<button class="back" id="backBtn">←</button>
<div>
<div class="brand small-brand">MY<span>AUTO</span> Admin</div>
<h1>${escapeHtml(r.vehicle)}</h1>
</div>
</header>
<section class="vehicle-summary">
<span class="status synced">Synced</span>
<h2>${escapeHtml(r.customer_name)}</h2>
<div class="summary-row"><span>Driving license</span><strong>${escapeHtml(r.license_number)}</strong></div>
<div class="summary-row"><span>Handover</span><strong>${escapeHtml(r.handover_at)}</strong></div>
<div class="summary-row"><span>Return</span><strong>${escapeHtml(r.return_date)} · ${escapeHtml(r.return_time)}</strong></div>
<div class="summary-row"><span>Stored</span><strong>${escapeHtml(new Date(r.created_at).toLocaleString('en-GB'))}</strong></div>
</section>
<section class="panel">
<div class="panel-title">
<div>
<h2>Photos (${(r.photo_paths || []).length})</h2>
<p>Damage marks are baked into the images.</p>
</div>
</div>
<div class="photo-grid">
${
  (r.photo_paths || [])
    .map((p, i) => `<div class="photo" data-path="${p}"><img src="${pub(p)}" alt="Photo ${i + 1}" loading="lazy" /><span>${i + 1}</span></div>`)
    .join('') || '<div class="photo-empty">No photos.</div>'
}
</div>
</section>
<section class="panel">
<div class="panel-title">
<div>
<h2>Signature</h2>
<p>Customer signature at handover.</p>
</div>
</div>
<div class="signature-box">
${
  r.signature_path
    ? `<img src="${pub(r.signature_path)}" alt="Signature" style="width:100%;height:100%;object-fit:contain;background:#fff" />`
    : '<span>No signature.</span>'
}
</div>
</section>
`);
  document.querySelector('#backBtn')?.addEventListener('click', list);
  document.querySelectorAll<HTMLDivElement>('.photo[data-path]').forEach(el => {
    const photos = (r.photo_paths || []);
    const idx = Number(el.querySelector('span')?.textContent || '1') - 1;
    el.addEventListener('click', () => openPreview(photos.map(pub), idx));
  });
}

if (isAuthed()) list();
else showLoginScreen(() => list());

function openPreview(photos: string[], index: number) {
  const existing = document.querySelector('#photoPreviewModal');
  if (existing) existing.remove();
  if (!photos.length) return;
  let current = Math.max(0, Math.min(photos.length - 1, index));
  const modal = document.createElement('div');
  modal.id = 'photoPreviewModal';
  const body = () => `
<div class="photo-preview-modal">
<div class="photo-preview-top">
<button type="button" class="ppv-close" id="ppvClose">×</button>
<strong class="ppv-title">Photo ${current + 1} / ${photos.length}</strong>
<span></span>
</div>
<button type="button" class="ppv-nav ppv-prev" id="ppvPrev" ${current === 0 ? 'disabled' : ''}>‹</button>
<button type="button" class="ppv-nav ppv-next" id="ppvNext" ${current === photos.length - 1 ? 'disabled' : ''}>›</button>
<div class="photo-preview-wrap" id="ppvWrap">
<img id="ppvImage" src="${photos[current]}" alt="Preview" />
</div>
<div class="ppv-hint">Swipe or tap ‹ › to navigate · Pinch to zoom</div>
</div>
`;
  modal.innerHTML = body();
  document.body.appendChild(modal);
  const img = modal.querySelector<HTMLImageElement>('#ppvImage')!;
  const wrap = modal.querySelector<HTMLDivElement>('#ppvWrap')!;
  let scale = 1;
  let startDist = 0;
  let startScale = 1;
  const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const apply = () => {
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
        apply();
      }
    },
    { passive: true }
  );
  wrap.addEventListener('dblclick', () => {
    scale = scale > 1 ? 1 : 2;
    apply();
  });
  const show = (idx: number) => {
    current = Math.max(0, Math.min(photos.length - 1, idx));
    scale = 1;
    modal.innerHTML = body();
    bind();
  };
  const bind = () => {
    const img2 = modal.querySelector<HTMLImageElement>('#ppvImage')!;
    const wrap2 = modal.querySelector<HTMLDivElement>('#ppvWrap')!;
    scale = 1;
    let sx = 0;
    let sy = 0;
    let sd2 = 0;
    let sscale = 1;
    const tdist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    wrap2.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        sd2 = tdist(e.touches[0], e.touches[1]);
        sscale = scale;
      }
    }, { passive: true });
    wrap2.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        const d = tdist(e.touches[0], e.touches[1]);
        scale = Math.max(1, Math.min(5, sscale * (d / sd2)));
        img2.style.transform = `scale(${scale})`;
      }
    }, { passive: true });
    wrap2.addEventListener('touchend', e => {
      if (scale > 1 || e.changedTouches.length !== 1) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0 && current < photos.length - 1) show(current + 1);
        else if (dx > 0 && current > 0) show(current - 1);
      }
    });
    wrap2.addEventListener('dblclick', () => {
      scale = scale > 1 ? 1 : 2;
      img2.style.transform = `scale(${scale})`;
    });
    modal.querySelector('#ppvClose')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#ppvPrev')?.addEventListener('click', e => {
      e.stopPropagation();
      if (current > 0) show(current - 1);
    });
    modal.querySelector('#ppvNext')?.addEventListener('click', e => {
      e.stopPropagation();
      if (current < photos.length - 1) show(current + 1);
    });
    modal.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (target.closest('.ppv-nav') || target.closest('.ppv-close')) return;
      if (target === modal || target === wrap2) {
        if (scale === 1) modal.remove();
        else {
          scale = 1;
          img2.style.transform = '';
        }
      }
    });
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!document.getElementById('photoPreviewModal')) return;
      if (e.key === 'ArrowLeft' && current > 0) show(current - 1);
      else if (e.key === 'ArrowRight' && current < photos.length - 1) show(current + 1);
      else if (e.key === 'Escape') modal.remove();
    }, { once: false });
  };
  bind();
}
