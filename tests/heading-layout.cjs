const assert=require('node:assert/strict'),T=require('../feed-heading-editor');
const s=T.create({x:100,y:200,width:500,height:300});assert(T.valid(s));
for(const corner of ['nw','ne','sw','se']){const r=T.resize(s,corner,80,60);assert(T.valid(r));assert(r.width!==s.width&&r.height!==s.height)}
for(const [key,v]of [['size',200],['width',0],['color','url(x)'],['opacity',Infinity],['stack','html'],['lineHeight',0],['weight',42]])assert(!T.valid({...s,[key]:v}));
const ctx={font:'',measureText:t=>({width:[...t].length*20})};const a=T.layout(ctx,'日本語の見出し\n次の行',s);assert(a.glyphs.length>5);assert(!a.overflow);assert(T.layout(ctx,'あ'.repeat(70),{...s,width:40,height:40}).overflow);assert(T.layout(ctx,'a',{...s,align:'right'}).glyphs[0].x>100);
assert.equal(T.layout(ctx,'か\u3099',s).glyphs.length,1);
const xml=T.svg({style:{...s,shadow:true},layout:T.layout(ctx,'< &',s)},t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;'));assert(xml.includes('clipPath')&&xml.includes('feDropShadow')&&xml.includes('&lt;'));
console.log('PASS: heading schema, independent box resize, bounds, wrapping/overflow, alignment, graphemes, clipped SVG/shadow/XML');

assert.equal(T.visibleHits([{x:100,y:200,width:100,height:40}],{...s,stack:'back'},{x:0,y:0,w:1080,h:1350}).length,0);
assert.equal(T.visibleHits([{x:100,y:200,width:100,height:40}],s,{x:0,y:0,w:1080,h:1350}).length,1);
