/* Offline variable-cut projects. No network, decoding, DOM or persistence side effects. */
(function(root){
'use strict';
const FILE_LIMIT=25*1024**2,ACCOUNT_LIMIT=50*1024**2,MAX_ASSETS=30,MAX_CUTS=60;
const number=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
const identifier=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
function check(ok,message){if(!ok)throw Error(message);}
function empty(){return {version:1,name:'商品紹介リール',width:1080,height:1920,cuts:[],audio:{version:1,mode:'source'},captions:[]};}
function validateProject(p){
 check(p&&p.version===1&&p.width===1080&&p.height===1920&&typeof p.name==='string'&&p.name.length<=60,'動画プロジェクトの形式を確認してください。');
 check(Array.isArray(p.cuts)&&p.cuts.length<=MAX_CUTS,'カットは60個までです。');const ids=new Set();
 for(const c of p.cuts){check(c&&typeof c==='object'&&identifier(c.id)&&identifier(c.assetId)&&!ids.has(c.id),'カットID・素材IDを確認してください。');ids.add(c.id);check(number(c.start,0,300)&&number(c.end,.1,300)&&c.end-c.start>=.099999,'開始・終了は0.1秒以上の範囲で指定してください。');check(c.crop&&['cover','contain'].includes(c.crop.fit)&&number(c.crop.x,0,100)&&number(c.crop.y,0,100)&&number(c.crop.zoom,1,3),'動画のトリミング設定が不正です。');check(Array.isArray(c.captions)&&c.captions.length===0,'テロップは次段階の機能です。');}
 check(p.cuts.reduce((s,c)=>s+c.end-c.start,0)<=600.001,'編集全体は10分以内にしてください。');
 check(Array.isArray(p.captions)&&p.captions.length===0&&p.audio?.version===1&&p.audio.mode==='source','音声編集・テロップは次段階の機能です。');return p;
}
function validateRecord(r){
 check(r&&identifier(r.id)&&r.version===1,'動画レコードの形式が不正です。');
 if(r.kind==='project'){validateProject(r.project);check(r.id==='current'||r.id.startsWith('draft-'),'動画プロジェクトIDが不正です。');return r;}
 check(r.kind==='asset'&&r.id.startsWith('asset-')&&typeof r.name==='string'&&r.name.length<=120&&['video/mp4','video/quicktime'].includes(r.mime),'動画素材の形式が不正です。');
 check(number(r.bytes,12,FILE_LIMIT)&&number(r.duration,.1,300)&&number(r.width,1,4096)&&number(r.height,1,4096),'動画は25MiB・5分・各辺4096px以下です。');
 check(typeof r.thumbnail==='string'&&r.thumbnail.length<=200000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(r.thumbnail),'動画サムネイルの形式が不正です。');
 if(r.blob instanceof Blob)check(r.blob.size===r.bytes&&r.blob.type===r.mime,'動画素材のサイズが一致しません。');
 else {check(typeof r.data==='string'&&r.data.startsWith('data:'+r.mime+';base64,')&&/^data:video\/(mp4|quicktime);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.data),'動画は埋め込み形式のみ復元できます。');const b64=r.data.split(',')[1],size=b64.length*3/4-(b64.endsWith('==')?2:b64.endsWith('=')?1:0);check(Number.isInteger(size)&&size===r.bytes,'動画データのサイズが一致しません。');check(atob(b64.slice(0,16)).slice(4,8)==='ftyp','MP4/MOVの動画データを確認してください。');}
 return r;
}
function validateBundle(records){check(records.filter(r=>r.kind==='project').length<=101,'名前付き動画下書きは100件までです。');const assets=new Map();for(const r of records){validateRecord(r);if(r.kind==='asset')assets.set(r.id,r);}check(assets.size<=MAX_ASSETS&&[...assets.values()].reduce((s,a)=>s+a.bytes,0)<=ACCOUNT_LIMIT,'動画素材は1アカウント30個・合計50MiBまでです。');for(const r of records)if(r.kind==='project')for(const c of r.project.cuts){const a=assets.get(c.assetId);check(a&&c.end<=a.duration+.001,'カットの素材が見つからないか、終了位置が動画を超えています。');}return records;}
function total(p){return p.cuts.reduce((s,c)=>s+c.end-c.start,0);}
function locate(p,time){let offset=0;for(let i=0;i<p.cuts.length;i++){const c=p.cuts[i],duration=c.end-c.start;if(time<offset+duration||i===p.cuts.length-1)return {index:i,offset,local:Math.max(0,Math.min(duration,time-offset)),source:c.start+Math.max(0,Math.min(duration,time-offset))};offset+=duration;}return null;}
function crop(width,height,c){const scale=(c.fit==='cover'?Math.max(1080/width,1920/height):Math.min(1080/width,1920/height))*c.zoom,w=width*scale,h=height*scale;return {width:w,height:h,x:(1080-w)*c.x/100,y:(1920-h)*c.y/100};}
async function encode(r){validateRecord(r);if(r.kind!=='asset'||!r.blob)return structuredClone(r);const data=await new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(Error('動画のバックアップを作成できません。'));f.readAsDataURL(r.blob);});const next={...r,data};delete next.blob;return next;}
function decode(r){validateRecord(r);if(r.kind!=='asset'||r.blob)return structuredClone(r);const bytes=Uint8Array.from(atob(r.data.split(',')[1]),v=>v.charCodeAt(0)),next={...r,blob:new Blob([bytes],{type:r.mime})};delete next.data;return next;}
const api={FILE_LIMIT,ACCOUNT_LIMIT,MAX_ASSETS,MAX_CUTS,empty,validateProject,validateRecord,validateBundle,total,locate,crop,encode,decode};if(typeof module==='object'&&module.exports)module.exports=api;else root.TsumuguVideo=api;
})(globalThis);
