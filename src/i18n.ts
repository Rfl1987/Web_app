type Lang = 'en' | 'az';
const LANG_KEY = 'myauto-lang';

const EN_AZ: Record<string, string> = {
'MyAuto Handover': 'MyAuto Təhvil',
'Vehicle Handover': 'Avtomobil Təhvil',
'RENTAL OPERATIONS': 'İCARƏ ƏMƏLİYYATLARI',
'Vehicle handovers': 'Avtomobil təhvilləri',
'Create, document and confirm every vehicle delivery.': 'Hər avtomobil təhvilini yaradın, sənədləşdirin və təsdiqləyin.',
'New Handover': 'Yeni Təhvil',
'Total': 'Cəmi',
'Not synced': 'Sinxronlaşmayıb',
'Recent handovers': 'Son təhvillər',
'Synced': 'Sinxronlaşıb',
'Saved': 'Yadda saxlanılıb',
'No handovers yet': 'Hələ təhvil yoxdur',
'Create your first vehicle handover.': 'İlk avtomobil təhvilinizi yaradın.',
'Customer & vehicle': 'Müştəri və avtomobil',
'Enter the rental information.': 'İcarə məlumatlarını daxil edin.',
'Customer name': 'Müştərinin adı',
'Driver license number': 'Sürücülük vəsiqəsinin nömrəsi',
'Vehicle': 'Avtomobil',
'Return date': 'Qaytarılma tarixi',
'Return time': 'Qaytarılma vaxtı',
'Handover time': 'Təhvil vaxtı',
'Automatically recorded': 'Avtomatik qeyd olunur',
'Save & Continue': 'Yadda saxla və davam et',
'Vehicle inspection': 'Avtomobil baxışı',
'Saved locally': 'Lokal yadda saxlanılıb',
'Handover': 'Təhvil',
'Return': 'Qaytarılma',
'Vehicle photos': 'Avtomobil fotoları',
'Photograph every side and any visible damage.': 'Hər tərəfi və görünən zədələri fotoşəkilləndirin.',
'Take vehicle photos': 'Avtomobil fotoları çəkin',
'Open camera and take a photo': 'Kameranı açın və foto çəkin',
'No photos captured yet.': 'Hələ foto çəkilməyib.',
'Damage marking': 'Zədə işarələmə',
'Selected photos can be marked with a red circle.': 'Seçilmiş fotolar qırmızı dairə ilə işarələnə bilər.',
'Mark damage on a photo': 'Fotoda zədəni işarələyin',
'Customer signature': 'Müştəri imzası',
'Customer confirms the vehicle condition.': 'Müştəri avtomobilin vəziyyətini təsdiqləyir.',
'Clear signature': 'İmzanı təmizlə',
'Save locally': 'Lokal yadda saxla',
'Send information': 'Məlumatı göndər',
'Mark damage': 'Zədəni işarələ',
'Touch the photo where the damage is located. A thin red circle will be added.': 'Zədənin olduğu fotoya toxunun. Nazik qırmızı dairə əlavə olunacaq.',
'Clear marks': 'İşarələri təmizlə',
'Save damage marking': 'Zədə işarələməsini yadda saxla',
'Vehicle photo': 'Avtomobil fotosu',
'Choose photo': 'Foto seç',
'Handover saved locally.': 'Təhvil lokal yadda saxlanıldı.',
'The handover is saved locally. Server sync will be connected in the next stage.': 'Təhvil lokal yadda saxlanılıb. Server sinxronizasiyası növbəti mərhələdə qoşulacaq.',
'John Smith': 'Rəşad Əliyev'
};
const AZ_EN: Record<string, string> = Object.fromEntries(
Object.entries(EN_AZ).map(([en, az]) => [az, en])
);

function getLang(): Lang {
const stored = localStorage.getItem(LANG_KEY);
if (stored === 'az' || stored === 'en') return stored;
return navigator.language?.toLowerCase().startsWith('az') ? 'az' : 'en';
}
function setLang(lang: Lang) {
localStorage.setItem(LANG_KEY, lang);
}
function mapFor(lang: Lang): Record<string, string> {
return lang === 'az' ? EN_AZ : AZ_EN;
}
export function tr(text: string): string {
try {
const map = mapFor(getLang());
return map[text.trim()] || text;
} catch {
return text;
}
}

function localizeNode(node: Text, map: Record<string, string>) {
const raw = node.textContent || '';
const key = raw.trim();
if (!key) return;
const target = map[key];
if (target && target !== key) node.textContent = raw.replace(key, target);
}
function localizeDom(root: Node, map: Record<string, string>) {
if (root.nodeType === Node.TEXT_NODE) {
localizeNode(root as Text, map);
return;
}
root.childNodes.forEach(c => localizeDom(c, map));
}
function localizeAttributes(root: ParentNode, map: Record<string, string>) {
root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(el => {
const p = el.placeholder?.trim();
if (p && map[p]) el.placeholder = map[p];
});
}

function ensureToggle(lang: Lang) {
const header = document.querySelector('.topbar, .page-header');
if (!header) return;
let btn = document.getElementById('langBtn') as HTMLButtonElement | null;
if (!btn) {
btn = document.createElement('button');
btn.id = 'langBtn';
btn.type = 'button';
btn.className = 'icon-btn';
btn.addEventListener('click', () => {
setLang(getLang() === 'az' ? 'en' : 'az');
refresh();
});
header.insertBefore(btn, header.lastElementChild);
}
btn.textContent = lang === 'az' ? 'EN' : 'AZ';
btn.title = lang === 'az' ? 'Switch to English' : 'Azərbaycan dilinə keç';
}

function refresh() {
const lang = getLang();
const map = mapFor(lang);
localizeDom(document.body, map);
localizeAttributes(document, map);
document.documentElement.lang = lang;
const title = map[document.title.trim()];
if (title) document.title = title;
ensureToggle(lang);
}
let scheduled = false;
function scheduleRefresh() {
if (scheduled) return;
scheduled = true;
queueMicrotask(() => {
scheduled = false;
try {
refresh();
} catch (e) {
console.error('[i18n]', e);
}
});
}

try {
const observer = new MutationObserver(() => scheduleRefresh());
observer.observe(document.documentElement, { childList: true, subtree: true });
refresh();
} catch (e) {
console.error('[i18n init]', e);
}
export { getLang, setLang, refresh };
