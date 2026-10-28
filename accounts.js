/* Local workspace repository. No network calls. Account IDs are data boundaries, not authentication. */
(() => {
  'use strict';
  const q = id => document.getElementById(id), copy = v => structuredClone(v);
  const seeds = [
    {id: 'brand-maru', name: 'まる｜39歳からの頑張らない美容', icon: '🌿', genre: '美容・スキンケア', target: '30代後半〜50代女性', worldview: 'ナチュラル、上品、親しみやすい', colors: ['#f8f5ec', '#435445', '#a6ad8d'], font: 'sans', template: 'natural', tone: '共感・気づき・信頼感を重視', prohibited: '効果の断定、過度な不安、根拠のない表現', purpose: '保存・フォロー', cta: 'あとで見返せるように保存を。よかったらフォローしてください。'},
    {id: 'brand-restaurant', name: '飲食店｜運用代行', icon: '🍽️', genre: '飲食店', target: '家族連れ', worldview: '温かみ、安心感、おいしさ', colors: ['#faf3e7', '#624b3c', '#b88c61'], font: 'sans', template: 'natural', tone: '来店したくなる魅力を、確認済みの情報で伝える', prohibited: '未確認のメニュー・価格・営業時間、根拠のない最上級表現', purpose: '来店・予約・メニュー紹介', cta: 'メニューや予約方法をご確認ください。'}
  ];
  let db, currentId, brands = [], switching = false, loaded = false, lockRelease;
  const editors = new Map();
  const uid = () => 'brand-' + crypto.randomUUID();
  function message(text, error = false) { q('wStatus').textContent = text; q('wStatus').classList.toggle('error', error); }
  function transaction(names, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode); let result;
      tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('保存処理を完了できませんでした。'));
      try { result = fn(tx); } catch (error) { try { tx.abort(); } catch {} reject(error); }
    });
  }
  const range = (id, ns) => ns ? IDBKeyRange.bound([id, ns, ''], [id, ns, '\uffff']) : IDBKeyRange.bound([id, '', ''], [id, '\uffff', '\uffff']);
  async function store(ns, op, value, id = currentId) {
    if (!loaded || !id || !brands.some(b => b.id === id) || !['feed', 'reel'].includes(ns)) throw Error('制作アカウントを確認できません。');
    try {
      const result = await transaction(['records'], ['get', 'all', 'getAll'].includes(op) ? 'readonly' : 'readwrite', tx => {
        const s = tx.objectStore('records');
        if (op === 'all' || op === 'getAll') return s.getAll(range(id, ns));
        if (op === 'get') return s.get([id, ns, value]);
        if (op === 'put') { if (!value || typeof value.id !== 'string') throw Error('投稿IDが不正です。'); return s.put({accountId: id, namespace: ns, id: value.id, record: copy(value)}); }
        if (op === 'delete') return s.delete([id, ns, value]);
        throw Error('保存操作が不正です。');
      });
      if (op === 'get') return result?.record;
      if (op === 'all' || op === 'getAll') return result.map(r => r.record);
      return result;
    } catch (error) { message('保存・読み込みに失敗しました。空き容量とブラウザの保存設定を確認してください。', true); throw error; }
  }
  const recoveryKey = (ns, id) => `tsumugu-ws-recovery-v1:${ns}:${id}`;
  function recovery(ns, id = currentId) {
    const raw = localStorage.getItem(recoveryKey(ns, id)); if (!raw) return null;
    const value = JSON.parse(raw);
    if (value.accountId !== id || value.namespace !== ns || !value.record) throw Error('復旧データのアカウントを確認できません。');
    validateData(value.record, ns); return value.record;
  }
  function recover(ns, record, id = currentId) {
    try { localStorage.setItem(recoveryKey(ns, id), JSON.stringify({accountId: id, namespace: ns, record})); return true; }
    catch { return false; }
  }
  function clearRecovery(ns, at, id = currentId) {
    try { const pending = recovery(ns, id); if (pending && (pending.updated || 0) <= at) localStorage.removeItem(recoveryKey(ns, id)); } catch {}
  }
  async function legacyDB(name, storeName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, {keyPath: 'id'});
      request.onerror = request.onblocked = () => reject(Error('旧データを読み込めません。ほかのタブを閉じて再試行してください。'));
      request.onsuccess = () => {
        const old = request.result;
        if (!old.objectStoreNames.contains(storeName)) { old.close(); reject(Error('旧データの保存形式が違います。')); return; }
        const tx = old.transaction(storeName), get = tx.objectStore(storeName).getAll();
        tx.oncomplete = () => { old.close(); resolve(get.result); }; tx.onerror = () => { old.close(); reject(tx.error); };
      };
    });
  }
  function legacyJSON(key) {
    const value = localStorage.getItem(key); if (!value) return null;
    try { return JSON.parse(value); } catch { throw Error('旧ローカル保存を解析できません。原データは変更していません。'); }
  }
  async function migrate() {
    const migrated = await transaction(['meta'], 'readonly', tx => tx.objectStore('meta').get('migration-v1'));
    if (migrated) return;
    const [feed, reel] = await Promise.all([legacyDB('tsumugu-beauty', 'posts'), legacyDB('tsumugu-reels', 'data')]);
    const fallback = legacyJSON('tsumugu-beauty-fallback') || {}, v1 = legacyJSON('tsumugu-v1'), recovery = legacyJSON('tsumugu-beauty-recovery');
    const records = feed.map(record => ({accountId: seeds[0].id, namespace: 'feed', id: record.id, record}));
    for (const record of Object.values(fallback)) {
      if (!record || typeof record.id !== 'string') throw Error('旧保存データを確認できません。原データは保持しています。');
      const existing = records.find(r => r.id === record.id);
      if (!existing) records.push({accountId: seeds[0].id, namespace: 'feed', id: record.id, record});
      else if (JSON.stringify(existing.record) !== JSON.stringify(record)) {
        const id = 'legacy-local-' + record.id; records.push({accountId: seeds[0].id, namespace: 'feed', id, record: {...record, id, name: (record.name || '旧ローカルの編集中投稿') + '（移行）'}});
      }
    }
    const auto = records.find(r => r.id === 'autosave');
    if (recovery?.state) {
      if (!auto || recovery.updated > (auto.record.updated || 0)) {
        if (auto && JSON.stringify(auto.record.state) !== JSON.stringify(recovery.state)) records.push({...auto, id: 'legacy-previous-autosave', record: {...auto.record, id: 'legacy-previous-autosave', name: '移行前の自動保存'}});
        const next = {accountId: seeds[0].id, namespace: 'feed', id: 'autosave', record: {id: 'autosave', state: recovery.state, updated: recovery.updated}};
        if (auto) records.splice(records.indexOf(auto), 1, next); else records.push(next);
      } else if (JSON.stringify(auto.record.state) !== JSON.stringify(recovery.state)) records.push({accountId: seeds[0].id, namespace: 'feed', id: 'legacy-recovery', record: {id: 'legacy-recovery', name: '旧タブ終了時の保存', state: recovery.state, updated: recovery.updated}});
    }
    if (v1?.slides) {
      const id = records.some(r => r.id === 'autosave') ? 'legacy-v1' : 'autosave';
      records.push({accountId: seeds[0].id, namespace: 'feed', id, record: {id, name: '旧バージョンの投稿', state: v1, updated: 0}});
    }
    reel.forEach(record => records.push({accountId: seeds[0].id, namespace: 'reel', id: record.id, record}));
    // All seed accounts, copies and the migration marker commit together. Originals remain untouched.
    await transaction(['brands', 'records', 'meta'], 'readwrite', tx => {
      seeds.forEach(b => tx.objectStore('brands').put(copy(b)));
      records.forEach(r => tx.objectStore('records').put(r));
      tx.objectStore('meta').put({id: 'active', value: seeds[0].id}); tx.objectStore('meta').put({id: 'migration-v1', copied: records.length, at: Date.now()});
    });
  }
  function validateBrand(brand) {
    if (!brand || typeof brand !== 'object') throw Error('ブランドの形式が違います。');
    for (const key of ['name', 'icon', 'genre', 'target', 'worldview', 'tone', 'prohibited', 'purpose', 'cta']) {
      const max = key === 'icon' ? 12 : key === 'name' ? 60 : ['prohibited', 'cta', 'tone'].includes(key) ? 1000 : 160;
      if (typeof brand[key] !== 'string' || brand[key].length > max) throw Error('ブランド設定の文字数・形式を確認してください。');
    }
    if (!brand.name.trim() || !brand.genre.trim()) throw Error('アカウント名とジャンルを入力してください。');
    if (!Array.isArray(brand.colors) || brand.colors.length < 3 || brand.colors.length > 5 || !brand.colors.every(c => /^#[0-9a-f]{6}$/i.test(c))) throw Error('ブランドカラーは3〜5色のカラーコードで指定してください。');
    if (!['sans', 'serif', 'bold'].includes(brand.font) || !['natural', 'elegant', 'simple'].includes(brand.template)) throw Error('フォント・テンプレートの指定が違います。');
    return copy(brand);
  }
  function validateStyle(style, ns) {
    if (!style || typeof style !== 'object' || Array.isArray(style)) throw Error('デザイン設定の形式が違います。');
    if (style.font !== undefined && !['sans', 'serif', 'bold'].includes(style.font)) throw Error('フォント設定を確認してください。');
    for (const key of ns === 'feed' ? ['bg', 'fg', 'accent'] : ['bg', 'color', 'band']) if (style[key] !== undefined && !/^#[a-f0-9]{6}$/i.test(style[key])) throw Error('色の形式を確認してください。');
    const limits = ns === 'feed' ? {size: [22, 100]} : {size: [36, 100], y: [18, 76]};
    for (const [key, [min, max]] of Object.entries(limits)) if (style[key] !== undefined && (!Number.isFinite(style[key]) || style[key] < min || style[key] > max)) throw Error('文字サイズ・位置の範囲を確認してください。');
    if (ns === 'reel' && style.align !== undefined && !['left', 'center', 'right'].includes(style.align)) throw Error('文字揃えの指定が違います。');
    if (ns === 'reel' && style.animation !== undefined && !['fade', 'zoom', 'none'].includes(style.animation)) throw Error('アニメーションの指定が違います。');
  }
  function validateData(record, ns) {
    if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 180) throw Error('投稿IDを確認してください。');
    const model = ns === 'feed' ? record.state : record.value;
    if (ns === 'reel' && record.id.startsWith('template-')) { if (!record.style || typeof record.name !== 'string') throw Error('テンプレートの形式が違います。'); validateStyle(record.style, 'reel'); return; }
    if (model) validateStyle(ns === 'feed' ? model : (model.style || {}), ns);
    const scenes = ns === 'feed' ? model?.slides : model?.scenes;
    if (!Array.isArray(scenes) || scenes.length !== (ns === 'feed' ? 7 : 5)) throw Error('投稿のページ数・シーン数が違います。');
    const image = data => { if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw Error('画像は埋め込み形式のみ取り込めます。'); };
    scenes.forEach(s => {
      if (!s || (ns === 'feed' ? typeof s.title !== 'string' || typeof s.body !== 'string' : typeof s.caption !== 'string' || typeof s.narration !== 'string' || !Number.isFinite(s.seconds) || s.seconds < .5 || s.seconds > 60)) throw Error('文章・秒数の形式が違います。');
      if(ns==='feed'&&s.photo)for(const k of ['placement','placementReset'])if(s.photo[k]!==undefined&&!TsumuguPhotoLayout.valid(s.photo[k]))throw Error('写真配置の形式・範囲を確認してください。');
      if(ns==='feed'&&s.headingLayer!==undefined&&!TsumuguHeading.valid(s.headingLayer))throw Error('見出し設定の形式・範囲を確認してください。');
      const framing=ns==='feed'?s.photo?.framing:s.framing;
      if(framing){for(const [k,min,max] of [['zoom',1,3],['x',0,100],['y',0,100]])if(framing[k]!==undefined&&(!Number.isFinite(framing[k])||framing[k]<min||framing[k]>max))throw Error('切り抜き設定の範囲を確認してください。');if(framing.aspect!==undefined&&!['original','4:5','9:16','1:1'].includes(framing.aspect))throw Error('写真の比率を確認してください。');}
      if(s.imageStyle!==undefined&&!Object.hasOwn(TsumuguImageTools.styles,s.imageStyle))throw Error('写真スタイルを確認してください。');
      if (ns === 'feed' && s.photo) image(s.photo.data); if (ns === 'reel' && s.image) image(s.image);
    });
    if (ns === 'reel') {
      if (scenes[0].seconds > 3) throw Error('冒頭のシーンは3秒以内にしてください。');
      for (const key of ['narration', 'bgm']) if (model[key] && (typeof model[key].data !== 'string' || !/^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(model[key].data))) throw Error('音声は埋め込み形式のみ取り込めます。');
    }
  }
  function validateBackup(value) {
    const walk = (v, depth = 0) => { if (depth > 35) throw Error('バックアップが複雑すぎます。'); if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (['__proto__', 'prototype', 'constructor'].includes(k)) throw Error('安全に取り込めないキーを含んでいます。'); walk(v[k], depth + 1); } };
    walk(value);
    if (value?.format !== 'tsumugu-local-backup' || value.version !== 1 || !Array.isArray(value.accounts) || !value.accounts.length || value.accounts.length > 100) throw Error('つむぐのバックアップ形式（バージョン1）ではありません。');
    const ids = new Set();
    value.accounts.forEach(group => {
      const b = validateBrand(group.brand); if (typeof b.id !== 'string' || !b.id || ids.has(b.id)) throw Error('アカウントIDが重複・欠落しています。'); ids.add(b.id);
      if (!Array.isArray(group.records)) throw Error('投稿一覧を確認できません。');
      const keys = new Set(); group.records.forEach(r => { if (!['feed', 'reel'].includes(r.namespace) || r.accountId !== b.id || r.id !== r.record?.id) throw Error('アカウントIDと投稿の所属が一致しません。'); const key = r.namespace + ':' + r.id; if (keys.has(key)) throw Error('投稿IDが重複しています。'); keys.add(key); validateData(r.record, r.namespace); if (editors.has(r.namespace)) editors.get(r.namespace).validate(r.record); });
    });
    return value;
  }
  function lockUI(value) { for (const id of ['feedWorkspace', 'reelWorkspace', 'wManager']) q(id).inert = value; q('wAccount').disabled = value || editors.size !== 2; q('wManage').disabled = value; }
  async function flushEditors() { const results = await Promise.all([...editors.values()].map(e => e.flush())); return results.every(v => v !== false); }
  function requireIdle() { if (switching || [...editors.values()].some(e => e.busy()) || document.querySelector('dialog[open]')) throw Error('画像・音声の読み込み、書き出し、確認画面が終わってから操作してください。'); }
  async function prepareAccount(id, brand) { const result = []; for (const [ns, e] of editors) result.push([ns, await e.prepare(id, brand)]); return result; }
  function activate(prepared) { prepared.forEach(([ns, data]) => editors.get(ns).activate(data)); renderHeader(); }
  async function switchAccount(id) {
    if (id === currentId) return;
    try {
      requireIdle(); switching = true; lockUI(true);
      if (!await flushEditors()) throw Error('現在の投稿を保存できないため切替を中止しました。エクスポートで編集内容を退避してください。');
      const brand = brands.find(b => b.id === id); if (!brand) throw Error('アカウントが見つかりません。');
      const prepared = await prepareAccount(id, brand);
      await transaction(['meta'], 'readwrite', tx => tx.objectStore('meta').put({id: 'active', value: id}));
      currentId = id; activate(prepared); await renderPosts(); message('制作アカウントを切り替えました。'); return true;
    } catch (error) { message(error.message, true); q('wAccount').value = currentId; return false; }
    finally { switching = false; lockUI(false); }
  }
  function renderHeader() {
    const b = brands.find(b => b.id === currentId); q('wAccount').replaceChildren();
    brands.forEach(brand => { const option = document.createElement('option'); option.value = brand.id; option.textContent = `${brand.icon} ${brand.name} ｜ ${brand.genre}`; q('wAccount').append(option); }); q('wAccount').value = currentId;
    q('wIcon').textContent = b.icon; q('wBrandName').textContent = b.name; q('wGenre').textContent = b.genre; q('wTarget').textContent = b.target;
    q('wSwatches').replaceChildren(); b.colors.forEach(c => { const el = document.createElement('i'); el.style.background = c; el.title = c; q('wSwatches').append(el); });
    for (const [id, parent] of [['wFeedGuide', 'content'], ['wReelGuide', 'r-script']]) {
      let guide = q(id); if (!guide) { guide = document.createElement('div'); guide.id = id; guide.className = 'brand-guide'; q(parent).prepend(guide); }
      guide.textContent = `制作ガイド（自動校正は行いません）\n世界観：${b.worldview}\n文章：${b.tone}\n禁止表現：${b.prohibited}\n目的：${b.purpose}\nCTA：${b.cta}`;
    }
    fillBrand(b); q('wPostHeading').textContent = b.name + ' の制作データ';
  }
  function fillBrand(b) {
    const fields = {wName: 'name', wBrandIcon: 'icon', wBrandGenre: 'genre', wBrandTarget: 'target', wWorldview: 'worldview', wTone: 'tone', wProhibited: 'prohibited', wPurpose: 'purpose', wCta: 'cta', wFont: 'font', wTemplate: 'template'};
    Object.entries(fields).forEach(([id, key]) => q(id).value = b[key]); q('wColors').value = b.colors.join('\n');
  }
  function readBrand() { const b = {...brands.find(x => x.id === currentId)}; const fields = {wName: 'name', wBrandIcon: 'icon', wBrandGenre: 'genre', wBrandTarget: 'target', wWorldview: 'worldview', wTone: 'tone', wProhibited: 'prohibited', wPurpose: 'purpose', wCta: 'cta', wFont: 'font', wTemplate: 'template'}; Object.entries(fields).forEach(([id, key]) => b[key] = q(id).value.trim()); b.colors = q('wColors').value.split(/[\s,]+/).filter(Boolean); return validateBrand(b); }
  async function renderPosts() {
    const id = currentId, list = q('wPosts'); list.textContent = '読み込み中…';
    const rows = await transaction(['records'], 'readonly', tx => tx.objectStore('records').getAll(range(id)));
    if (id !== currentId) return; list.replaceChildren();
    const posts = rows.filter(r => !(r.namespace === 'reel' && r.id.startsWith('template-'))).sort((a, b) => (b.record.updated || 0) - (a.record.updated || 0));
    if (!posts.length) { list.textContent = 'まだ保存した投稿はありません。編集をはじめるか、名前を付けて保存してください。'; return; }
    for (const r of posts) {
      const row = document.createElement('article'); row.className = 'w-post'; const title = document.createElement('b'), detail = document.createElement('span'), open = document.createElement('button');
      title.textContent = r.record.name || (r.id === 'autosave' || r.id === 'current' ? '編集中の投稿（自動保存）' : '保存した投稿'); detail.textContent = r.namespace === 'feed' ? 'フィード・7枚' : 'リール・5シーン'; open.textContent = '開いて再編集';
      open.onclick = async () => { if (currentId !== id) return; try { requireIdle(); if (!await confirmAction('現在の編集内容をこの投稿に切り替えます。残したい投稿は先に名前を付けて保存してください。')) return; switching = true; lockUI(true); if (!await flushEditors()) throw Error('現在の投稿を保存できません。切替を中止しました。'); await editors.get(r.namespace).open(r.record); q(r.namespace === 'feed' ? 'feedMode' : 'reelMode').click(); q('wManager').hidden = true; q('wManage').setAttribute('aria-expanded', false); } catch (e) { message(e.message, true); } finally { switching = false; lockUI(false); } };
      row.append(title, detail, open); list.append(row);
    }
  }
  async function exportBackup() {
    try {
      requireIdle(); switching = true; lockUI(true); const saved = await flushEditors(), id = currentId;
      const selected = q('wBackupScope').value === 'all' ? brands : brands.filter(b => b.id === id), groups = [];
      for (const b of selected) {
        const records = await transaction(['records'], 'readonly', tx => tx.objectStore('records').getAll(range(b.id)));
        if (b.id === id) for (const [ns, e] of editors) { const record = e.snapshot(); const row = {accountId: id, namespace: ns, id: record.id, record}; const at = records.findIndex(r => r.namespace === ns && r.id === record.id); if (at >= 0) records[at] = row; else records.push(row); }
        groups.push({brand: copy(b), records});
      }
      const value = {format: 'tsumugu-local-backup', version: 1, exportedAt: new Date().toISOString(), includesUnsavedChanges: !saved, accounts: groups};
      const blob = new Blob([JSON.stringify(value)], {type: 'application/json'}); if (blob.size > 100 * 1024 ** 2) throw Error('バックアップが100MBを超えます。対象アカウントを絞ってください。');
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'tsumugu-accounts-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      message(saved ? 'バックアップをダウンロードしました。ファイルは暗号化されていません。' : 'ブラウザ保存は失敗していますが、現在の編集内容もバックアップに含めました。', !saved);
    } catch (e) { message(e.message, true); } finally { switching = false; lockUI(false); }
  }
  async function importBackup(file) {
    if (!file) return;
    try {
      requireIdle(); if (file.size > 100 * 1024 ** 2) throw Error('100MB以下のバックアップを選んでください。');
      switching = true; lockUI(true); const value = validateBackup(JSON.parse(await file.text()));
      // Validate the complete file before any write. Imports always use new IDs; no account is overwritten.
      const groups = value.accounts.map(g => { const id = uid(); return {brand: {...validateBrand(g.brand), id, name: (g.brand.name.slice(0, 54) + '（取込）')}, records: g.records.map(r => ({...copy(r), accountId: id}))}; });
      await transaction(['brands', 'records'], 'readwrite', tx => { groups.forEach(g => { tx.objectStore('brands').put(g.brand); g.records.forEach(r => tx.objectStore('records').put(r)); }); });
      brands.push(...groups.map(g => g.brand)); renderHeader(); await renderPosts(); message(`${groups.length}件を新しいアカウントとして取り込みました。既存データは上書きしていません。`);
    } catch (e) { message('インポートできませんでした。' + (e instanceof SyntaxError ? 'JSON形式を確認してください。' : e.message), true); }
    finally { q('wImportFile').value = ''; switching = false; lockUI(false); }
  }
  function bind() {
    q('wAccount').onchange = e => switchAccount(e.target.value);
    q('wManage').onclick = async () => { q('wManager').hidden = !q('wManager').hidden; q('wManage').setAttribute('aria-expanded', !q('wManager').hidden); if (!q('wManager').hidden) { renderHeader(); try { await renderPosts(); } catch (e) { message(e.message, true); } } };
    q('wSaveBrand').onclick = async () => { try { requireIdle(); const brand = readBrand(); await transaction(['brands'], 'readwrite', tx => tx.objectStore('brands').put(brand)); brands = brands.map(b => b.id === brand.id ? brand : b); renderHeader(); message('ブランド設定を保存しました。編集中の投稿は変更していません。新規投稿に適用します。'); } catch (e) { message('ブランドを保存できません。' + e.message, true); } };
    q('wAdd').onclick = async () => { try { requireIdle(); const brand = {...readBrand(), id: uid(), name: '新しいアカウント', icon: '✦', genre: '未設定', target: '', worldview: '', tone: '', prohibited: '', purpose: '', cta: ''}; await transaction(['brands'], 'readwrite', tx => tx.objectStore('brands').put(brand)); brands.push(brand); if (!await switchAccount(brand.id)) { renderHeader(); return; } q('wManager').hidden = false; q('wManage').setAttribute('aria-expanded', true); q('wName').focus(); message('新しいアカウントを追加しました。ブランド設定を編集して保存してください。'); } catch (e) { message(e.message, true); } };
    q('wDelete').onclick = async () => {
      try { requireIdle(); if (brands.length <= 1) throw Error('最後のアカウントは削除できません。'); const id = currentId, b = brands.find(x => x.id === id); if (!await confirmAction(`「${b.name}」と所属する投稿・写真・音声・テンプレートを削除します。元に戻せません。必要なデータは先にエクスポートしてください。移行元の旧保存データとダウンロード済みバックアップは残ります。`, 'アカウントを削除')) return;
        switching = true; lockUI(true); if (!await flushEditors()) throw Error('保存に失敗しているため削除を中止しました。先にエクスポートしてください。');
        const next = brands.find(x => x.id !== id), prepared = await prepareAccount(next.id, next);
        await transaction(['brands', 'records', 'meta'], 'readwrite', tx => { tx.objectStore('brands').delete(id); const keys = tx.objectStore('records').getAllKeys(range(id)); keys.onsuccess = () => keys.result.forEach(k => tx.objectStore('records').delete(k)); tx.objectStore('meta').put({id: 'active', value: next.id}); });
        for (const ns of ['feed', 'reel']) { try { localStorage.removeItem(recoveryKey(ns, id)); } catch {} }
        brands = brands.filter(x => x.id !== id); currentId = next.id; activate(prepared); await renderPosts(); message('現在の保存領域から削除しました。移行元の旧データと外部のバックアップは残ります。');
      } catch (e) { message(e.message, true); } finally { switching = false; lockUI(false); }
    };
    q('wExport').onclick = exportBackup; q('wImportFile').onchange = e => importBackup(e.target.files[0]); q('wRefreshPosts').onclick = () => renderPosts().catch(e => message(e.message, true));
  }
  async function init() {
    lockUI(true);
    if (navigator.locks) await new Promise((resolve, reject) => { navigator.locks.request('tsumugu-workspace-editor', {ifAvailable: true}, async lock => { if (!lock) { reject(Error('別のタブでつむぐを開いています。そのタブを閉じて再読み込みしてください。')); return; } resolve(); await new Promise(r => lockRelease = r); }).catch(reject); });
    db = await new Promise((resolve, reject) => { const r = indexedDB.open('tsumugu-workspaces', 1); r.onupgradeneeded = () => { r.result.createObjectStore('brands', {keyPath: 'id'}); r.result.createObjectStore('records', {keyPath: ['accountId', 'namespace', 'id']}); r.result.createObjectStore('meta', {keyPath: 'id'}); }; r.onsuccess = () => resolve(r.result); r.onerror = r.onblocked = () => reject(Error('保存先を開けません。保存設定・空き容量を確認してください。')); });
    await migrate(); brands = await transaction(['brands'], 'readonly', tx => tx.objectStore('brands').getAll());
    if (!brands.length) throw Error('ブランド設定を読み込めません。原データは変更していません。');
    const active = await transaction(['meta'], 'readonly', tx => tx.objectStore('meta').get('active')); currentId = brands.some(b => b.id === active?.value) ? active.value : brands[0].id;
    loaded = true; bind(); renderHeader(); message('このブラウザだけに保存します。旧データがある場合は美容アカウントへ引き継いでいます。');
  }
  const ready = init().catch(error => { message(error.message + ' 保存成功とは扱いません。元の保存データは削除していません。', true); q('wFatal').hidden = false; q('wFatal').textContent = error.message; throw error; });
  // Both editors await the same initialization; UI unlocks only after both register.
  const api = {ready, store, recovery, recover, clearRecovery, fail(error) { message('保存データの読み込みを中止しました。' + error.message, true); q('wFatal').hidden = false; q('wFatal').textContent = error.message + ' 元のデータは削除していません。設定を確認し、再読み込みしてください。'; lockUI(true); }, get currentId() { return currentId; }, get brand() { return copy(brands.find(b => b.id === currentId)); }, register(ns, editor) { editors.set(ns, editor); if (editors.size === 2) { lockUI(false); renderPosts().catch(e => message(e.message, true)); } }, validateBrand, validateBackup, get busy() { return switching; }, async refreshPosts() { if (!q('wManager').hidden) await renderPosts(); }};
  window.AccountWorkspace = api;
})();
