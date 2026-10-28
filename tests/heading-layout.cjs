const assert=require('node:assert/strict'),T=require('../feed-heading-editor');
const s=T.create({x:100,y:200,width:500,height:300});assert(T.valid(s));
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const corner of ['nw','ne','sw','se'])for(const direction of [-1,1]){const r=T.resize(s,corner,(corner.includes('w')?-80:80)*direction,(corner.includes('n')?-60:60)*direction);assert(T.valid(r));near(r.width/r.height,s.width/s.height);near(r.size/s.size,r.width/s.width);near(corner.includes('w')?r.x+r.width:r.x,corner.includes('w')?s.x+s.width:s.x);near(corner.includes('n')?r.y+r.height:r.y,corner.includes('n')?s.y+s.height:s.y);assert(direction>0?r.size>s.size:r.size<s.size);}
for(const corner of ['w','e']){const r=T.resize(s,corner,80,300);assert(T.valid(r));assert.equal(r.size,s.size);assert.equal(r.height,s.height);assert.equal(r.y,s.y);near(corner==='w'?r.x+r.width:r.x,corner==='w'?s.x+s.width:s.x);}
for(const spacing of [-2,0,30])for(const delta of [-1e6,1e6]){const a={...s,spacing},r=T.resize(a,'se',delta,delta);assert(T.valid(r));near(r.width/r.height,s.width/s.height);near(r.size/s.size,r.width/s.width);near(r.spacing,spacing*r.width/s.width);}
for(let i=1;i<=200;i++){const a=T.create({...s,width:40+i*9.7,height:40+i*8.7,size:16+i*.813,spacing:i%2?-1.234:23.456});for(const d of [-1e7,1e7])assert(T.valid(T.resize(a,'nw',d,d)));}
const tracked=T.resize({...s,spacing:3},'se',100,60);near(tracked.spacing/3,tracked.size/s.size);assert.deepEqual(T.resize(s,'se',0,0),s);
for(const [key,v]of [['size',200],['width',0],['color','url(x)'],['opacity',Infinity],['stack','html'],['lineHeight',0],['weight',42]])assert(!T.valid({...s,[key]:v}));
const ctx={font:'',measureText:t=>({width:[...t].length*20})};const a=T.layout(ctx,'日本語の見出し\n次の行',s);assert(a.glyphs.length>5);assert(!a.overflow);assert(T.layout(ctx,'あ'.repeat(70),{...s,width:40,height:40}).overflow);assert(T.layout(ctx,'a',{...s,align:'right'}).glyphs[0].x>100);
assert.equal(T.layout(ctx,'か\u3099',s).glyphs.length,1);
const xml=T.svg({style:{...s,shadow:true},layout:T.layout(ctx,'< &',s)},t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;'));assert(xml.includes('clipPath')&&xml.includes('feDropShadow')&&xml.includes('&lt;'));
console.log('PASS: heading schema, proportional corner scale + independent width resize, bounds, wrapping/overflow, alignment, graphemes, clipped SVG/shadow/XML');

assert.equal(T.visibleHits([{x:100,y:200,width:100,height:40}],{...s,stack:'back'},{x:0,y:0,w:1080,h:1350}).length,0);
assert.equal(T.visibleHits([{x:100,y:200,width:100,height:40}],s,{x:0,y:0,w:1080,h:1350}).length,1);

const body=T.createBody({...s,id:'primary-body',source:'body'});assert(T.validBody(body));assert(!T.valid(body));assert(!T.validBody(s));assert(!T.validBody({...body,size:NaN}));
for(const corner of ['nw','ne','sw','se','w','e'])assert(T.validBody(T.resize(body,corner,100,50)));
const bodySvg=T.svg({style:{...body,shadow:true},layout:T.layout(ctx,'本文',body)},t=>t);assert(bodySvg.includes('id="body-clip"')&&bodySvg.includes('id="body-shadow"'));assert(!bodySvg.includes('id="heading-clip"'));
console.log('PASS: body identity validation, shared scaling, isolated SVG clip/shadow IDs');
