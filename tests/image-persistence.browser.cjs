/* npm install --no-save playwright, then node tests/image-persistence.browser.cjs.
   Uses a temporary browser profile and locally intercepted Pages assets; no public writes. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const base='https://masumisuma21-ux.github.io/instagram-post-practice/';
const assets=new Set(['index.html','video-captions.js','video-timeline.js','video-model.js','video-editor.js','video-editor.css','feed-heading-editor.js','feed-heading-editor.css','feed-photo-editor.js','feed-photo-editor.css','image-tools.js','accounts.js','app.js','reels.js','reel-script-templates.js','style.css','accounts.css','reels.css','sans.woff','serif.woff']);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
  try {
   const requests=[],unexpected=[],errors=[];
   await context.route('**/*',async route=>{const r=route.request(),url=r.url();requests.push({url,method:r.method()});const relative=url.startsWith(base)?new URL(url).pathname.slice('/instagram-post-practice/'.length)||'index.html':'';if(!assets.has(relative)||r.method()!=='GET'){unexpected.push(url);return route.abort()}await route.fulfill({path:path.join(root,relative)})});
   const p=await context.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));
   const ready=async()=>{await p.waitForFunction(()=>!document.querySelector('#wAccount').disabled);await p.evaluate(()=>fontsReady)};
   const input=async(id,value)=>p.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))},String(value));
   const confirm=()=>p.locator('#acceptAction').click();
   const flush=async()=>{await p.evaluate(()=>flush());await p.locator('#rSaveProject').evaluate(e=>e.click());await p.waitForFunction(()=>document.querySelector('#rSaveStatus').textContent.includes('保存済み'))};
   const state=()=>p.evaluate(async()=>({feed:(await AccountWorkspace.store('feed','get','autosave')).state,reel:(await AccountWorkspace.store('reel','get','current')).value}));
   const switchTo=async id=>{await p.selectOption('#wAccount',id);await p.waitForFunction(id=>AccountWorkspace.currentId===id&&!document.querySelector('#wAccount').disabled,id)};
   const download=async id=>{const wait=p.waitForEvent('download');await p.locator('#'+id).click();const d=await wait;const stream=await d.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);return {data:Buffer.concat(chunks),name:d.suggestedFilename()}};
   await p.goto(base);await ready();
   const image=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#c86d45';x.fillRect(0,0,300,400);x.fillStyle='#526e49';x.fillRect(300,0,300,400);return c.toDataURL()});
   const file={name:'fixture.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')};
   await p.locator('[data-tab="photo"]').click();
   for(let i=0;i<7;i++){
    await p.locator('#thumbs button').nth(i).click();await p.selectOption('#fImageStyle',['real','beauty','product','life'][i%4]);await p.locator('#fImagePrompt').fill('保存検証ページ'+i);await p.locator('#photoFile').setInputFiles(file);await p.waitForFunction(i=>state.slides[i].photo?.name==='fixture.png',i);await p.selectOption('#fCropAspect',i%2?'9:16':'4:5');await input('fCropZoom',1.25+i*.15);await input('fCropX',10+i*10);await input('fCropY',85-i*10);await input('photoWidth',300);await input('photoX',25+i*5);await input('photoY',30+i*5);
   }
   await p.locator('[data-tab="drafts"]').click();await p.locator('#draftName').fill('保持テスト・フィード');await p.locator('#saveDraft').click();await p.locator('.draft-card').filter({hasText:'保持テスト・フィード'}).waitFor();
   await p.locator('#reelMode').click();await p.locator('[data-r-tab="media"]').click();
   for(let i=0;i<5;i++){
    await p.locator('#rTimeline button').nth(i).click();await p.selectOption('#rImageStyle',['life','product','beauty','real'][i%4]);await p.locator('#rPrompt').fill('保存検証シーン'+i);await p.locator('#rImage').setInputFiles(file);await p.waitForFunction(()=>document.querySelector('#rImageName').textContent==='fixture.png');await input('rCropZoom',1.2+i*.2);await input('rCropX',15+i*15);await input('rCropY',80-i*15);
   }
   await p.locator('[data-r-tab="script"]').click();await p.locator('#rDraftName').fill('保持テスト・リール');await p.locator('#rSaveNamed').click();await p.locator('.w-reel-draft').filter({hasText:'保持テスト・リール'}).waitFor();await flush();const expected=await state();
   await p.reload();await ready();assert.deepEqual(await state(),expected,'all settings survive autosave/reload');
   // Change active records, then reopen named drafts through the existing UI.
   await p.locator('#feedMode').click();await p.locator('[data-tab="photo"]').click();await p.locator('#fImagePrompt').fill('上書き前の別編集');await input('fCropZoom',3);await p.locator('[data-tab="drafts"]').click();await p.locator('.draft-card').filter({hasText:'保持テスト・フィード'}).locator('button').first().click();await confirm();await p.waitForFunction(()=>state.slides[0].imagePrompt==='保存検証ページ0');
   await p.locator('#reelMode').click();await p.locator('[data-r-tab="media"]').click();await p.locator('#rPrompt').fill('別の編集');await input('rCropZoom',3);await p.locator('[data-r-tab="script"]').click();await p.locator('.w-reel-draft').filter({hasText:'保持テスト・リール'}).locator('button').first().click();await confirm();await p.waitForFunction(()=>document.querySelector('#rPrompt').value==='保存検証シーン0');await flush();assert.deepEqual(await state(),expected,'named drafts restore exact settings');
   // Both accounts keep independent records while their automatic saves flush.
   await switchTo('brand-restaurant');await p.locator('#feedMode').click();await p.locator('#body0').fill('B専用本文');await flush();const restaurant=await state();await switchTo('brand-maru');await flush();assert.deepEqual(await state(),expected);
   await p.locator('#wManage').click();const backup=JSON.parse((await download('wExport')).data);assert.equal(backup.accounts.length,1);assert(!JSON.stringify(backup).includes('B専用本文'));
   await p.locator('#wImportFile').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.waitForFunction(()=>document.querySelector('#wStatus').textContent.includes('取り込みました'));const imported=await p.locator('#wAccount option').evaluateAll(es=>es.find(e=>e.textContent.includes('（取込）')).value);await switchTo(imported);await flush();assert.deepEqual(await state(),expected,'backup restores all 7 pages and 5 scenes');
   // Reopen imported named records through the unified post list as well.
   await p.locator('#wRefreshPosts').click();for(const name of ['保持テスト・フィード','保持テスト・リール']){if(!await p.locator('#wManager').isVisible())await p.locator('#wManage').click();await p.locator('.w-post').filter({hasText:name}).locator('button').click();await confirm();await flush();}assert.deepEqual(await state(),expected);
   await switchTo('brand-restaurant');await flush();assert.deepEqual(await state(),restaurant,'import/reedit leaves B unchanged');await switchTo(imported);await p.reload();await ready();assert.deepEqual(await state(),expected);
   if(await p.locator('#wManager').isVisible())await p.locator('#wManage').click();await p.locator('#feedMode').click();await p.locator('#thumbs button').first().click();const png=await download('individual'),jpg=await download('feedJpeg');assert(png.data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.equal(png.data.readUInt32BE(16),1080);assert.equal(png.data.readUInt32BE(20),1350);assert(jpg.data[0]===255&&jpg.data[1]===216);
   await p.locator('#reelMode').click();const reel=await download('rPng');assert.equal(reel.data.readUInt32BE(20),1920);await download('rJpeg');await p.locator('#rPlay').click();await p.waitForFunction(()=>Number(document.querySelector('#rSeek').value)>.1);await p.locator('#rStop').click();assert(await p.locator('#rMp4').isDisabled());assert((await p.locator('#rServerStatus').textContent()).includes('GitHub Pages'));assert(!await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert(requests.every(r=>r.method==='GET'&&!r.url.includes('/api/')));
   console.log(`PASS ${width}px: simulated HTTPS Pages; all 7/5 settings, named drafts, account isolation, JSON import, unified reedit, reload, PNG/JPEG, preview playback, no API/POST/third-party requests`);
  }finally{await context.close()}
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
