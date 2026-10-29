/* Sample-aligned PCM timeline. No gain, normalization, fade, microphone or database access. */
import {AudioSampleSink,AudioSample} from '../vendor/mp4/mediabunny-1.63.0.min.mjs';
export const RATE=48000;
export const checkAbort=signal=>{if(signal?.aborted)throw new DOMException('書き出しを中止しました。','AbortError');};
export function segments(project){let time=0;return project.cuts.map(cut=>{const start=Math.round(time*RATE);time+=cut.end-cut.start;return {cut,start,end:Math.round(time*RATE)};});}
export async function cutPCM(track,cut,frames,{signal,progress=()=>{}}={}){
 checkAbort(signal);
 if(!track)return {channels:[new Float32Array(frames)],silent:true,sourceFrames:0};
 const rate=await track.getSampleRate(),channels=await track.getNumberOfChannels();
 if(rate<8000||rate>96000||![1,2].includes(channels))throw Error('音声は8〜96kHzのモノラル/ステレオに対応します。多チャンネル音声は変更せず出力を中止しました。');
 const begin=Math.round(cut.start*rate),length=Math.max(1,Math.round(cut.end*rate)-begin),buffer=new AudioBuffer({numberOfChannels:channels,length,sampleRate:rate});
 let copied=0;const sink=new AudioSampleSink(track);
 for await(const sample of sink.samples(cut.start,cut.end)){
  try{checkAbort(signal);if(sample.sampleRate!==rate||sample.numberOfChannels!==channels)throw Error('途中で音声の形式が変わる素材には対応していません。');
   const at=Math.round(sample.timestamp*rate),from=Math.max(0,begin-at),to=Math.min(sample.numberOfFrames,begin+length-at);
   if(to>from){const offset=at+from-begin;for(let c=0;c<channels;c++)sample.copyTo(buffer.getChannelData(c).subarray(offset,offset+to-from),{planeIndex:c,format:'f32-planar',frameOffset:from,frameCount:to-from});copied+=to-from;}
  }finally{sample.close();}
 }
 checkAbort(signal);progress();
 // Resample one cut at a time, not the complete source file. Exact destination length, no gain node.
 const context=new OfflineAudioContext(channels,frames,RATE),source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start();
 const rendered=await context.startRendering();checkAbort(signal);
 return {channels:Array.from({length:channels},(_,c)=>rendered.getChannelData(c)),silent:false,sourceFrames:copied};
}
export async function writePCM(source,pcm,start,channels,{signal,onBlock=()=>{}}={}){
 const frames=pcm.channels[0].length;
 for(let i=0;i<frames;i+=4096){checkAbort(signal);const count=Math.min(4096,frames-i),data=new Float32Array(count*channels);
  // Mono is copied unchanged to L/R when stereo output is needed. No speaker-mix attenuation.
  for(let c=0;c<channels;c++)data.set(pcm.channels[Math.min(c,pcm.channels.length-1)].subarray(i,i+count),c*count);
  const sample=new AudioSample({format:'f32-planar',data,numberOfChannels:channels,sampleRate:RATE,timestamp:(start+i)/RATE});
  try{await source.add(sample);}finally{sample.close();}onBlock(count);
 }
}
