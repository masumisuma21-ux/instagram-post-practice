/* Offline image planning and crop geometry. No provider, key or network dependency. */
(function(root) {
  'use strict';
  const styles = {real:'リアル写真：自然光、自然な質感、落ち着いた色',beauty:'美容広告：上品なベージュとアイボリー、清潔感、柔らかな光',product:'商品撮影：物の形と質感が分かる構図、控えめな背景',life:'ライフスタイル：暮らしの中の自然な場面、温かい光'};
  const num=(v,min,max,d)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):d;
  function framing(v={}) { v=v&&typeof v==='object'?v:{}; return {aspect:['original','4:5','9:16','1:1'].includes(v.aspect)?v.aspect:'original',zoom:num(v.zoom,1,3,1),x:num(v.x,0,100,50),y:num(v.y,0,100,50)}; }
  function crop(w,h,v={},ratio) { const f=framing(v),r=ratio||({'4:5':4/5,'9:16':9/16,'1:1':1}[f.aspect])||w/h;let sw=Math.min(w,h*r)/f.zoom,sh=sw/r;return {sx:(w-sw)*f.x/100,sy:(h-sh)*f.y/100,sw,sh}; }
  function plan(o={}) {
    const text=String(o.text||'').replace(/[\u0000-\u001f]/g,' ').slice(0,700), theme=String(o.theme||'').slice(0,100),genre=String(o.genre||'').slice(0,100);
    const subject=/美容液|化粧水|保湿|スキンケア/.test(text+' '+theme)?'無地のスキンケア容器と手元のクローズアップ':/料理|メニュー|食事|飲食/.test(text+' '+theme+' '+genre)?'料理や食卓のイメージ。実際の商品・店舗の再現には実写を使う':'投稿の主題に合う物や生活の一場面（具体的な被写体を確認して追記）';
    const composition=`構図案：${subject}。主役は画面の下〜中央に配置し、上部にテロップ用の余白。顔を写さない構図。`;
    return {composition,prompt:[Object.hasOwn(styles,o.style)?styles[o.style]:styles.real,`テーマ：${theme}`,`投稿内容（視覚化の参考）：${text}`,composition,`縦横比：${o.ratio==='9:16'?'9:16':'4:5'}。`, '画像内に文字・ロゴ・透かしを入れない。文章はつむぐで別レイヤーとして重ねる。実在人物の再現、効果を示すビフォーアフター、過度な肌補正を避ける。未確認の商品仕様や店舗情報を事実として描かない。'].join('\n')};
  }
  async function validateFile(file) {
    if(!file || !['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size>12*1024**2) throw Error('12MB以下のPNG・JPEG・WebPを選んでください。');
    const a=new Uint8Array(await file.slice(0,12).arrayBuffer()),isPng=[137,80,78,71,13,10,26,10].every((v,i)=>a[i]===v),isJpeg=a[0]===255&&a[1]===216&&a[2]===255,isWebp=String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP';
    if(!({'image/png':isPng,'image/jpeg':isJpeg,'image/webp':isWebp}[file.type]))throw Error('拡張子・形式と画像の内容が一致しません。');
  }
  const api={styles,framing,crop,plan,validateFile}; if(typeof module==='object'&&module.exports)module.exports=api;else root.TsumuguImageTools=api;
})(typeof globalThis==='object'?globalThis:this);
