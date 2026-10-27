/* Reels is isolated from feed state, storage and rendering. No external API or library. */
(() => {
  'use strict';
  const q = id => document.getElementById(id), all = sel => [...document.querySelectorAll(sel)];
  const Scripts = globalThis.TsumuguReelScripts;
  const roles = ['フック', '共感', '気づき・情報', '解決のヒント', '締め・呼びかけ'];
  const durationSets = {15: [3, 3, 3, 3, 3], 30: [3, 6, 7, 8, 6], 60: [3, 12, 17, 18, 10]};
  const defaultStyle = {font: 'sans', bg: '#f8f5ec', color: '#435445', band: '#f8f5ec', size: 64, y: 60, align: 'center', animation: 'fade'};
  let model = {...Scripts.defaults, scriptTemplateVersion: 1, theme: '忙しい朝の保湿ケア', target: '忙しい30代後半〜50代の女性', duration: 30, purpose: 'save', style: {...defaultStyle}, scenes: [], narration: null, bgm: null, bgmConsent: false, license: '', volume: .2};
  let selected = 0, time = 0, playing = false, frameID, startTime, timer, database, revision = 0, writeQueue = Promise.resolve(), busy = false, server = false, lastReelSaveOK = true, pendingReelLoads = 0, reelDirty = false;
  const cache = new Map(), voice = new Audio(), music = new Audio(); music.loop = true;
  const canvas = q('rCanvas'), ctx = canvas.getContext('2d');
  const surface = document.createElement('canvas'); surface.width = 1080; surface.height = 1920; const surfaceContext = surface.getContext('2d');
  function drafts(settings) {
    return Scripts.generate(settings).scenes.map((s, i) => ({...s, image: null, imageName: '', prompt: imagePrompt(i, settings.genre)}));
  }
  function imagePrompt(index, genre = model.genre) {
    if (genre && !/美容|スキンケア/.test(genre)) return `${genre}向けの写真。シーン${index + 1}：実在する商品・店内・手元など、投稿内容に合う素材を用意してください。温かい自然光と余白。未確認の料理・価格・設備は作りません。`;
    const settings = ['アイボリーの洗面台に置いた美容液と柔らかな朝の光', '忙しい朝、30〜40代女性の自然な後ろ姿。顔は写さない', '30〜40代女性がスキンケア商品を手に取る手元のクローズアップ', '美容液を手のひらに出す自然な所作。顔は画角の外', 'ベージュのリネンとスキンケア商品、穏やかな暮らしの一場面'];
    return `リアルで上品な美容写真。${settings[index]}。温かいベージュ・アイボリー、自然光、余白を広く。9:16の縦長。商品ロゴ・文字・透かしなし。過度な肌補正やビフォーアフター表現なし。実在人物の再現なし。`;
  }
  model.scenes = drafts(model);
  const initialReel = structuredClone(model);
  const total = () => model.scenes.reduce((sum, s) => sum + Number(s.seconds), 0);
  function which(t) { let start = 0; for (let i = 0; i < model.scenes.length; i++) { if (t < start + model.scenes[i].seconds || i === 4) return {index: i, start, local: Math.max(0, t - start)}; start += model.scenes[i].seconds; } }
  const clock = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  async function openDB() { await AccountWorkspace.ready; }
  function store(op, value, accountId = AccountWorkspace.currentId) { return AccountWorkspace.store('reel', op, value, accountId); }
  function brandReelDefault(brand = AccountWorkspace.brand) {
    const next = structuredClone(initialReel); next.genre = brand.genre; next.brandName = brand.name; next.brandCta = brand.cta;
    next.target = brand.target.slice(0, 70); next.style = {...defaultStyle, bg: brand.colors[0], color: brand.colors[1], band: brand.colors[0], font: brand.font};
    next.purpose = /来店/.test(brand.purpose) ? 'visit' : /予約/.test(brand.purpose) ? 'reserve' : /メニュー/.test(brand.purpose) ? 'menu' : /フォロー/.test(brand.purpose) ? 'follow' : 'save';
    if (!/美容|スキンケア/.test(brand.genre)) next.theme = brand.name + 'の紹介';
    next.scenes = drafts(next); return next;
  }
  async function prepareReelAccount(id, brand) {
    const saved = await store('get', 'current', id), pending = AccountWorkspace.recovery('reel', id);
    const source = pending && (!saved || (pending.updated || 0) > (saved.updated || 0)) ? pending : saved;
    const next = source ? normalize(source.value) : brandReelDefault(brand);
    next.genre ||= brand.genre; next.brandName ||= brand.name; next.brandCta ||= brand.cta;
    await Promise.all(next.scenes.map(s => loadImage(s.image))); return next;
  }
  function activateReelAccount(next) {
    stop(); clearTimeout(timer); revision++; reelDirty = false; model = next; selected = 0; time = 0;
    const used = new Set(model.scenes.filter(s => s.image).map(s => s.image)); for (const key of cache.keys()) if (!used.has(key)) cache.delete(key);
    q('rDraftName').value = ''; q('rTemplateName').value = ''; q('rTemplateList').replaceChildren(); q('rDraftList').replaceChildren();
    sync(); listReelDrafts(); if (!q('r-style').hidden) templateList(); q('rSaveStatus').textContent = 'アカウントのリールを表示中';
  }
  async function openReelRecord(record) {
    pendingReelLoads++;
    try { const next = normalize(record.value); next.genre ||= AccountWorkspace.brand.genre; next.brandName ||= AccountWorkspace.brand.name; next.brandCta ||= AccountWorkspace.brand.cta; await Promise.all(next.scenes.map(s => loadImage(s.image))); activateReelAccount(next); await persist(); }
    finally { pendingReelLoads--; }
  }
  async function listReelDrafts() {
    const ownerId = AccountWorkspace.currentId, list = q('rDraftList');
    try {
      const records = (await store('getAll')).filter(r => r.id.startsWith('draft-')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
      if (ownerId !== AccountWorkspace.currentId) return; list.replaceChildren();
      for (const record of records) {
        const row = document.createElement('article'); row.className = 'w-reel-draft'; const name = document.createElement('b'); name.textContent = record.name;
        const open = document.createElement('button'); open.textContent = '開いて再編集'; open.onclick = async () => { if (!await confirmAction('現在のリールをこの下書きに切り替えます。残したい内容は先に名前を付けて保存してください。')) return; if (ownerId !== AccountWorkspace.currentId) return; await persist(); if (!lastReelSaveOK) return toast('現在のリールを保存できないため切替を中止しました。'); await openReelRecord(record); };
        const remove = document.createElement('button'); remove.textContent = '削除'; remove.onclick = async () => { if (!await confirmAction('この保存済みリールを削除しますか？')) return; if (ownerId !== AccountWorkspace.currentId) return; try { await store('delete', record.id, ownerId); listReelDrafts(); } catch { toast('削除できませんでした。'); } };
        row.append(name, open, remove); list.append(row);
      }
    } catch { list.textContent = '保存したリールを読み込めません。'; }
  }
  function persist() {
    clearTimeout(timer); const copy = structuredClone(model), savedRevision = revision, ownerId = AccountWorkspace.currentId, snapshotAt = Date.now();
    writeQueue = writeQueue.catch(() => {}).then(async () => { try { await store('put', {id: 'current', value: copy, updated: snapshotAt}, ownerId); lastReelSaveOK = true; AccountWorkspace.clearRecovery('reel', snapshotAt, ownerId); if (savedRevision === revision && ownerId === AccountWorkspace.currentId) { reelDirty = false; q('rSaveStatus').textContent = '● リールをこのブラウザに保存済み'; } } catch { lastReelSaveOK = false; q('rSaveStatus').textContent = '保存できません。空き容量・設定を確認してください'; } }); return writeQueue;
  }
  function change() { revision++; reelDirty = true; q('rSaveStatus').textContent = '保存中…'; clearTimeout(timer); timer = setTimeout(persist, 350); draw(); updateTime(); updateScriptWarnings(); }
  function normalize(value) {
    if (!value || !Array.isArray(value.scenes) || value.scenes.length !== 5) throw Error('保存形式が違います');
    const clean = structuredClone(value); clean.style = {...defaultStyle, ...clean.style};
    for (const s of clean.scenes) { if (typeof s.caption !== 'string' || typeof s.narration !== 'string') throw Error('台本を確認できません'); s.seconds = Math.max(.5, Math.min(60, Number(s.seconds) || 3)); }
    clean.scenes[0].seconds = Math.min(3, clean.scenes[0].seconds);
    Object.assign(clean, Scripts.options(clean));
    clean.scriptTemplateVersion = value.scriptTemplateVersion || 0;
    return clean;
  }
  async function loadImage(data) { if (!data) return null; if (!cache.has(data)) { const img = new Image(); img.src = data; await img.decode(); cache.set(data, img); } return cache.get(data); }
  function readFile(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); }); }
  function tab(name) { all('[data-r-tab]').forEach(b => { const yes = b.dataset.rTab === name; b.classList.toggle('active', yes); b.setAttribute('aria-selected', yes); }); ['script', 'media', 'style', 'audio'].forEach(k => q('r-' + k).hidden = name !== k); }
  function stop() { playing = false; cancelAnimationFrame(frameID); voice.pause(); music.pause(); q('rPlay').textContent = '▷ 再生'; }
  function select(index, seek = true) { stop(); selected = index; if (seek) time = model.scenes.slice(0, index).reduce((a, s) => a + s.seconds, 0); syncSelected(); draw(); updateTime(); }
  function syncSelected() {
    all('.r-current').forEach(el => el.textContent = `${selected + 1}：${roles[selected]}`);
    all('.reel-scene').forEach((el, i) => el.classList.toggle('selected', i === selected));
    all('#rTimeline button').forEach((el, i) => el.classList.toggle('active', i === selected));
    q('rPrompt').value = model.scenes[selected].prompt; q('rImageName').textContent = model.scenes[selected].imageName || '写真なし（背景デザインで表示）'; q('rRemoveImage').disabled = !model.scenes[selected].image;
  }
  function cards() {
    q('rScenes').replaceChildren(); q('rTimeline').replaceChildren();
    model.scenes.forEach((s, i) => {
      const box = document.createElement('article'); box.className = 'reel-scene';
      box.innerHTML = `<h4>${String(i + 1).padStart(2, '0')}　${roles[i]}<span>${i === 0 ? '0〜3秒の冒頭' : '自由に編集'}</span></h4><button class="scene-select">このシーンを表示</button><label>テロップ<textarea maxlength="240" aria-label="シーン${i + 1}のテロップ"></textarea></label><label>ナレーション台本<textarea maxlength="600" aria-label="シーン${i + 1}のナレーション台本"></textarea></label><p class="voice-budget"></p><label>表示秒数<div class="duration-row"><input type="number" min="0.5" max="${i === 0 ? 3 : 60}" step="0.5" aria-label="シーン${i + 1}の表示秒数"><span>秒${i === 0 ? '（最大3秒）' : ''}</span></div></label>`;
      const areas = box.querySelectorAll('textarea'); areas[0].value = s.caption; areas[1].value = s.narration;
      areas[0].oninput = e => { stop(); s.caption = e.target.value; selected = i; syncSelected(); if (i === 0) refreshScriptControls(); change(); };
      areas[1].oninput = e => { s.narration = e.target.value; if (i === 0) refreshScriptControls(); change(); };
      const input = box.querySelector('input'); input.value = s.seconds;
      input.onchange = () => { stop(); s.seconds = Math.round(Math.max(.5, Math.min(i === 0 ? 3 : 60, Number(input.value) || .5)) * 2) / 2; input.value = s.seconds; time = Math.min(time, total()); change(); };
      box.querySelector('button').onclick = () => select(i); q('rScenes').append(box);
      const b = document.createElement('button'); b.innerHTML = `<b>${i + 1}</b>${roles[i]}`; b.onclick = () => select(i); q('rTimeline').append(b);
    }); syncSelected(); updateScriptWarnings();
  }
  function sync() {
    q('rTheme').value = model.theme; q('rTarget').value = model.target; q('rDuration').value = model.duration; q('rPurpose').value = model.purpose;
    for (const [key, id] of Object.entries({font: 'rFont', bg: 'rBg', color: 'rColor', band: 'rBand', size: 'rSize', y: 'rY', align: 'rAlign', animation: 'rAnimation'})) q(id).value = model.style[key];
    q('rSizeValue').textContent = model.style.size + ' px'; q('rYValue').textContent = model.style.y + ' %';
    q('rNarrationName').textContent = model.narration?.name || '未設定 / 音声生成サービスは未接続'; q('rBgmName').textContent = model.bgm?.name || '未設定 / BGMは同梱していません';
    q('rLicense').value = model.license; q('rBgmConsent').checked = model.bgmConsent; q('rVolume').value = model.volume * 100; q('rVolumeValue').textContent = Math.round(model.volume * 100) + ' %';
    if (model.narration) voice.src = model.narration.data; else { voice.removeAttribute('src'); voice.load(); }
    if (model.bgm) music.src = model.bgm.data; else { music.removeAttribute('src'); music.load(); } music.volume = model.volume;
    cards(); refreshScriptControls(); updateTime(); draw();
  }
  function updateTime() {
    const seconds = total(); q('rTotal').textContent = `${seconds}秒 ・ 5シーン${Math.abs(seconds - model.duration) > .1 ? `（設定は${model.duration}秒）` : ''}`;
    q('rTime').textContent = `${clock(time)} / ${clock(seconds)}`; q('rSeek').max = seconds; q('rSeek').value = time;
  }
  function refreshScriptControls() {
    const fields = {rHookType: 'hookType', rPostType: 'postType', rFacts: 'scriptFacts', rExperienceBefore: 'experienceBefore', rExperienceAction: 'experienceAction', rExperienceResult: 'experienceResult', rProductName: 'productName', rProductFacts: 'productFacts', rAdDisclosure: 'adDisclosure'};
    for (const [id, key] of Object.entries(fields)) if (document.activeElement !== q(id)) q(id).value = model[key];
    const result = Scripts.generate(model);
    q('rManualFacts').hidden = result.topic !== 'manual' || !['knowledge', 'solution'].includes(model.postType);
    q('rExperienceFields').hidden = model.postType !== 'experience'; q('rProductFields').hidden = model.postType !== 'product';
    q('rScriptNotice').textContent = (model.scriptTemplateVersion === 0 ? '保存済みの台本・素材はそのまま引き継ぎました。 ' : '') + result.notice;
    const list = q('rHookCandidates'); list.replaceChildren();
    for (const hook of result.hooks) {
      const row = document.createElement('article'); row.className = 'hook-card';
      const applied = model.scenes[0].caption === hook.caption && model.scenes[0].narration === hook.narration; row.classList.toggle('selected', applied);
      const label = document.createElement('h4'); label.textContent = hook.label;
      const copy = document.createElement('p'); copy.textContent = hook.caption;
      const button = document.createElement('button'); button.dataset.hook = hook.id; button.setAttribute('aria-pressed', applied); button.textContent = applied ? '第1シーンに反映中' : 'このフックを第1シーンに反映';
      button.onclick = () => { stop(); Object.assign(model.scenes[0], {caption: hook.caption, narration: hook.narration}); model.hookType = hook.id; selected = 0; time = 0; cards(); refreshScriptControls(); change(); toast('フックを第1シーンに反映しました。ほかのシーンと素材は残しています。'); };
      row.append(label, copy, button); list.append(row);
    }
  }
  function updateScriptWarnings() {
    const warnings = Scripts.warnings(model.scenes), box = q('rScriptWarnings'); box.hidden = !warnings.length; box.replaceChildren();
    if (warnings.length) { const list = document.createElement('ul'); warnings.forEach(message => { const item = document.createElement('li'); item.textContent = message; list.append(item); }); box.append(list); }
    all('.reel-scene .voice-budget').forEach((el, i) => {
      const count = [...model.scenes[i].narration.replace(/\s/g, '')].length, seconds = model.scenes[i].seconds;
      el.textContent = `ナレーション ${count}字 / 読み上げ約${Math.ceil(count / 6)}秒の目安（1秒6字）・表示${seconds}秒`;
      el.classList.toggle('long', count > seconds * 6);
    });
  }
  function background(context, index, progress = 0, zoom = true) {
    const {style, scenes} = model; context.fillStyle = style.bg; context.fillRect(0, 0, 1080, 1920);
    const img = cache.get(scenes[index].image);
    if (img) {
      const scale = Math.max(1080 / img.width, 1920 / img.height) * (zoom && style.animation === 'zoom' ? 1 + .07 * progress : 1);
      context.drawImage(img, (1080 - img.width * scale) / 2, (1920 - img.height * scale) / 2, img.width * scale, img.height * scale);
    } else {
      context.fillStyle = '#a6ad8d'; context.globalAlpha = .16; context.beginPath(); context.arc(1000, 700, 480, 0, 7); context.fill(); context.beginPath(); context.arc(100, 1550, 330, 0, 7); context.fill(); context.globalAlpha = 1;
      context.strokeStyle = style.color; context.globalAlpha = .2; context.strokeRect(55, 55, 970, 1810); context.globalAlpha = 1;
    }
  }
  function caption(context, index) {
    const st = model.style, text = model.scenes[index].caption, family = st.font === 'serif' ? 'JPSerif' : 'JP';
    if (model.adDisclosure !== 'none') {
      context.globalAlpha = .95; context.fillStyle = st.band; context.fillRect(70, 140, 260, 80); context.globalAlpha = 1;
      context.fillStyle = st.color; context.font = `38px ${family}`; context.textAlign = 'left'; context.fillText(model.adDisclosure, 94, 195);
    }
    let size = st.size, rows;
    do { rows = wrap(text, 860, size, family, st.font === 'bold' ? 600 : 400); if (rows.length * size * 1.5 <= 500) break; size--; } while (size > 32);
    const overflow = rows.length * size * 1.5 > 500;
    const height = rows.length * size * 1.5 + 100, y = Math.max(220, Math.min(1580 - height, 1920 * st.y / 100 - height / 2));
    context.globalAlpha = .91; context.fillStyle = st.band; context.fillRect(70, y, 940, height); context.globalAlpha = 1;
    context.fillStyle = st.color; context.font = `${st.font === 'bold' ? 600 : 400} ${size}px ${family}`; context.textAlign = st.align;
    const x = st.align === 'left' ? 110 : st.align === 'right' ? 970 : 540;
    rows.forEach((row, j) => context.fillText(row, x, y + 65 + size + j * size * 1.5));
    context.textAlign = 'left'; context.font = `24px ${family}`; context.fillText((model.brandName || AccountWorkspace.brand.name).slice(0, 36), 100, y + height - 22);
    return overflow;
  }
  function draw() {
    const position = which(time); const active = position.index === selected ? position : {index: selected, local: 0};
    ctx.clearRect(0, 0, 1080, 1920); ctx.fillStyle = model.style.bg; ctx.fillRect(0, 0, 1080, 1920);
    ctx.save();
    if (playing && model.style.animation === 'fade') ctx.globalAlpha = Math.max(.01, Math.min(1, active.local / .3, (model.scenes[active.index].seconds - active.local) / .3));
    // draw on an offscreen surface so a fade applies equally to photo and caption.
    const c = surfaceContext; c.clearRect(0, 0, 1080, 1920);
    background(c, active.index, active.local / model.scenes[active.index].seconds); const tooLong = caption(c, active.index); ctx.drawImage(surface, 0, 0); ctx.restore();
    q('rOverflow').hidden = !tooLong; q('rOverflow').textContent = 'テロップが長すぎます。短くしてから動画・素材を書き出してください。';
  }
  function audioStart(element, enabled, offset, loop = false) {
    element.pause(); if (!enabled) return;
    const start = () => { if (!playing) return; try { const duration = element.duration; if (!Number.isFinite(duration) || !duration) return; if (!loop && offset >= duration) return; element.currentTime = loop ? offset % duration : offset; element.play().catch(() => toast('音声を再生できません。音声形式と端末の設定を確認してください。')); } catch {} };
    if (element.readyState >= 1) start(); else element.addEventListener('loadedmetadata', start, {once: true});
  }
  function play() {
    if (playing) { stop(); draw(); return; }
    if (time >= total() - .05) time = 0;
    playing = true; startTime = performance.now() - time * 1000; q('rPlay').textContent = 'Ⅱ 一時停止';
    audioStart(voice, !!model.narration, time); audioStart(music, !!model.bgm && model.bgmConsent, time, true);
    const tick = () => { time = Math.min(total(), (performance.now() - startTime) / 1000); const index = which(time).index; if (index !== selected) { selected = index; syncSelected(); } draw(); updateTime(); if (time >= total()) { stop(); return; } frameID = requestAnimationFrame(tick); }; tick();
  }
  async function templateList() {
    const list = q('rTemplateList'), ownerId = AccountWorkspace.currentId; list.replaceChildren();
    try { for (const record of (await store('getAll')).filter(x => x.id.startsWith('template-'))) {
      if (ownerId !== AccountWorkspace.currentId) return;
      const row = document.createElement('div'); row.className = 'reel-template'; const name = document.createElement('b'); name.textContent = record.name;
      const use = document.createElement('button'); use.textContent = '適用'; use.onclick = () => { stop(); model.style = {...defaultStyle, ...record.style}; sync(); change(); toast('テンプレートを適用しました'); };
      const remove = document.createElement('button'); remove.textContent = '削除'; remove.onclick = async () => { if (await confirmAction('このリール用テンプレートを削除しますか？')) { await store('delete', record.id); templateList(); } };
      row.append(name, use, remove); list.append(row);
    } } catch { list.textContent = 'テンプレート保存先を利用できません。'; }
  }
  async function sceneAsset(index, layer) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const context = c.getContext('2d');
    if (layer !== 'caption') background(context, index, 0, false);
    if (layer !== 'background') caption(context, index);
    return c.toDataURL(layer === 'background' ? 'image/jpeg' : 'image/png', .9);
  }
  function bytes(data) { const raw = atob(data.split(',')[1]); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
  const utf8 = text => new TextEncoder().encode(text);
  function stamp(seconds) { const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; }
  function safeAudioName(track, prefix) { const ext = ({'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm'})[track.mime] || 'audio'; return `${prefix}.${ext}`; }
  async function validateExport() {
    await document.fonts.ready;
    for (let i = 0; i < 5; i++) { const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; if (caption(c.getContext('2d'), i)) { toast(`${i + 1}シーン目のテロップを短くしてください。`); return false; } }
    if (!model.scenes.every(s => Number.isFinite(s.seconds) && s.seconds >= .5) || total() > 243) { toast('シーンの秒数を確認してください。'); return false; }
    return true;
  }
  function setBusy(value, text = '') { busy = value; q('rZip').disabled = value; q('rMp4').disabled = value || !server; q('rExportStatus').textContent = text; q('rProgress').hidden = !value; q('reelWorkspace').querySelector('.reel-editor').inert = value; }
  async function exportZip() {
    if (busy || !await validateExport()) return; stop(); setBusy(true, 'CapCut用の素材を準備中…');
    try {
      const files = [], timeline = ['scene,start_seconds,end_seconds,duration_seconds,image,caption_layer,animation'], script = [`テーマ：${model.theme}`, `ターゲット：${model.target}`, `目的：${q('rPurpose').selectedOptions[0].textContent}`, `投稿タイプ：${q('rPostType').selectedOptions[0].textContent}`, `冒頭タイプ：${q('rHookType').selectedOptions[0].textContent}`, `広告・PR表示：${model.adDisclosure === 'none' ? 'なし' : model.adDisclosure}`, '方式：外部AIを使わない編集用テンプレート', ''], subtitles = [];
      let start = 0;
      for (let i = 0; i < 5; i++) {
        const n = String(i + 1).padStart(2, '0'), s = model.scenes[i], end = start + s.seconds;
        for (const layer of ['background', 'caption', 'composite']) files.push({name: `scene-${n}-${layer}.${layer === 'background' ? 'jpg' : 'png'}`, data: bytes(await sceneAsset(i, layer))});
        timeline.push(`${i + 1},${start.toFixed(3)},${end.toFixed(3)},${s.seconds},scene-${n}-background.jpg,scene-${n}-caption.png,${model.style.animation}`);
        script.push(`【${i + 1} ${roles[i]} / ${start.toFixed(1)}〜${end.toFixed(1)}秒】`, `テロップ：${s.caption}`, `ナレーション：${s.narration}`, '');
        subtitles.push(`${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${(model.adDisclosure !== 'none' ? model.adDisclosure + '\n' : '') + s.caption.replace(/-->/g, '→')}\n`); start = end;
      }
      files.push({name: 'script.txt', data: utf8(script.join('\n'))}, {name: 'timeline.csv', data: utf8('\uFEFF' + timeline.join('\r\n'))}, {name: 'captions.srt', data: utf8(subtitles.join('\n'))}, {name: 'image-prompts.txt', data: utf8(model.scenes.map((s, i) => `Scene ${i + 1}\n${s.prompt}`).join('\n\n'))});
      files.push({name: 'script-notes.txt', data: utf8([
        '入力した情報のメモ（ツールが事実確認したものではありません）',
        '確認済み情報・出典メモ：' + model.scriptFacts,
        '体験・困っていたこと：' + model.experienceBefore,
        '体験・試したこと：' + model.experienceAction,
        '体験・感じたことと条件：' + model.experienceResult,
        '商品名：' + model.productName, '商品情報・出典メモ：' + model.productFacts,
        ...Scripts.warnings(model.scenes)
      ].join('\n\n'))});
      const settings = structuredClone(model); settings.scenes.forEach(s => delete s.image); delete settings.narration; delete settings.bgm;
      files.push({name: 'settings.json', data: utf8(JSON.stringify(settings, null, 2))});
      if (model.narration) files.push({name: safeAudioName(model.narration, 'narration'), data: bytes(model.narration.data)});
      if (model.bgm && model.bgmConsent) { files.push({name: safeAudioName(model.bgm, 'bgm'), data: bytes(model.bgm.data)}, {name: 'bgm-license.txt', data: utf8('使用者が利用許諾を確認したBGM\n' + model.license + '\n元ファイル名：' + model.bgm.name)}); }
      files.push({name: 'README.txt', data: utf8(`CapCutでの配置方法\n1. 1080×1920・30fpsのプロジェクトを作成。\n2. scene-XX-background.jpgをtimeline.csvの順に、指定秒数で配置。\n3. caption.pngを上のトラックに同じ秒数で配置。composite.pngは背景と字幕を合成した代替素材です。重ねて使わないでください。\n4. フェードは各シーンの先頭/末尾0.3秒、ズームは背景のみ1.00→1.07倍を目安に設定。\n5. SRTとナレーション台本は補助素材です。字幕画像を使う場合、SRTを重複表示しないでください。\n6. 音声は先頭から。BGMは必要に応じて繰り返し、音量${Math.round(model.volume * 100)}%を目安に調整。\n7. H.264/AAC、30fpsのMP4で出力。\nCapCutのプロジェクト直接読み込みや完全な自動再現を保証する形式ではありません。\nAI画像・ナレーション生成は接続されていません。BGMの権利は使用者が確認します。\n`)});
      download(zip(files), 'reel-capcut-assets.zip'); setBusy(false, 'CapCut用素材ZIPを保存しました。');
    } catch { setBusy(false, '素材を保存できませんでした。再試行してください。'); }
  }
  async function checkServer() {
    server = false;
    // Static GitHub Pages has no server. Do not make a misleading API request there.
    if (!location.hostname.endsWith('.github.io')) {
      try { const response = await fetch('api/reels/capabilities', {signal: AbortSignal.timeout(4000)}); const data = await response.json(); server = response.ok && data.mp4 === true && data.protocol === 'tsumugu-reels-v1'; } catch {}
    }
    q('rMp4').disabled = !server; q('rServerStatus').classList.toggle('available', server);
    q('rServerStatus').textContent = server ? 'MP4生成サーバーに接続済み：1080×1920 / 30fps / H.264 / AAC。書き出し時に素材をこのサーバーへ送信します。' : 'MP4生成サーバー：未接続。GitHub PagesではMP4生成は動きません。素材ZIPをご利用いただくか、付属のPython＋FFmpegサーバーでこのアプリを開いてください。';
  }
  async function exportMp4() {
    if (busy || !server || !await validateExport()) return;
    if (!await confirmAction('写真・テロップ・設定済みの音声を、接続中のMP4生成サーバーへ送信します。生成には数分かかる場合があります。続けますか？', 'MP4を書き出す')) return;
    stop(); setBusy(true, 'MP4を生成中… この画面を開いたままお待ちください。');
    try {
      const scenes = [];
      for (let i = 0; i < 5; i++) scenes.push({seconds: model.scenes[i].seconds, background: await sceneAsset(i, 'background'), caption: await sceneAsset(i, 'caption')});
      const response = await fetch('api/reels/render', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({scenes, style: model.style, narration: model.narration, bgm: model.bgmConsent ? model.bgm : null, bgmConsent: model.bgmConsent, volume: model.volume})});
      if (!response.ok) { const message = await response.json().catch(() => ({})); throw Error(message.error || 'MP4生成に失敗しました'); }
      download(await response.blob(), 'reel-1080x1920.mp4'); setBusy(false, 'MP4を保存しました。1080×1920 / 30fps / H.264 / AAC');
    } catch (error) { setBusy(false, error.message || 'MP4生成に失敗しました。サーバーの接続状態をご確認ください。'); }
  }
  function bind() {
    q('feedMode').onclick = () => { stop(); q('feedWorkspace').hidden = false; q('reelWorkspace').hidden = true; q('feedMode').classList.add('active'); q('reelMode').classList.remove('active'); q('feedMode').setAttribute('aria-pressed', true); q('reelMode').setAttribute('aria-pressed', false); };
    q('reelMode').onclick = () => { q('feedWorkspace').hidden = true; q('reelWorkspace').hidden = false; q('feedMode').classList.remove('active'); q('reelMode').classList.add('active'); q('feedMode').setAttribute('aria-pressed', false); q('reelMode').setAttribute('aria-pressed', true); draw(); };
    all('[data-r-tab]').forEach((b, index, buttons) => {
      b.id = 'r-tab-' + b.dataset.rTab; b.setAttribute('aria-controls', 'r-' + b.dataset.rTab);
      q('r-' + b.dataset.rTab).setAttribute('role', 'tabpanel'); q('r-' + b.dataset.rTab).setAttribute('aria-labelledby', b.id);
      b.onclick = () => { tab(b.dataset.rTab); if (b.dataset.rTab === 'style') templateList(); };
      b.onkeydown = e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const next = buttons[(index + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length]; next.click(); next.focus(); } };
    });
    for (const [id, key] of Object.entries({rTheme: 'theme', rTarget: 'target', rPurpose: 'purpose', rHookType: 'hookType', rPostType: 'postType', rFacts: 'scriptFacts', rExperienceBefore: 'experienceBefore', rExperienceAction: 'experienceAction', rExperienceResult: 'experienceResult', rProductName: 'productName', rProductFacts: 'productFacts', rAdDisclosure: 'adDisclosure'})) q(id).oninput = e => { model[key] = e.target.value; if (key === 'adDisclosure') stop(); refreshScriptControls(); change(); };
    q('rDuration').onchange = () => { stop(); model.duration = Number(q('rDuration').value); model.scenes.forEach((s, i) => s.seconds = durationSets[model.duration][i]); time = 0; cards(); change(); };
    q('rRebalance').onclick = () => { stop(); model.scenes.forEach((s, i) => s.seconds = durationSets[model.duration][i]); time = 0; cards(); change(); };
    q('rGenerate').onclick = async () => { if (!model.theme.trim()) return toast('テーマを入力してください'); if (!await confirmAction('5シーンのテロップと台本を編集用テンプレートで置き換えます。写真・音声・デザインは残します。設定済みの音声がある場合は、台本との一致も確認してください。')) return; stop(); const previous = model.scenes; model.scenes = drafts(model).map((s, i) => ({...s, image: previous[i].image, imageName: previous[i].imageName})); model.scriptTemplateVersion = 1; time = 0; selected = 0; cards(); refreshScriptControls(); change(); };
    q('rImage').onchange = async e => {
      const file = e.target.files[0], target = model.scenes[selected]; if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 ** 2) { toast('12MB以下のJPG・PNG・WebPを選んでください'); e.target.value = ''; return; }
      pendingReelLoads++;
      try { const img = await loadImage(await readFile(file)); if (img.width * img.height > 40000000) throw Error(); const scale = Math.min(1, 1920 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const data = c.toDataURL('image/jpeg', .9); await loadImage(data); target.image = data; target.imageName = file.name; stop(); syncSelected(); change(); } catch { toast('写真を読み込めませんでした。別の写真を選んでください'); } finally { pendingReelLoads--; e.target.value = ''; }
    };
    q('rRemoveImage').onclick = () => { stop(); model.scenes[selected].image = null; model.scenes[selected].imageName = ''; syncSelected(); change(); };
    q('rPrompt').oninput = e => { model.scenes[selected].prompt = e.target.value; change(); };
    q('rPromptReset').onclick = () => { model.scenes[selected].prompt = imagePrompt(selected); syncSelected(); change(); };
    q('rPromptCopy').onclick = async () => { try { await navigator.clipboard.writeText(q('rPrompt').value); toast('プロンプトをコピーしました'); } catch { q('rPrompt').select(); toast('プロンプトを選択しました。コピーしてください'); } };
    for (const [key, id] of Object.entries({font: 'rFont', bg: 'rBg', color: 'rColor', band: 'rBand', size: 'rSize', y: 'rY', align: 'rAlign', animation: 'rAnimation'})) q(id).oninput = e => { stop(); model.style[key] = ['size', 'y'].includes(key) ? Number(e.target.value) : e.target.value; q('rSizeValue').textContent = model.style.size + ' px'; q('rYValue').textContent = model.style.y + ' %'; change(); };
    q('rSaveTemplate').onclick = async () => { const name = q('rTemplateName').value.trim(); if (!name) return toast('テンプレート名を入力してください'); try { await store('put', {id: 'template-' + crypto.randomUUID(), name, style: structuredClone(model.style)}); templateList(); toast('リール用テンプレートを保存しました'); } catch { toast('テンプレートを保存できませんでした'); } };
    for (const [id, key] of [['rNarration', 'narration'], ['rBgm', 'bgm']]) q(id).onchange = async e => {
      const file = e.target.files[0]; if (!file) return; if (!file.type.startsWith('audio/') || file.size > 20 * 1024 ** 2) { toast('20MB以下の音声ファイルを選んでください'); e.target.value = ''; return; }
      pendingReelLoads++;
      try { const data = await readFile(file), check = new Audio(); check.src = data; await new Promise((resolve, reject) => { check.onloadedmetadata = resolve; check.onerror = reject; }); if (!Number.isFinite(check.duration)) throw Error(); stop(); model[key] = {name: file.name, mime: file.type, data}; if (key === 'bgm') model.bgmConsent = false; sync(); change(); } catch { toast('この音声を読み込めません。MP3・WAVなど別の形式をお試しください'); } finally { pendingReelLoads--; e.target.value = ''; }
    };
    q('rRemoveNarration').onclick = () => { stop(); model.narration = null; sync(); change(); }; q('rRemoveBgm').onclick = () => { stop(); model.bgm = null; model.bgmConsent = false; sync(); change(); };
    q('rBgmConsent').onchange = e => { stop(); model.bgmConsent = e.target.checked; change(); }; q('rLicense').oninput = e => { model.license = e.target.value; change(); };
    q('rVolume').oninput = e => { model.volume = Number(e.target.value) / 100; music.volume = model.volume; q('rVolumeValue').textContent = e.target.value + ' %'; change(); };
    q('rPlay').onclick = play; q('rStop').onclick = () => { stop(); time = 0; selected = 0; syncSelected(); draw(); updateTime(); };
    q('rSeek').oninput = e => { stop(); time = Number(e.target.value); selected = which(time).index; syncSelected(); draw(); updateTime(); };
    q('rSaveNamed').onclick = async () => {
      const ownerId = AccountWorkspace.currentId, button = q('rSaveNamed'); button.disabled = true;
      try { await store('put', {id: 'draft-' + crypto.randomUUID(), name: q('rDraftName').value.trim() || model.theme || '無題のリール', value: structuredClone(model), updated: Date.now()}, ownerId); if (ownerId === AccountWorkspace.currentId) await listReelDrafts(); toast('このアカウントにリールを保存しました。'); }
      catch { toast('リールを保存できません。空き容量と設定を確認してください。'); } finally { button.disabled = false; }
    };
    q('rNewProject').onclick = async () => { if (!await confirmAction('ブランド設定から新しいリールを作成します。残したい内容は先に名前を付けて保存してください。')) return; await persist(); if (!lastReelSaveOK) return toast('保存できないため新規作成を中止しました。'); activateReelAccount(brandReelDefault()); await persist(); };
    q('rSaveProject').onclick = () => persist(); q('rZip').onclick = exportZip; q('rMp4').onclick = exportMp4;
    document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); persist(); } });
    const emergencyReel = () => AccountWorkspace.recover('reel', {id: 'current', value: structuredClone(model), updated: Date.now()});
    window.addEventListener('beforeunload', event => { if ((reelDirty || !lastReelSaveOK) && !emergencyReel()) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('pagehide', () => { if (reelDirty || !lastReelSaveOK) emergencyReel(); persist(); });
  }
  async function boot() {
    q('reelMode').disabled = true; await openDB();
    model = await prepareReelAccount(AccountWorkspace.currentId, AccountWorkspace.brand);
    bind(); sync(); q('reelMode').disabled = false; await persist(); await listReelDrafts();
    AccountWorkspace.register('reel', {
      flush: async () => { await persist(); return lastReelSaveOK; }, busy: () => busy || pendingReelLoads > 0,
      prepare: prepareReelAccount, activate: activateReelAccount,
      snapshot: () => ({id: 'current', value: structuredClone(model), updated: Date.now()}),
      open: openReelRecord, validate: record => record.id.startsWith('template-') ? record.style : normalize(record.value)
    });
    document.fonts.ready.then(draw); checkServer();
  }
  boot().catch(error => { q('rSaveStatus').textContent = '保存データを読み込めないため停止しました。原データは削除していません。'; AccountWorkspace.fail(error); });
})();
