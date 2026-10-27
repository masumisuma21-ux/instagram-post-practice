const assert=require('node:assert/strict'),T=require('../image-tools');
for(const style of Object.keys(T.styles))for(const ratio of ['4:5','9:16']){const p=T.plan({theme:'朝の美容液',text:'洗顔後に手のひらへ出す',style,ratio});assert(p.prompt.includes('洗顔後に手のひらへ出す'));assert(p.prompt.includes(ratio));assert(p.prompt.includes('文字・ロゴ'));assert(p.composition.includes('手元'));}
assert.notEqual(T.plan({theme:'朝の保湿'}).prompt,T.plan({theme:'家族の食事',genre:'飲食店'}).prompt);
for(const [w,h] of [[600,400],[400,600]])for(const aspect of ['original','4:5','9:16','1:1'])for(const zoom of [1,2,3])for(const x of [0,50,100]){const c=T.crop(w,h,{aspect,zoom,x,y:x});assert(c.sx>=-1e-9&&c.sy>=-1e-9);assert(c.sx+c.sw<=w+1e-9&&c.sy+c.sh<=h+1e-9)}
assert.equal(T.framing(null).zoom,1);
assert.deepEqual(T.crop(600,400),{sx:0,sy:0,sw:600,sh:400});
(async()=>{await assert.rejects(T.validateFile(new File(['fake'],'fake.png',{type:'image/png'})));await assert.rejects(T.validateFile(new File(['abc'],'fake.svg',{type:'image/svg+xml'})));console.log('PASS: style/ratio/context prompts, crop bounds/legacy default, malformed file rejection')})().catch(e=>{console.error(e);process.exit(1)});
