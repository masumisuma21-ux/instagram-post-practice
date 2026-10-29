import {canEncodeAudio,CanvasSource,AudioSampleSource,AudioSample,Input,MP4,BlobSource,Output,Mp4OutputFormat,BufferTarget} from '../vendor/mp4/mediabunny-1.63.0.min.mjs';
let cached;
export function resetDiagnosis(){cached=undefined;}
export function diagnose(){return cached??=run().catch(e=>{cached=undefined;throw e;});}
async function smoke(codec,audio){
 const target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target});const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
 let sample;
 try{if(audio){const source=new AudioSampleSource({codec:'aac',bitrate:192000});output.addAudioTrack(source);await output.start();sample=new AudioSample({data:new Float32Array(2048*2),format:'f32-planar',numberOfChannels:2,sampleRate:48000,timestamp:0});await source.add(sample);}else{const source=new CanvasSource(canvas,{codec:'avc',fullCodecString:codec,bitrate:8000000,latencyMode:'quality'});output.addVideoTrack(source,{frameRate:30});await output.start();await source.add(0,1/30);}
  await output.finalize();const input=new Input({formats:[MP4],source:new BlobSource(new Blob([target.buffer],{type:'video/mp4'}))});
  try{const track=audio?await input.getPrimaryAudioTrack():await input.getPrimaryVideoTrack();if(!track||await track.getCodec()!==(audio?'aac':'avc'))throw Error('実エンコード結果の形式が一致しません。');}finally{input.dispose();}return true;
 }finally{sample?.close();if(output.state!=='finalized'&&output.state!=='canceled')await output.cancel().catch(()=>{});canvas.width=canvas.height=1;}
}
async function run(){
 const result={videoReady:false,audioReady:false,codec:null,nativeAac:false,audioBackend:null,issues:[],windowsTested:false};
 if(!isSecureContext||!globalThis.VideoEncoder){result.issues.push('この環境では動画出力を利用できません。最新版のWindows Chrome/EdgeでHTTPSの公開URLを開いてください。');return result;}
 for(const codec of ['avc1.420028','avc1.4d0028','avc1.640028'])try{const r=await VideoEncoder.isConfigSupported({codec,width:1080,height:1920,framerate:30,bitrate:8000000,latencyMode:'quality'});if(r.supported&&await smoke(codec,false)){result.codec=codec;result.videoReady=true;break;}}catch{}
 if(!result.videoReady)result.issues.push('1080×1920・30fpsのH.264出力を開始できません。Chrome/Edgeやグラフィックドライバーを更新して再診断してください。');
 try{result.nativeAac=!!(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000})).supported;}catch{}
 try{if(await canEncodeAudio('aac',{sampleRate:48000,numberOfChannels:2,bitrate:192000})){result.audioReady=await smoke(null,true);result.audioBackend=result.nativeAac?'native':'registered-local';}}catch{}
 if(!result.audioReady)result.issues.push('このブラウザではAAC音声付きMP4を出力できません。最新版のWindows Chrome/Edgeで再診断するか、明示的に無音を選択してください。音声が必要な場合は元素材と既存CapCut用素材で仕上げてください。');
 result.message=result.videoReady?(result.audioReady?'映像・AAC音声の実エンコード確認に成功しました。':'映像は出力できますが、AAC音声出力には非対応です。'):'この環境ではMP4出力を利用できません。';
 return result;
}
