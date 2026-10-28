const assert=require('node:assert/strict'),V=require('../video-model');
const head=Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109]);
const a={id:'asset-test',version:1,kind:'asset',name:'test.mp4',mime:'video/mp4',bytes:12,duration:16,width:180,height:320,thumbnail:'data:image/jpeg;base64,YQ==',data:'data:video/mp4;base64,'+head.toString('base64')};
const c={id:'cut-a',assetId:a.id,start:2,end:10,crop:{fit:'cover',x:50,y:50,zoom:1},captions:[]},p=V.empty();p.cuts=[c,{...structuredClone(c),id:'cut-b',start:8,end:16}];const r={id:'current',version:1,kind:'project',project:p};
assert.equal(V.total(p),16);assert.equal(V.locate(p,7).index,0);assert.equal(V.locate(p,8).index,1);assert.equal(V.locate(p,16).source,16);V.validateBundle([a,r]);assert.equal(V.decode(a).blob.size,12);
for(const patch of [{start:10,end:2},{assetId:'asset-missing'},{end:17},{crop:{...c.crop,x:101}},{captions:[{}]}])assert.throws(()=>V.validateBundle([a,{...r,project:{...p,cuts:[{...c,...patch}]}}]));
assert.throws(()=>V.validateBundle([r]));assert.throws(()=>V.validateRecord({...a,data:'https://example.invalid/a.mp4'}));assert.throws(()=>V.validateRecord({...a,bytes:13}));assert.throws(()=>V.validateRecord({...a,bytes:V.FILE_LIMIT+1}));assert.throws(()=>V.validateProject({...p,cuts:Array.from({length:61},(_,i)=>({...c,id:'c'+i}))}));
for(const fit of ['cover','contain']){const b=V.crop(1920,1080,{fit,x:30,y:70,zoom:1.5});assert(Math.abs(b.width/b.height-1920/1080)<1e-9);}
assert.equal(V.empty().cuts.length,0);assert.equal(V.locate(V.empty(),0),null);
console.log('PASS: variable cuts, timeline boundaries, trim/reference/size/schema validation, embedded video restore, aspect crop');
