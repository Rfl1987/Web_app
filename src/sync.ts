import { getHandovers, saveHandovers } from './main';
import { getPhoto, getSignatureBlob } from './storage';
import { supabase } from './supabase';

export type SyncStatus = 'none' | 'queued' | 'syncing' | 'synced' | 'failed';

const QUEUE_KEY = 'myauto-sync-queue';

export function getQueue(): string[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function setQueue(ids: string[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ids));
}

export function setStatus(id: string, status: SyncStatus, error?: string) {
  const items = getHandovers();
  const item = items.find(x => x.id === id);
  if (!item) return;
  item.syncStatus = status;
  item.syncError = error;
  if (status === 'synced') {
    item.synced = true;
    item.syncedAt = new Date().toISOString();
  }
  saveHandovers(items);
  document.dispatchEvent(new CustomEvent('sync-status-changed', { detail: { id, status } }));
}

export function enqueue(id: string) {
  const queue = getQueue();
  if (!queue.includes(id)) queue.push(id);
  setQueue(queue);
  setStatus(id, 'queued');
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter(x => x !== id);
  setQueue(queue);
}

let processing = false;

async function uploadHandover(id: string): Promise<void> {
  const item = getHandovers().find(x => x.id === id);
  if (!item) throw new Error('handover not found');
  const photoPaths: string[] = [];
  for (let i = 0; i < item.photos.length; i++) {
    const rec = await getPhoto(item.photos[i]);
    if (!rec) continue;
    const path = `${id}/photo_${i}.jpg`;
    const { error } = await supabase.storage
      .from('handovers')
      .upload(path, rec.blob, { contentType: rec.blob.type || 'image/jpeg', upsert: true });
    if (error) throw new Error('photo upload: ' + error.message);
    photoPaths.push(path);
  }
  let signaturePath = '';
  if (item.signature) {
    const blob = await getSignatureBlob(id);
    if (blob) {
      const path = `${id}/signature.png`;
      const { error } = await supabase.storage
        .from('handovers')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (error) throw new Error('signature upload: ' + error.message);
      signaturePath = path;
    }
  }
  const { error: dbError } = await supabase.from('handovers').upsert({
    id: item.id,
    customer_name: item.customerName,
    license_number: item.licenseNumber,
    vehicle: item.vehicle,
    return_date: item.returnDate,
    return_time: item.returnTime,
    handover_at: item.handoverAt,
    photo_paths: photoPaths,
    signature_path: signaturePath
  });
  if (dbError) throw new Error('db: ' + dbError.message);
}

export async function processQueue(): Promise<void> {
  if (processing) return;
  if (!navigator.onLine) {
    console.log('[sync] offline, skipping');
    return;
  }
  processing = true;
  const queue = getQueue();
  for (const id of queue) {
    setStatus(id, 'syncing');
    try {
      await uploadHandover(id);
      setStatus(id, 'synced');
      removeFromQueue(id);
    } catch (err) {
      setStatus(id, 'failed', (err as Error).message);
      removeFromQueue(id);
      // Fail olunmuşlar növbədən çıxarılır, amma status 'failed' qalır → retry lazımdır
    }
  }
  processing = false;
}

export function retryFailed(id: string) {
  enqueue(id);
  processQueue();
}

export function retryAllFailed() {
  const items = getHandovers();
  for (const item of items) {
    if (item.syncStatus === 'failed') enqueue(item.id);
  }
  processQueue();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[sync] back online, processing queue');
    processQueue();
  });
}
