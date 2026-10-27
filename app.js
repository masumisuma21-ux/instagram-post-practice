'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = value => structuredClone(value);
const names = ['表紙', '解説 01', '解説 02', '解説 03', '解説 04', '解説 05', 'まとめ'];
const templates = {
  natural: {name: 'ナチュラル', note: 'アイボリー × ベージュ × くすみグリーン', bg: '#f8f5ec', fg: '#435445', accent: '#a6ad8d', font: 'sans'},
  elegant: {name: 'エレガント', note: 'グレージュ × ブラウン × ゴールド', bg: '#eee8e0', fg: '#59483f', accent: '#af945e', font: 'serif'},
  simple: {name: 'シンプル', note: 'ホワイト × チャコール × 淡いピンク', bg: '#ffffff', fg: '#353437', accent: '#e3bfc6', font: 'sans'}
};
const textDefaults = {titleSize: 72, size: 40, titleAlign: 'left', bodyAlign: 'left', textPosition: 'top'};
const initial = {
  theme: '忙しい朝の保湿ケア', concept: '39歳からの頑張らない美容', account: '@your_account',
  template: 'natural', ...templates.natural,
  slides: [
    {title: '忙しい朝こそ、\n保湿をシンプルに。', body: '手順を増やさず、心地よく。\n39歳からの、頑張らない美容。'},
    {title: 'まずは、今日の\n肌の様子から。', body: '乾燥やつっぱり感はありませんか？\nいつもと違うときは、無理にアイテムを増やさずに。'},
    {title: '使う量は、\n商品の案内を目安に。', body: 'たくさん重ねることよりも、\nまずは使用方法を確認。\n自分にとって続けやすい手順を選びます。'},
    {title: 'こすらず、\nやさしくなじませる。', body: '指先に力を入れすぎないように。\n急ぐ朝も、肌に触れるときだけは\n少しゆっくり。'},
    {title: 'アイテムは、\nお気に入りを少しだけ。', body: '使い心地や香りなど、\n心地よく使えるかも大切なポイント。\n合わないと感じたら使用を控えて。'},
    {title: '続けやすい場所に、\nまとめておく。', body: '朝に使うものを一か所へ。\n手に取りやすくする小さな工夫で、\n毎日の準備をシンプルに。'},
    {title: '美容は、自分の\nペースでいい。', body: '肌の様子を見る・使用方法を確認する\nこすらず、心地よく続ける。\n\nあとで見返せるように保存を。\n無理のない美容を、一緒に。\nよかったらフォローしてください。'}
  ].map(s => ({...s, ...textDefaults, photo: null}))
};
let state = clone(initial), current = 0, db = null, saveTimer, revision = 0, pendingFeedLoads = 0, feedDirty = false;
let saveQueue = Promise.resolve(), lastSaveOK = true, fontsReady;
const images = new Map();
const measure = document.createElement('canvas').getContext('2d');
const clamp = (n, min, max, fallback) => Number.isFinite(Number(n)) ? Math.max(min, Math.min(max, Number(n))) : fallback;
const safeText = (s, max) => typeof s === 'string' ? [...s].slice(0, max).join('') : '';
function normalize(raw) {
  if (!raw || !Array.isArray(raw.slides) || raw.slides.length !== 7 || !raw.slides.every(s => s && typeof s.title === 'string' && typeof s.body === 'string')) throw Error('保存データの形式を確認できませんでした。');
  const color = (v, d) => /^#[0-9a-f]{6}$/i.test(v) ? v : d;
  return {
    theme: safeText(raw.theme, 70), concept: safeText(raw.concept ?? initial.concept, 36), account: safeText(raw.account, 32),
    template: templates[raw.template] ? raw.template : 'natural',
    bg: color(raw.bg, initial.bg), fg: color(raw.fg, initial.fg), accent: color(raw.accent, initial.accent),
    font: ['sans', 'serif', 'bold'].includes(raw.font) ? raw.font : 'sans',
    slides: raw.slides.map(s => ({
      title: safeText(s.title, 70), body: safeText(s.body, 400),
      titleSize: clamp(s.titleSize, 38, 96, 72), size: clamp(s.size ?? raw.size, 28, 56, 40),
      titleAlign: ['left', 'center', 'right'].includes(s.titleAlign) ? s.titleAlign : 'left',
      bodyAlign: ['left', 'center', 'right'].includes(s.bodyAlign) ? s.bodyAlign : 'left',
      textPosition: ['top', 'center', 'bottom'].includes(s.textPosition) ? s.textPosition : 'top',
      photo: s.photo && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.photo.data) ? {
        data: s.photo.data, name: safeText(s.photo.name, 120), width: clamp(s.photo.width, 10, 820, 350),
        x: clamp(s.photo.x, 0, 100, 80), y: clamp(s.photo.y, 0, 100, 65), layout: s.photo.layout === 'bottom' ? 'bottom' : 'side'
      } : null
    }))
  };
}
function toast(message) {
  $('#toast').textContent = message; $('#toast').style.display = 'block';
  clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => $('#toast').style.display = 'none', 4200);
}
function confirmAction(message, title = '内容を確認してください') {
  const dialog = $('#confirmDialog');
  if (dialog.open) return Promise.resolve(false);
  $('#confirmTitle').textContent = title; $('#confirmMessage').textContent = message;
  return new Promise(resolve => {
    dialog.returnValue = ''; dialog.onclose = () => resolve(dialog.returnValue === 'yes');
    $('#cancelAction').onclick = () => dialog.close('no');
    $('#acceptAction').onclick = () => dialog.close('yes'); dialog.showModal();
  });
}
async function openDatabase() { await AccountWorkspace.ready; }
function storage(op, value, accountId = AccountWorkspace.currentId) { return AccountWorkspace.store('feed', op, value, accountId); }
function brandFeedDefault(brand = AccountWorkspace.brand) {
  const next = clone(initial); next.concept = brand.name.slice(0, 36); next.account = '';
  [next.bg, next.fg, next.accent] = brand.colors; next.font = brand.font; next.template = brand.template;
  if (!/美容|スキンケア/.test(brand.genre)) {
    next.theme = brand.name + 'のご案内';
    const labels = ['［投稿タイトルを入力］', '［お店・サービスの紹介］', '［確認済みの特徴を入力］', '［メニューなどの情報を入力］', '［利用時に伝えたいことを入力］', '［来店・予約などの手順を入力］', '［まとめの見出しを入力］'];
    next.slides = labels.map((title, i) => ({...clone(initial.slides[i]), title, body: i === 6 ? brand.cta : '［確認できる情報を入力してください］', photo: null}));
  } else next.slides[6].body = brand.cta || next.slides[6].body;
  return normalize(next);
}
async function prepareFeedAccount(id, brand) {
  const saved = await storage('get', 'autosave', id), pending = AccountWorkspace.recovery('feed', id);
  const source = pending && (!saved || (pending.updated || 0) > (saved.updated || 0)) ? pending : saved;
  const next = source ? normalize(source.state) : brandFeedDefault(brand);
  await prepareImages(next); return next;
}
function activateFeedAccount(next) {
  clearTimeout(saveTimer); revision++; feedDirty = false; state = next; current = 0;
  const used = new Set(state.slides.filter(s => s.photo).map(s => s.photo.data)); for (const key of images.keys()) if (!used.has(key)) images.delete(key);
  fields(); syncGlobalControls(); syncPageControls(); render(); $('#draftName').value = ''; $('#draftList').replaceChildren();
  storageStatus('アカウントの投稿を表示中'); if (!$('#drafts').hidden) listDrafts();
}
function storageStatus(text, error = false) {
  $('#saveState').textContent = text; $('#saveState').classList.toggle('error', error);
}
function persist() {
  clearTimeout(saveTimer);
  const snapshot = clone(state), capturedRevision = revision, ownerId = AccountWorkspace.currentId, snapshotAt = Date.now();
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    try {
      await storage('put', {id: 'autosave', state: snapshot, updated: snapshotAt}, ownerId); lastSaveOK = true;
      AccountWorkspace.clearRecovery('feed', snapshotAt, ownerId);
      if (capturedRevision === revision && ownerId === AccountWorkspace.currentId) { feedDirty = false; storageStatus('● このブラウザに自動保存済み'); }
    } catch {
      lastSaveOK = false; storageStatus('保存できません。空き容量を確認してください', true);
      toast('ブラウザに保存できませんでした。大切な投稿はPNGで保存してください。');
    }
  });
  return saveQueue;
}
function update() {
  revision++; feedDirty = true; storageStatus('保存中…'); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 500); render();
}
async function flush() { await persist(); return lastSaveOK; }
function setTab(tab) {
  $$('[data-tab]').forEach(b => { const active = b.dataset.tab === tab; b.classList.toggle('active', active); b.setAttribute('aria-selected', active); b.tabIndex = active ? 0 : -1; });
  ['content', 'design', 'photo', 'drafts'].forEach(id => $('#' + id).hidden = id !== tab);
  if (tab === 'drafts') listDrafts();
}
function setPage(i) { current = (i + 7) % 7; syncPageControls(); render(); }
function fields() {
  $('#fields').replaceChildren();
  state.slides.forEach((s, i) => {
    const el = document.createElement('div'); el.className = 'field-card';
    el.innerHTML = `<h3 class="field-title"><span>${String(i + 1).padStart(2, '0')}</span>${names[i]}</h3><label>見出し<textarea class="title-input" id="title${i}" maxlength="70" aria-label="${i + 1}枚目の見出し"></textarea></label><label>本文<textarea id="body${i}" maxlength="400" aria-label="${i + 1}枚目の本文"></textarea></label>`;
    el.querySelector('.title-input').value = s.title; el.querySelector(`#body${i}`).value = s.body;
    el.querySelector('.title-input').oninput = e => { state.slides[i].title = e.target.value; update(); };
    el.querySelector(`#body${i}`).oninput = e => { state.slides[i].body = e.target.value; update(); };
    el.onfocusin = () => setPage(i); $('#fields').append(el);
  });
}
function syncGlobalControls() {
  ['theme', 'concept', 'account', 'bg', 'fg', 'accent', 'font'].forEach(k => $('#' + k).value = state[k]);
  $$('[data-template]').forEach(b => b.setAttribute('aria-pressed', b.dataset.template === state.template));
}
function syncPageControls() {
  const s = state.slides[current];
  $$('.active-page').forEach(el => el.textContent = `${current + 1}枚目・${names[current]}`);
  ['titleSize', 'size', 'titleAlign', 'bodyAlign', 'textPosition'].forEach(k => $('#' + k).value = s[k]);
  $('#titleSizeValue').textContent = s.titleSize + ' px'; $('#sizeValue').textContent = s.size + ' px';
  $('#photoControls').hidden = !s.photo;
  $('#photoFile').value = '';
  if (s.photo) {
    $('#photoName').textContent = s.photo.name;
    const img = images.get(s.photo.data);
    const maxWidth = img ? Math.min(820, Math.max(10, Math.floor(940 * img.width / img.height / 10) * 10)) : 820;
    $('#photoWidth').max = maxWidth; $('#photoWidth').min = Math.min(180, maxWidth);
    s.photo.width = Math.min(s.photo.width, maxWidth);
    ['width', 'x', 'y'].forEach(k => {
      const id = 'photo' + k[0].toUpperCase() + k.slice(1); $('#' + id).value = s.photo[k];
      $('#' + id + 'Value').textContent = s.photo[k] + (k === 'width' ? ' px' : ' %');
    });
  }
}
function fontFor(model) { return model.font === 'serif' ? 'JPSerif' : 'JP'; }
function wrap(text, width, size, family, weight) {
  measure.font = `${weight} ${size}px ${family}`;
  const result = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of [...paragraph]) {
      if (line && measure.measureText(line + char).width > width) { result.push(line); line = char; }
      else line += char;
    }
    result.push(line);
  }
  return result;
}
// A shared scene defines PNG, preview and SVG, including the same wrapping and image bounds.
function scene(model, index) {
  const s = model.slides[index], family = fontFor(model), items = [], warnings = [];
  const rect = (x, y, w, h, fill, extra = {}) => items.push({type: 'rect', x, y, w, h, fill, ...extra});
  const line = (x1, y1, x2, y2, stroke, strokeWidth = 1) => items.push({type: 'line', x1, y1, x2, y2, stroke, strokeWidth});
  const circle = (cx, cy, r, fill, opacity = 1) => items.push({type: 'circle', cx, cy, r, fill, opacity});
  const text = (value, x, y, size, color = model.fg, align = 'left', weight = 400, useFamily = family) => items.push({type: 'text', value, x, y, size, color, align, weight, family: useFamily});
  function block(value, x, y, width, height, requested, align, title = false) {
    const minSize = title ? 30 : 24, weight = model.font === 'bold' || title ? 600 : 400;
    let size = requested, rows;
    while (true) {
      rows = wrap(value, width, size, family, weight);
      if (rows.length * size * 1.55 <= height || size <= minSize) break;
      size--;
    }
    const capacity = Math.max(1, Math.floor(height / (size * 1.55)));
    if (rows.length > capacity) { warnings.push(title ? '見出し' : '本文'); rows = rows.slice(0, capacity); const tail = rows.length - 1; rows[tail] = rows[tail].slice(0, -1) + '…'; }
    const anchor = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
    rows.forEach((row, i) => text(row, anchor, y + size + i * size * 1.55, size, model.fg, align, weight));
  }
  rect(0, 0, 1080, 1350, model.bg);
  if (model.template === 'elegant') {
    rect(42, 42, 996, 1266, 'none', {stroke: model.accent, strokeWidth: 2});
    rect(55, 55, 970, 1240, 'none', {stroke: model.accent, strokeWidth: 1});
    line(440, 190, 640, 190, model.accent, 2);
    circle(540, 190, 5, model.accent);
  } else if (model.template === 'simple') {
    rect(0, 0, 1080, 24, model.accent); circle(1020, 470, 170, model.accent, .12);
    rect(85, 170, 58, 5, model.accent);
  } else {
    rect(42, 42, 996, 1266, 'none', {stroke: model.accent, strokeWidth: 1});
    circle(1005, 530, 210, model.accent, .12); circle(1005, 530, 160, model.bg, .65);
    items.push({type: 'path', d: 'M 875 1140 Q 945 1080 943 990 M 929 1092 Q 864 1092 878 1058 Q 918 1051 929 1092 M 941 1053 Q 1002 1042 986 1010 Q 949 1019 941 1053', stroke: model.accent, strokeWidth: 3, opacity: .5});
  }
  text(model.concept, 100, 125, 24, model.fg);
  text(`${String(index + 1).padStart(2, '0')} / 07`, 980, 125, 23, model.fg, 'right');
  const withPhoto = !!s.photo, bottomPhoto = withPhoto && s.photo.layout === 'bottom';
  if (withPhoto) {
    const image = images.get(s.photo.data);
    if (image) {
      const w = Math.min(s.photo.width, image.width / image.height * 940), h = w * image.height / image.width;
      const x = 80 + (920 - w) * s.photo.x / 100, y = 220 + (940 - h) * s.photo.y / 100;
      rect(x - 12, y - 12, w + 24, h + 24, model.bg, {stroke: model.accent, strokeWidth: 1});
      items.push({type: 'image', x, y, w, h, data: s.photo.data});
    }
  }
  const shift = s.textPosition === 'center' ? 75 : s.textPosition === 'bottom' ? 145 : 0;
  const titleY = 265 + shift;
  const titleHeight = bottomPhoto ? 205 : 240;
  text(index === 0 ? 'LESS EFFORT, MORE YOU.' : index === 6 ? 'MY BEAUTY, MY PACE.' : `BEAUTY NOTE  ${String(index).padStart(2, '0')}`, 100, 225, 23, model.fg);
  block(s.title, 100, titleY, 875, titleHeight, s.titleSize, s.titleAlign, true);
  const bodyY = bottomPhoto ? 500 + shift / 3 : 620 + shift;
  const bodyWidth = withPhoto && !bottomPhoto ? 470 : 875;
  const bodyHeight = bottomPhoto ? 180 : Math.min(440, 1140 - bodyY);
  line(100, bodyY - 30, 165, bodyY - 30, model.accent, 4);
  block(s.body, 100, bodyY, bodyWidth, bodyHeight, s.size, s.bodyAlign);
  line(100, 1200, 980, 1200, model.accent);
  text(model.account, 100, 1255, 24, model.fg);
  text(index === 6 ? '保存して、またゆっくり。' : 'つづきを読む  →', 980, 1255, 23, model.fg, 'right');
  return {items, warnings};
}
function draw(canvas, model, index) {
  const ctx = canvas.getContext('2d'), built = scene(model, index);
  ctx.clearRect(0, 0, 1080, 1350);
  for (const item of built.items) {
    ctx.save(); ctx.globalAlpha = item.opacity ?? 1;
    if (item.type === 'rect') {
      if (item.fill !== 'none') { ctx.fillStyle = item.fill; ctx.fillRect(item.x, item.y, item.w, item.h); }
      if (item.stroke) { ctx.strokeStyle = item.stroke; ctx.lineWidth = item.strokeWidth; ctx.strokeRect(item.x, item.y, item.w, item.h); }
    } else if (item.type === 'circle') {
      ctx.fillStyle = item.fill; ctx.beginPath(); ctx.arc(item.cx, item.cy, item.r, 0, Math.PI * 2); ctx.fill();
    } else if (item.type === 'line') {
      ctx.strokeStyle = item.stroke; ctx.lineWidth = item.strokeWidth; ctx.beginPath(); ctx.moveTo(item.x1, item.y1); ctx.lineTo(item.x2, item.y2); ctx.stroke();
    } else if (item.type === 'path') {
      ctx.strokeStyle = item.stroke; ctx.lineWidth = item.strokeWidth; ctx.stroke(new Path2D(item.d));
    } else if (item.type === 'text') {
      ctx.fillStyle = item.color; ctx.textAlign = item.align; ctx.font = `${item.weight} ${item.size}px ${item.family}`; ctx.fillText(item.value, item.x, item.y);
    } else if (item.type === 'image') {
      const img = images.get(item.data); if (img) ctx.drawImage(img, item.x, item.y, item.w, item.h);
    }
    ctx.restore();
  }
  return built;
}
function render() {
  const built = draw($('#mainCanvas'), state, current);
  $$ ('#thumbs button').forEach((button, i) => {
    draw(button.querySelector('canvas'), state, i); button.classList.toggle('active', i === current); button.setAttribute('aria-pressed', i === current);
  });
  $('#pageLabel').textContent = `${String(current + 1).padStart(2, '0')} / 07　${names[current]}`;
  $('#layoutWarning').hidden = !built.warnings.length;
  $('#layoutWarning').textContent = `${built.warnings.join('・')}が収まらないため、一部を「…」で表示しています。文章を短くするか、写真を外してください。`;
}
async function imageFrom(data) {
  if (images.has(data)) return images.get(data);
  const image = new Image(); image.src = data; await image.decode(); images.set(data, image); return image;
}
async function prepareImages(model) { await Promise.all(model.slides.filter(s => s.photo).map(s => imageFrom(s.photo.data))); }
async function replaceState(model) {
  pendingFeedLoads++;
  try {
  const next = normalize(model); await prepareImages(next); state = next; current = 0; revision++;
  fields(); syncGlobalControls(); syncPageControls(); render(); await persist();
  } finally { pendingFeedLoads--; }
}
async function uploadPhoto(file, target) {
  if (!file) return;
  const targetSlide = state.slides[target];
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) { toast('12MB以下のJPG・PNG・WebPを選んでください。'); return; }
  let objectURL; pendingFeedLoads++;
  try {
    objectURL = URL.createObjectURL(file); const img = new Image(); img.src = objectURL; await img.decode();
    if (img.naturalWidth * img.naturalHeight > 40000000) throw Error('写真が大きすぎます。縮小してから選んでください。');
    const factor = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * factor); canvas.height = Math.round(img.naturalHeight * factor);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .88);
    const photoImage = await imageFrom(data);
    if (state.slides[target] !== targetSlide) { toast('投稿が切り替わったため、写真の追加を中止しました。'); return; }
    state.slides[target].photo = {data, name: file.name, width: Math.min(350, Math.floor(photoImage.width / photoImage.height * 440)), x: 96, y: 66, layout: 'side'};
    syncPageControls(); update(); toast(`${target + 1}枚目に写真を追加しました。`);
  } catch (error) { toast(error.message.startsWith('写真が') ? error.message : '写真を読み込めませんでした。別の写真を選んでください。'); }
  finally { pendingFeedLoads--; if (objectURL) URL.revokeObjectURL(objectURL); $('#photoFile').value = ''; }
}
// Curated outlines only: user text selects a topic; efficacy claims are never interpolated.
function outline(theme) {
  let topic = '毎日のスキンケア', cards;
  if (/日焼け|紫外線|UV|SPF/i.test(theme)) {
    topic = '無理なく続ける紫外線対策';
    cards = [
      ['外出前に、\n日差しをチェック。', '天気や外で過ごす時間を確認。\nその日の予定に合わせて、準備を考えましょう。'],
      ['日焼け止めは、\n使い方を確認。', '量や塗り直しのタイミングは、\n商品の表示を目安に。\n肌に合う使い心地も大切に。'],
      ['帽子や日傘も、\n選択肢に。', '日焼け止めだけに頼らず、\n帽子・日傘・衣服も組み合わせて。\n持ち歩きやすいものを選びます。'],
      ['外出先にも、\n小さな準備を。', 'よく使うバッグに必要なものを。\n忘れにくい置き場所を決めておくと、\n慌ただしい朝も準備がスムーズ。'],
      ['帰宅後も、\n商品に合ったお手入れを。', '落とし方は商品の案内を確認。\n肌を強くこすらず、\n無理のない手順を選びましょう。']
    ];
  } else if (/洗顔|クレンジング|メイク落とし/.test(theme)) {
    topic = '頑張りすぎない洗顔';
    cards = [
      ['今日の肌を、\nひと目チェック。', '乾燥やつっぱり感など、\nいつもと違う様子はありませんか？\n肌に合わない方法は無理に続けずに。'],
      ['使い方は、\n商品の案内から。', '使う量や、手をぬらすかどうかも\n商品によって異なります。\nまずは表示を確認しましょう。'],
      ['急ぐ日も、\nこすりすぎない。', '落とそうとして力を入れすぎず、\nやさしく触れることを意識。\n目元や口元も丁寧に。'],
      ['すすぎは、\n生え際まで。', 'すすぎ残しがないか、\n生え際やフェイスラインも確認。\nタオルは押さえるように使います。'],
      ['手順は少なく、\n使い心地を大切に。', '洗い上がりの感覚を確かめて。\n気になる変化が続くときは、\n自己判断で重ねず専門家へ相談を。']
    ];
  } else if (/美容液|セラム|成分|レチノール|ビタミン/.test(theme)) {
    topic = '美容液との心地よい付き合い方';
    cards = [
      ['選ぶ前に、\n使いたい理由を整理。', '何となく増やす前に、\n使い心地や予算、続けやすさを\n一度ゆっくり考えてみましょう。'],
      ['成分名だけで、\n決めつけない。', '商品の特徴は公式の表示で確認。\n成分名だけで、肌への効果や\n自分との相性は判断できません。'],
      ['順番と使用量は、\n説明を目安に。', '使うタイミングや頻度は商品ごとに。\n組み合わせに迷ったら、\nメーカーの案内も確認します。'],
      ['新しいものは、\n一度に増やさない。', '肌の様子を見ながら、無理なく。\n違和感があれば使用を控え、\n気になる症状は専門家へ相談を。'],
      ['使い切れる量で、\n気持ちよく。', '保管方法や使用期限も確認。\n自分が心地よく続けられるものを、\n少しずつ選んでいきましょう。']
    ];
  } else if (/保湿|乾燥|化粧水|乳液|クリーム/.test(theme)) {
    topic = /朝|時短|忙/.test(theme) ? '忙しい朝の保湿ケア' : '無理なく続ける保湿ケア';
    cards = initial.slides.slice(1, 6).map(s => [s.title, s.body]);
  } else if (/メイク|化粧|ベース/.test(theme)) {
    topic = '気負わない毎日のメイク';
    cards = [
      ['今日は、\nどんな気分？', '出かける場所や、その日の気分から。\nすべてを頑張らず、\n楽しみたいポイントをひとつ。'],
      ['使うものを、\n少しだけ選ぶ。', 'よく使うアイテムを手の届く場所へ。\n準備をシンプルにして、\n朝の迷う時間を減らしましょう。'],
      ['重ねる前に、\n鏡でひと呼吸。', '明るい場所で仕上がりを確認。\n少しずつ調整して、\n自分が心地よいところで完成に。'],
      ['道具のお手入れも、\nできるときに。', 'ブラシやスポンジの洗い方は、\n商品の案内を目安に。\n毎日の使い心地も大切にします。'],
      ['好きな色を、\n自分のために。', '年齢で決めつけず、\n気になる色を少しずつ。\n無理のない範囲で楽しみましょう。']
    ];
  } else {
    cards = [
      ['肌も気持ちも、\n今日の様子から。', '昨日と同じでなくても大丈夫。\nまずは鏡の前で、\n今の自分の様子を確かめましょう。'],
      ['手順を増やす前に、\n使い方を確認。', '使用量や順番は、商品の表示を目安に。\n多く使えばよいとは限りません。\n無理なく使える方法を選びます。'],
      ['こすらず、\nやさしく触れる。', '急ぐ日も、力を入れすぎずに。\n毎日の小さなお手入れを、\n心地よい時間にしてみましょう。'],
      ['新しいアイテムは、\n少しずつ。', '一度にいくつも増やさず、肌の様子を。\n合わないと感じたら使用を控え、\n気になる症状は専門家へ相談を。'],
      ['できる日も、\nできない日も。', '完璧なルーティンを目指さなくても。\n自分の生活に合わせて、\n続けやすい手順を考えましょう。']
    ];
  }
  return [
    {title: `忙しい私に、\n${topic}。`, body: '増やすより、心地よく続ける。\n今日から見直せる5つのヒント。'},
    ...cards.map(([title, body]) => ({title, body})),
    {title: 'きれいは、\n自分のペースで。', body: '肌の様子を見る・使い方を確認する\n心地よい手順で、無理なく続ける。\n\nあとで見返せるように保存を。\n頑張らない美容を、これからも。\nよかったらフォローしてください。'}
  ];
}
async function listDrafts() {
  const list = $('#draftList'), ownerId = AccountWorkspace.currentId;
  try {
    const records = (await storage('all')).filter(r => r.id !== 'autosave').sort((a, b) => b.updated - a.updated);
    if (ownerId !== AccountWorkspace.currentId) return;
    list.replaceChildren();
    if (!records.length) { const p = document.createElement('p'); p.className = 'empty-drafts'; p.textContent = 'まだ保存した投稿はありません。\n名前を付けて、最初の1件を残しましょう。'; list.append(p); }
    for (const record of records) {
      const card = document.createElement('article'); card.className = 'draft-card';
      const name = document.createElement('b'); name.textContent = record.name;
      const date = document.createElement('small'); date.textContent = new Date(record.updated).toLocaleString('ja-JP');
      const open = document.createElement('button'); open.textContent = '開いて再編集';
      open.onclick = async () => {
        if (!await confirmAction('現在の編集内容をこの投稿に切り替えます。現在の投稿も残したい場合は、先に名前を付けて保存してください。', '保存した投稿を開く')) return;
        try { if (!await flush()) { toast('現在の投稿を保存できないため、読み込みを中止しました。'); return; } await replaceState(record.state); $('#draftName').value = record.name; setTab('content'); toast('保存した投稿を開きました。'); }
        catch { toast('投稿を開けませんでした。保存データを確認してください。'); }
      };
      const remove = document.createElement('button'); remove.textContent = '削除';
      remove.onclick = async () => { if (await confirmAction(`「${record.name}」を削除します。この操作は元に戻せません。`, '保存した投稿を削除')) { try { await storage('delete', record.id); await listDrafts(); toast('保存した投稿を削除しました。'); } catch { toast('削除できませんでした。'); } } };
      card.append(name, date, open, remove); list.append(card);
    }
  } catch { list.textContent = '保存した投稿を読み込めません。ブラウザの保存設定を確認してください。'; }
}
const xml = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c]));
function svg(model, i) {
  const built = scene(model, i);
  const elements = built.items.map(item => {
    const opacity = item.opacity !== undefined ? ` opacity="${item.opacity}"` : '';
    if (item.type === 'rect') return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" fill="${item.fill}"${item.stroke ? ` stroke="${item.stroke}" stroke-width="${item.strokeWidth}"` : ''}/>`;
    if (item.type === 'circle') return `<circle cx="${item.cx}" cy="${item.cy}" r="${item.r}" fill="${item.fill}"${opacity}/>`;
    if (item.type === 'line') return `<line x1="${item.x1}" y1="${item.y1}" x2="${item.x2}" y2="${item.y2}" stroke="${item.stroke}" stroke-width="${item.strokeWidth}"/>`;
    if (item.type === 'path') return `<path d="${item.d}" fill="none" stroke="${item.stroke}" stroke-width="${item.strokeWidth}"${opacity}/>`;
    if (item.type === 'image') return `<image x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" href="${xml(item.data)}"/>`;
    const family = item.family === 'JPSerif' ? 'Noto Serif CJK JP,Noto Serif JP,serif' : 'Noto Sans CJK JP,Noto Sans JP,sans-serif';
    return `<text x="${item.x}" y="${item.y}" fill="${item.color}" font-family="${family}" font-size="${item.size}" font-weight="${item.weight}" text-anchor="${{left: 'start', center: 'middle', right: 'end'}[item.align]}" xml:space="preserve">${xml(item.value)}</text>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350" viewBox="0 0 1080 1350"><title>${xml(model.slides[i].title)}</title><desc>つむぐの編集用SVG。文字はテキストとして出力。表示にはNoto日本語フォントを推奨。取り込み先によりフォント置換や画像化が発生します。</desc>${elements.join('\n')}</svg>`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function png(model, i) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350; draw(canvas, model, i);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('画像を作成できませんでした。')), 'image/png'));
}

