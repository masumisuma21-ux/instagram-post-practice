import assert from 'node:assert/strict';import {segments,cutPCM,writePCM,RATE} from '../mp4-export/audio.mjs';
const p={cuts:[{start:.12345,end:1.34567},{start:2.125,end:4.33333},{start:10.01,end:10.51}]},parts=segments(p);let time=0;
for(let i=0;i<parts.length;i++){const s=parts[i];assert.equal(s.start,i?parts[i-1].end:0);time+=p.cuts[i].end-p.cuts[i].start;assert.equal(s.end,Math.round(time*RATE));}assert.equal(parts.at(-1).end,Math.round(time*RATE));
const silent=await cutPCM(null,p.cuts[0],5000);assert(silent.silent&&silent.channels[0].every(x=>x===0));
const blocks=[],pcm={channels:[Float32Array.from({length:10001},(_,i)=>Math.sin(i)*.3)]};await writePCM({add:async sample=>{const planes=[0,1].map(c=>{const a=new Float32Array(sample.numberOfFrames);sample.copyTo(a,{format:'f32-planar',planeIndex:c});return a});blocks.push({time:sample.timestamp,planes});}},pcm,1234,2);
assert.equal(blocks.reduce((n,b)=>n+b.planes[0].length,0),10001);let cursor=0;for(const b of blocks){assert.equal(b.time,(1234+cursor)/RATE);assert.deepEqual(b.planes[0],b.planes[1]);assert.deepEqual(b.planes[0],pcm.channels[0].slice(cursor,cursor+b.planes[0].length));cursor+=b.planes[0].length;}
const controller=new AbortController();controller.abort();await assert.rejects(()=>writePCM({add:()=>assert.fail()},pcm,0,1,{signal:controller.signal}),{name:'AbortError'});
console.log('PASS cumulative sample grid, no cut gaps/overlap, exact block timestamps, mono channel duplication without gain, silent interval and cancel');
