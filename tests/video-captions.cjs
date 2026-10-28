const assert=require('node:assert/strict'),C=require('../video-captions'),V=require('../video-model');
const c={id:'caption-a',version:1,type:'caption',text:'日本語の商品紹介',start:1.5,end:4.5,style:{...C.defaults}};
assert(C.valid(c));assert(C.active(c,1.5));assert(!C.active(c,4.5));assert(!C.active(c,1.49));C.validate([c]);
for(const patch of [{text:'a'.repeat(201)},{start:5},{end:601},{style:{...c.style,color:'url(x)'}},{style:{...c.style,strokeWidth:13}}])assert(!C.valid({...c,...patch}));assert.throws(()=>C.validate([c,c]));assert.throws(()=>C.validate(Array(51).fill(c)));
for(const corner of ['nw','ne','sw','se']){const r=C.resize(c.style,corner,corner.includes('w')?-100:100,corner.includes('n')?-60:60);assert(C.validStyle(r));assert(Math.abs(r.width/r.height-c.style.width/c.style.height)<1e-8);assert(Math.abs(r.size/c.style.size-r.width/c.style.width)<1e-8);}
for(const corner of ['w','e']){const r=C.resize(c.style,corner,80,90);assert.equal(r.size,c.style.size);assert.equal(r.height,c.style.height);}
// Edge drags preserve all typography and the opposite edge, including limits.
for(const edge of ['w','e','n','s'])for(const delta of [-5000,-80,80,5000]){
 const a={...C.defaults,x:100,y:600,spacing:2},r=C.resize(a,edge,delta,delta);
 assert(C.validStyle(r));for(const k of ['size','spacing','lineHeight','font','weight','color','backgroundOpacity'])assert.equal(r[k],a[k]);
 if(edge==='n'||edge==='s'){assert.equal(r.width,a.width);assert.equal(r.x,a.x);if(edge==='n')assert.equal(r.y+r.height,a.y+a.height);else assert.equal(r.y,a.y);}
 else{assert.equal(r.height,a.height);assert.equal(r.y,a.y);if(edge==='w')assert.equal(r.x+r.width,a.x+a.width);else assert.equal(r.x,a.x);}
}
assert(C.bound({...c.style,y:2500}).y>1350); // Video bounds must not reuse the feed's 1350px height.
const p=V.empty();p.cuts=[{id:'cut',assetId:'asset',start:0,end:3,crop:{fit:'cover',x:50,y:50,zoom:1},captions:[]}];p.captions=[c];V.validateProject(p);assert.equal(p.captions[0].end,4.5); // Out-of-video times retained, not silently clamped.
const old=V.empty();V.validateProject(old);assert.deepEqual(old.captions,[]);
console.log('PASS: caption identities/styles/timing, half-open intervals, 1920px geometry, proportional/width/height resizing, old empty schema and out-of-video retention');