function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function zip(files){let chunks=[],central=[],offset=0;const enc=new TextEncoder();const u16=(v,o,n)=>v.setUint16(o,n,true),u32=(v,o,n)=>v.setUint32(o,n,true);for(const f of files){const name=enc.encode(f.name),crc=crc32(f.data),head=new Uint8Array(30+name.length),v=new DataView(head.buffer);u32(v,0,0x04034b50);u16(v,4,20);u32(v,14,crc);u32(v,18,f.data.length);u32(v,22,f.data.length);u16(v,26,name.length);head.set(name,30);chunks.push(head,f.data);const h=new Uint8Array(46+name.length),d=new DataView(h.buffer);u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u32(d,16,crc);u32(d,20,f.data.length);u32(d,24,f.data.length);u16(d,28,name.length);u32(d,42,offset);h.set(name,46);central.push(h);offset+=head.length+f.data.length}const size=central.reduce((n,h)=>n+h.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);u32(v,0,0x06054b50);u16(v,8,files.length);u16(v,10,files.length);u32(v,12,size);u32(v,16,offset);return new Blob([...chunks,...central,end],{type:'application/zip'})}

let exporting = false;
async function exportImages(format, all) {
  if (exporting) return;
  exporting = true;
  const controls = ['#individual', '#download', '#svgDownload', '#svgAll']; controls.forEach(s => $(s).disabled = true);
  try {
    await fontsReady;
    const model = clone(state), selected = current; await prepareImages(model);
    const indexes = all ? [0, 1, 2, 3, 4, 5, 6] : [selected];
    const overflow = indexes.filter(i => scene(model, i).warnings.length);
    if (overflow.length && !await confirmAction(`${overflow.map(i => i + 1).join('・')}枚目に収まらない文章があります。「…」で省略したまま保存しますか？文章を短くすると全文を表示できます。`, '文章の長さを確認')) return;
    const files = [];
    for (const i of indexes) {
      const blob = format === 'png' ? await png(model, i) : new Blob([svg(model, i)], {type: 'image/svg+xml;charset=utf-8'});
      files.push({name: `carousel-${String(i + 1).padStart(2, '0')}.${format}`, data: new Uint8Array(await blob.arrayBuffer()), blob});
    }
    download(all ? zip(files) : files[0].blob, all ? `carousel-7pages-${format}.zip` : files[0].name);
    toast(all ? `7枚の${format.toUpperCase()}をZIPで保存しました。` : `${format.toUpperCase()}を保存しました。`);
  } catch { toast('保存に失敗しました。もう一度お試しください。'); }
  finally { exporting = false; controls.forEach(s => $(s).disabled = false); }
}
function bind() {
  fields();
  ['theme', 'concept', 'account'].forEach(k => $('#' + k).oninput = e => {
    state[k] = e.target.value;
    if (k === 'theme') { state.slides[0].title = state.theme; $('#title0').value = state.theme; }
    update();
  });
  $$('[data-tab]').forEach((button, i, tabs) => {
    button.onclick = () => setTab(button.dataset.tab);
    button.onkeydown = e => { if (['ArrowRight', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; next.click(); next.focus(); } };
  });
  Object.entries(templates).forEach(([key, t]) => {
    const b = document.createElement('button'); b.className = 'template'; b.dataset.template = key;
    b.innerHTML = `<span class="template-swatches"><i style="background:${t.bg}"></i><i style="background:${t.fg}"></i><i style="background:${t.accent}"></i></span><span><strong>${t.name}</strong><small>${t.note}</small></span>`;
    b.onclick = () => { state.template = key; ['bg', 'fg', 'accent', 'font'].forEach(k => state[k] = t[k]); syncGlobalControls(); update(); };
    $('#templates').append(b);
  });
  ['bg', 'fg', 'accent', 'font'].forEach(k => $('#' + k).oninput = e => { state[k] = e.target.value; update(); });
  ['titleSize', 'size', 'titleAlign', 'bodyAlign', 'textPosition'].forEach(k => $('#' + k).oninput = e => {
    state.slides[current][k] = ['titleSize', 'size'].includes(k) ? Number(e.target.value) : e.target.value; syncPageControls(); update();
  });
  $('#applyTextAll').onclick = () => {
    const selected = state.slides[current]; state.slides.forEach(s => Object.keys(textDefaults).forEach(k => s[k] = selected[k])); update(); toast('文字設定を7枚に適用しました。');
  };
  state.slides.forEach((_, i) => {
    const b = document.createElement('button'); b.setAttribute('aria-label', `${i + 1}枚目 ${names[i]}を表示`);
    b.innerHTML = `<canvas width="1080" height="1350"></canvas><span>${String(i + 1).padStart(2, '0')} ${i === 0 ? '表紙' : i === 6 ? 'まとめ' : '解説'}</span>`;
    b.onclick = () => setPage(i); $('#thumbs').append(b);
  });
  $('#prev').onclick = () => setPage(current - 1); $('#next').onclick = () => setPage(current + 1);
  $('#help').onclick = () => $('#guide').showModal(); $('#closeGuide').onclick = () => $('#guide').close();
  $('#photoFile').onchange = e => uploadPhoto(e.target.files[0], current);
  ['Width', 'X', 'Y'].forEach(key => $('#photo' + key).oninput = e => {
    const p = state.slides[current].photo; if (!p) return;
    p[key.toLowerCase()] = Number(e.target.value); syncPageControls(); update();
  });
  $('#photoSide').onclick = () => { const p = state.slides[current].photo; if (!p) return; const img = images.get(p.data); Object.assign(p, {layout: 'side', width: Math.min(350, Math.floor(img.width / img.height * 440)), x: 96, y: 66}); syncPageControls(); update(); };
  $('#photoBottom').onclick = () => { const p = state.slides[current].photo; if (!p) return; const img = images.get(p.data); Object.assign(p, {layout: 'bottom', width: Math.min(510, Math.floor(img.width / img.height * 420)), x: 50, y: 100}); syncPageControls(); update(); };
  $('#removePhoto').onclick = () => { state.slides[current].photo = null; syncPageControls(); update(); toast('このページの写真を削除しました。'); };
  $('#generate').onclick = async () => {
    if (!state.theme.trim()) { toast('投稿テーマを入力してください。'); $('#theme').focus(); return; }
    if (!await confirmAction('7枚の見出しと本文を構成案に置き換えます。写真・色・文字設定はそのままです。今の文章を残したい場合は、先に名前を付けて保存してください。', '7枚の構成案をつくる')) return;
    (/美容|スキンケア/.test(AccountWorkspace.brand.genre) ? outline(state.theme) : brandFeedDefault().slides.map((s, i) => ({title: i === 0 ? state.theme : s.title, body: s.body}))).forEach((s, i) => Object.assign(state.slides[i], s)); fields(); setPage(0); update();
    toast('定型文から構成案を作成しました。内容を確認して編集してください。');
  };
  $('#saveDraft').onclick = async () => {
    const name = $('#draftName').value.trim() || state.theme.trim() || '無題の投稿';
    const button = $('#saveDraft'); button.disabled = true;
    try {
      const id = 'draft-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      await storage('put', {id, name, updated: Date.now(), state: clone(state)}); await listDrafts(); toast('写真と文章を保存しました。');
    } catch { toast('保存できません。ブラウザの空き容量や保存設定を確認してください。'); }
    finally { button.disabled = false; }
  };
  $('#newPost').onclick = async () => {
    if (!await confirmAction('サンプルから新しい投稿をはじめます。今の投稿を残したい場合は、先に名前を付けて保存してください。', '新しい投稿')) return;
    if (!await flush()) { toast('保存に失敗したため新規作成を中止しました。'); return; } await replaceState(brandFeedDefault()); $('#draftName').value = ''; setTab('content'); toast('新しい投稿をはじめました。');
  };
  $('#individual').onclick = () => exportImages('png', false); $('#download').onclick = () => exportImages('png', true);
  $('#svgDownload').onclick = () => exportImages('svg', false); $('#svgAll').onclick = () => exportImages('svg', true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
  const emergencyFeed = () => AccountWorkspace.recover('feed', {id: 'autosave', state: clone(state), updated: Date.now()});
  window.addEventListener('beforeunload', event => { if ((feedDirty || !lastSaveOK) && !emergencyFeed()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { if (feedDirty || !lastSaveOK) emergencyFeed(); persist(); });
}
async function boot() {
  $('.editor').inert = true;
  fontsReady = Promise.all([document.fonts.load('24px JP'), document.fonts.load('24px JPSerif')]);
  await openDatabase();
  state = await prepareFeedAccount(AccountWorkspace.currentId, AccountWorkspace.brand);
  bind(); syncGlobalControls(); syncPageControls(); render(); $('.editor').inert = false;
  await persist();
  AccountWorkspace.register('feed', {
    flush, busy: () => exporting || pendingFeedLoads > 0,
    prepare: prepareFeedAccount, activate: activateFeedAccount,
    snapshot: () => ({id: 'autosave', state: clone(state), updated: Date.now()}),
    open: record => replaceState(record.state), validate: record => normalize(record.state)
  });
  fontsReady.then(render).catch(() => toast('日本語フォントを読み込めませんでした。再読み込みしてください。'));
}
boot().catch(error => { storageStatus('保存データを読み込めないため停止しました。元データは削除していません。', true); AccountWorkspace.fail(error); });
