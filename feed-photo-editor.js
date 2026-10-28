/* Local photo-layer geometry and pointer editor. No network or storage access. */
(function(root) {
  'use strict';
  const W=1080,H=1350,MIN=20,MAX=8000;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function valid(p) {
    return !!p && p.version===1 && p.type==='image' && ['photo','background'].includes(p.layer) && ['full','side','bottom'].includes(p.textFlow) && ['x','y','width','height'].every(k=>Number.isFinite(p[k])) && p.width>=MIN && p.height>=MIN && p.width<=MAX && p.height<=MAX && Math.abs(p.x)<=MAX && Math.abs(p.y)<=MAX;
  }
  function bounded(p) { return {...p,x:clamp(p.x,24-p.width,W-24),y:clamp(p.y,24-p.height,H-24)}; }
  function create(rect,textFlow='full') { const p={version:1,id:'primary-photo',type:'image',layer:'photo',textFlow,...rect};if(!valid(p))throw Error('写真配置の形式・範囲を確認してください。');return bounded(p); }
  function resize(p,corner,dx,dy) {
    const ratio=p.width/p.height,sx=corner.includes('e')?1:-1,sy=corner.includes('s')?1:-1;
    const width=clamp(p.width+(sx*dx+sy*dy/ratio)/(1+1/(ratio*ratio)),Math.max(MIN,MIN*ratio),Math.min(MAX,MAX*ratio)),height=width/ratio;
    return bounded({...p,width,height,x:sx<0?p.x+p.width-width:p.x,y:sy<0?p.y+p.height-height:p.y});
  }
  function fit(iw,ih) { const scale=Math.min(780/iw,850/ih);return create({width:iw*scale,height:ih*scale,x:(W-iw*scale)/2,y:(H-ih*scale)/2}); }
  function cover(p) { const r=p.width/p.height,width=Math.max(W,H*r),height=width/r;return bounded({...p,width,height,x:(W-width)/2,y:(H-height)/2}); }
  function editor(hooks) {
    const q=id=>document.getElementById(id),box=q('photoSelection'),overlay=q('photoOverlay'),tools=q('photoTransformTools');
    const histories=new WeakMap();let selected=false,lastPhoto=null,lastKey='',gesture=null;
    const copy=v=>structuredClone(v);
    const snap=p=>({placement:copy(p.placement),placementReset:copy(p.placementReset),framing:copy(p.framing)});
    const restore=(p,v)=>{for(const k of ['placement','placementReset','framing']){if(v[k]===undefined)delete p[k];else p[k]=copy(v[k]);}};
    function remember(p) { const list=histories.get(p)||[];list.push(snap(p));if(list.length>40)list.shift();histories.set(p,list); }
    function ensure(p) {if(!p.placement){const r=hooks.geometry();p.placement=create({x:r.x,y:r.y,width:r.w,height:r.h},p.layout==='bottom'?'bottom':'side');}if(!p.placementReset)p.placementReset=copy(p.placement); }
    function commit(fn) {const p=hooks.photo();if(!p||hooks.blocked()||gesture)return;remember(p);ensure(p);fn(p);selected=true;hooks.select?.();hooks.change(false);sync();}
    function sync() {
      const p=hooks.photo(),key=hooks.key();if(lastPhoto!==p||lastKey!==key){selected=false;lastPhoto=p;lastKey=key;}
      overlay.hidden=!p;tools.hidden=!p||!selected;q('photoSelectTools').hidden=!p;q('photoLegacyControls').hidden=!!p?.placement;
      if(!p)return;const r=hooks.geometry();if(!r)return;
      box.style.left=r.x/W*100+'%';box.style.top=r.y/H*100+'%';box.style.width=r.w/W*100+'%';box.style.height=r.h/H*100+'%';box.classList.toggle('selected',selected);
      box.setAttribute('aria-label',selected?'選択中の写真。ドラッグまたは矢印キーで移動':'写真を選択して移動');
      q('photoUndo').disabled=!(histories.get(p)||[]).length;
      const fields={photoPX:r.x,photoPY:r.y,photoPW:r.w,photoPH:r.h,photoPScale:100*r.w/(p.placementReset?.width||r.w)};
      for(const [id,value]of Object.entries(fields))if(document.activeElement!==q(id))q(id).value=Math.round(value*100)/100;
      q('photoPlacementMode').textContent=p.placement?'自由配置：写真を動かしても文字配置は変わりません。':'従来配置を維持中。移動・サイズ変更をすると、現在の見た目を引き継いで自由配置に切り替わります。';
    }
    box.onpointerdown=e=>{
      if(e.button!==0||gesture||hooks.blocked())return;e.preventDefault();e.stopPropagation();const p=hooks.photo();if(!p)return;
      const rect=overlay.getBoundingClientRect();gesture={id:e.pointerId,p,key:hooks.key(),before:snap(p),startX:e.clientX,startY:e.clientY,rect,handle:e.target.dataset.handle,moved:false};
      selected=true;hooks.select?.();sync();box.focus({preventScroll:true});box.setPointerCapture(e.pointerId);
    };
    box.onpointermove=e=>{
      if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();const g=gesture;if(hooks.photo()!==g.p||hooks.key()!==g.key)return cancel();
      const dx=(e.clientX-g.startX)*W/g.rect.width,dy=(e.clientY-g.startY)*H/g.rect.height;if(!g.moved&&Math.hypot(dx,dy)<2)return;
      if(!g.moved){ensure(g.p);g.initial=copy(g.p.placement);g.moved=true;}
      g.p.placement=g.handle?resize(g.initial,g.handle,dx,dy):bounded({...g.initial,x:g.initial.x+dx,y:g.initial.y+dy});hooks.change(true);sync();
    };
    function finish(e) {
      if(!gesture||e.pointerId!==gesture.id)return;const g=gesture;gesture=null;
      if(box.hasPointerCapture(g.id))box.releasePointerCapture(g.id);
      if(g.moved){const list=histories.get(g.p)||[];list.push(g.before);if(list.length>40)list.shift();histories.set(g.p,list);hooks.change(false);}sync();
    }
    function cancel() {if(!gesture)return;const g=gesture;gesture=null;restore(g.p,g.before);if(box.hasPointerCapture(g.id))box.releasePointerCapture(g.id);hooks.change(false);sync();}
    box.onpointerup=finish;box.onpointercancel=cancel;box.onlostpointercapture=()=>{if(gesture)cancel();};
    q('mainCanvas').addEventListener('pointerdown',()=>{selected=false;sync();});
    q('photoSelect').onclick=()=>{selected=true;hooks.select?.();sync();box.focus({preventScroll:true});};
    q('photoFill').onclick=()=>commit(p=>p.placement=cover(p.placement));
    q('photoCenter').onclick=()=>commit(p=>p.placement={...p.placement,x:(W-p.placement.width)/2,y:(H-p.placement.height)/2});
    q('photoBackground').onclick=()=>commit(p=>p.placement={...cover(p.placement),layer:'background'});
    q('photoResetPlacement').onclick=()=>commit(p=>p.placement=copy(p.placementReset));
    q('photoUndo').onclick=()=>{const p=hooks.photo(),list=p&&histories.get(p);if(!p||!list?.length||gesture||hooks.blocked())return;restore(p,list.pop());hooks.change(false);selected=true;hooks.select?.();sync();};
    for(const [id,key]of [['photoPX','x'],['photoPY','y'],['photoPW','width'],['photoPH','height'],['photoPScale','scale']])q(id).onchange=e=>{
      const n=Number(e.target.value);if(!e.target.value||!Number.isFinite(n)){sync();return;}
      commit(p=>{let r=p.placement;if(key==='x'||key==='y')r={...r,[key]:clamp(n,-MAX,MAX)};else{
        const ratio=r.width/r.height,width=key==='height'?n*ratio:key==='scale'?p.placementReset.width*n/100:n;
        const w=clamp(width,Math.max(MIN,MIN*ratio),Math.min(MAX,MAX*ratio));r={...r,width:w,height:w/ratio};
      }p.placement=bounded(r);});e.target.blur();sync();
    };
    box.onkeydown=e=>{if(e.key==='Escape'){cancel();selected=false;sync();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();q('photoUndo').click();return;}const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();commit(p=>p.placement=bounded({...p.placement,x:p.placement.x+d[0]*(e.shiftKey?10:1),y:p.placement.y+d[1]*(e.shiftKey?10:1)}));}};
    document.addEventListener('click',e=>{if(gesture&&!box.contains(e.target)){e.preventDefault();e.stopPropagation();}},true);
    window.addEventListener('blur',cancel);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
    new ResizeObserver(()=>sync()).observe(overlay.parentElement);
    return {sync,busy:()=>!!gesture,cancel,beforeCrop(){const p=hooks.photo();if(p)remember(p);},aspectChanged(){const p=hooks.photo();if(p?.placement){const c=hooks.crop();const ratio=c.sw/c.sh;p.placement={...p.placement,height:clamp(p.placement.width/ratio,MIN,MAX)};}},resetSelection(){selected=false;sync();}};
  }
  const api={valid,create,bounded,resize,fit,cover,editor};if(typeof module==='object'&&module.exports)module.exports=api;else root.TsumuguPhotoLayout=api;
})(globalThis);
