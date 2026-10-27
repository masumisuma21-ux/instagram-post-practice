const assert=require('node:assert/strict'),L=require('../feed-photo-editor');
const p=L.fit(900,600);assert(L.valid(p));assert(p.width>=700);assert.equal(p.width/p.height,1.5);
for(const corner of ['nw','ne','sw','se'])for(const [dx,dy]of [[40,70],[-100,-100],[1e6,1e6],[-1e6,-1e6]]){const r=L.resize(p,corner,dx,dy);assert(L.valid(r));assert(Math.abs(r.width/r.height-1.5)<1e-9);assert(r.x+r.width>=24&&r.y+r.height>=24&&r.x<=1056&&r.y<=1326);}
const fill=L.cover(p);assert(fill.width>=1080&&fill.height>=1350);assert.equal(fill.width/fill.height,1.5);
assert(!L.valid({...p,width:Infinity}));assert(!L.valid({...p,version:2}));assert(!L.valid({...p,layer:'html'}));
assert.throws(()=>L.create({x:0,y:0,width:0,height:100}));
console.log('PASS: photo layer schema, initial fit, all resize corners/ratio/bounds, cover, invalid settings');
