const assert=require('node:assert/strict'),T=require('../video-timeline'),V=require('../video-model');
assert.equal(T.time(3.5),'00:03.5');assert.equal(T.time(12),'00:12.0');assert.equal(T.time(63.57),'01:03.57');assert.equal(T.time(59.999),'01:00.0');
for(const duration of [16,36,300])for(const width of [240,360,800]){const ticks=T.ticks(duration,width);assert.equal(ticks[0],0);assert.equal(ticks.at(-1),duration);assert(ticks.length<=Math.floor(width/68)+3);for(let i=1;i<ticks.length;i++)assert(ticks[i]>ticks[i-1]);}
for(const duration of [16,36])for(const start of [0,3.57])for(const edge of ['start','end'])for(const target of [-100,0,2.36,16,36,100]){const c={start,end:duration},r=T.trim(c,edge,target,duration);assert(r.start>=0&&r.end<=duration);assert(r.end-r.start>=.09999);assert.equal(r[edge==='start'?'end':'start'],c[edge==='start'?'end':'start']);}
assert.deepEqual(T.trim({start:0,end:16},'start',3.46,16),{start:3.5,end:16});assert.deepEqual(T.trim({start:0,end:16},'end',12.037,16,.01),{start:0,end:12.04});
const p=V.empty();p.cuts=[{id:'c1',assetId:'a1',start:3.5,end:12,crop:{fit:'cover',x:50,y:50,zoom:1},captions:[]}];V.validateProject(p);assert.equal(V.total(p),8.5);
console.log('PASS: timeline clock, adaptive ticks, .1/.01 precision, trim bounds/minimum gap and unchanged opposite edge');

for(const duration of [16.046,36.0333333])for(const side of ['start','end'])for(const target of [-100,100]){const c={start:duration-.1002,end:duration},r=T.trim(c,side,target,duration);assert(r.end<=duration&&r.start>=0&&r.end-r.start>=.099999);V.validateProject({...V.empty(),cuts:[{id:'fractional',assetId:'fractional-video',...r,crop:{fit:'cover',x:50,y:50,zoom:1},captions:[]}]});}
console.log('PASS: fractional source durations preserve legal bounds and minimum trim gap');
