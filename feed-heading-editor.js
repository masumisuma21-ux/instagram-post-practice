/* Optional heading/body layers share geometry and editing. Geometry, layout, rendering and pointer editing stay local. */
(function(root){
'use strict';
const W=1080,H=1350,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function valid(s,source='title'){return !!s&&s.version===1&&s.id===(source==='body'?'primary-body':'primary-heading')&&s.type==='text'&&s.source===source&&['front','back'].includes(s.stack)&&['sans','serif'].includes(s.font)&&[400,500,600,700].includes(s.weight)&&['left','center','right'].includes(s.align)&&['color','background'].every(k=>/^#[0-9a-f]{6}$/i.test(s[k]))&&typeof s.shadow==='boolean'&&Object.entries({x:[-2000,2000],y:[-2000,2000],width:[40,2000],height:[40,1800],size:[16,180],lineHeight:[.8,3],spacing:[-2,30],opacity:[0,1],backgroundOpacity:[0,1]}).every(([k,[a,b]])=>Number.isFinite(s[k])&&s[k]>=a&&s[k]<=b);}
function create(v,source='title'){const s={version:1,id:'primary-heading',type:'text',source:'title',stack:'front',font:'sans',weight:600,align:'left',color:'#435445',background:'#ffffff',shadow:false,size:72,lineHeight:1.55,spacing:0,opacity:1,backgroundOpacity:0,...v};if(source==='body'){s.id='primary-body';s.source='body';}if(!valid(s,source))throw Error((source==='body'?'本文':'見出し')+'設定の形式・範囲を確認してください。');return s;}
const family=s=>s.font==='serif'?'JPSerif':'JP';
function bound(s){return {...s,x:clamp(s.x,24-s.width,W-24),y:clamp(s.y,24-s.height,H-24)};}
function resize(s,corner,dx,dy){
 const west=corner.includes('w'),north=corner.includes('n');
 // Side handles reflow text without changing its size or the frame height.
 if(corner==='w'||corner==='e'){const width=clamp(s.width+(west?-dx:dx),40,2000);return bound({...s,width,x:west?s.x+s.width-width:s.x});}
 // Project the dragged corner onto the original diagonal; keep the opposite
 // corner fixed and scale frame, font and pixel tracking together.
 const min=Math.max(40/s.width,40/s.height,16/s.size),max=Math.min(2000/s.width,1800/s.height,180/s.size,s.spacing>0?30/s.spacing:s.spacing<0?-2/s.spacing:Infinity);
 const factor=clamp(1+((west?-dx:dx)*s.width+(north?-dy:dy)*s.height)/(s.width*s.width+s.height*s.height),min,max),width=clamp(s.width*factor,40,2000),height=clamp(s.height*factor,40,1800);
 // Clamp products too: floating-point rounding at a limit must not invalidate saved data.
 return bound({...s,width,height,size:clamp(s.size*factor,16,180),spacing:clamp(s.spacing*factor,-2,30),x:west?s.x+s.width-width:s.x,y:north?s.y+s.height-height:s.y});
}
const segments=t=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(t)].map(x=>x.segment):[...t];
function layout(ctx,text,s){
 ctx.font=`${s.weight} ${s.size}px ${family(s)}`;const rows=[];
 for(const paragraph of String(text).split('\n')){let row=[],width=0;for(const char of segments(paragraph)){const advance=Math.max(.1,ctx.measureText(char).width),next=width+(row.length?s.spacing:0)+advance;if(row.length&&next>s.width){rows.push({chars:row,width});row=[];width=0;}if(row.length)width+=s.spacing;row.push({char,advance});width+=advance;}rows.push({chars:row,width});}
 const glyphs=[],hits=[];rows.forEach((row,i)=>{let x=s.x+(s.align==='center'?(s.width-row.width)/2:s.align==='right'?s.width-row.width:0);const y=s.y+s.size+i*s.size*s.lineHeight;if(y-s.size>s.y+s.height)return;hits.push({x,y:y-s.size,width:Math.max(12,row.width),height:s.size*1.2});for(const g of row.chars){glyphs.push({char:g.char,x,y});x+=g.advance+s.spacing;}});
 return {glyphs,hits,overflow:rows.length*s.size*s.lineHeight>s.height||rows.some(r=>r.width>s.width)};
}
function draw(ctx,item){const s=item.style;ctx.save();ctx.beginPath();ctx.rect(s.x,s.y,s.width,s.height);ctx.clip();ctx.fillStyle=s.background;ctx.globalAlpha=s.backgroundOpacity;ctx.fillRect(s.x,s.y,s.width,s.height);ctx.globalAlpha=s.opacity;ctx.fillStyle=s.color;ctx.font=`${s.weight} ${s.size}px ${family(s)}`;ctx.textAlign='left';if(s.shadow){ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=4;ctx.shadowOffsetX=3;ctx.shadowOffsetY=3;}for(const g of item.layout.glyphs)ctx.fillText(g.char,g.x,g.y);ctx.restore();}
function svg(item,escape){const s=item.style,id=s.source==='body'?'body-clip':'heading-clip',shadowId=s.source==='body'?'body-shadow':'heading-shadow',font=s.font==='serif'?'Noto Serif CJK JP,Noto Serif JP,serif':'Noto Sans CJK JP,Noto Sans JP,sans-serif';return `<defs><clipPath id="${id}"><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"/></clipPath>${s.shadow?`<filter id="${shadowId}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="3" dy="3" stdDeviation="2" flood-opacity="0.45"/></filter>`:''}</defs><g clip-path="url(#${id})"><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${s.background}" opacity="${s.backgroundOpacity}"/><g fill="${s.color}" opacity="${s.opacity}" font-family="${font}" font-size="${s.size}" font-weight="${s.weight}"${s.shadow?` filter="url(#${shadowId})"`:''}><text xml:space="preserve">${item.layout.glyphs.map(g=>`<tspan x="${g.x}" y="${g.y}">${escape(g.char)}</tspan>`).join('')}</text></g></g>`;}
function visibleHits(areas,s,photo){
 const out=[];for(const a of areas){const x=Math.max(0,s.x,a.x),y=Math.max(0,s.y,a.y),right=Math.min(W,s.x+s.width,a.x+a.width),bottom=Math.min(H,s.y+s.height,a.y+a.height);if(right<=x||bottom<=y)continue;const r={x,y,width:right-x,height:bottom-y};
 if(s.stack!=='back'||!photo){out.push(r);continue;}const l=Math.max(x,photo.x),t=Math.max(y,photo.y),rr=Math.min(right,photo.x+photo.w),bb=Math.min(bottom,photo.y+photo.h);if(rr<=l||bb<=t){out.push(r);continue;}for(const q of [{x,y,width:r.width,height:t-y},{x,y:bb,width:r.width,height:bottom-bb},{x,y:t,width:l-x,height:bb-t},{x:rr,y:t,width:right-rr,height:bb-t}])if(q.width>0&&q.height>0)out.push(q);
 }return out;
}
function editor(h,kind='heading'){
 const source=kind==='body'?'body':'title',layerKey=kind==='body'?'bodyLayer':'headingLayer';
 const q=id=>document.getElementById(id.replace(/^heading/,kind==='body'?'bodyText':'heading')),overlay=q('headingOverlay'),box=q('headingSelection'),hits=q('headingHits'),tools=q('headingTools');let selected=false,last=null,lastKey='',gesture=null;const histories=new WeakMap(),copy=v=>structuredClone(v),snap=s=>({layer:copy(s[layerKey]),content:s[source]});
 function restore(s,v){if(v.layer)s[layerKey]=copy(v.layer);else delete s[layerKey];s[source]=v.content;h.contentSync();}
 function remember(s){const list=histories.get(s)||[];list.push(snap(s));if(list.length>40)list.shift();histories.set(s,list);}
 function select(){if(h.blocked())return;selected=true;h.select();sync();}
 function ensure(){const s=h.slide();if(!s[layerKey])s[layerKey]=copy(h.geometry());return s[layerKey];}
 function sync(){const s=h.slide(),key=h.key();if(last!==s||lastKey!==key){selected=false;last=s;lastKey=key;}const st=s[layerKey]||h.geometry();overlay.hidden=!st;tools.hidden=!selected;box.hidden=!selected;hits.hidden=selected;
  overlay.style.zIndex=selected?'10':st?.stack==='back'?'1':'3';
  if(!st)return;box.style.left=st.x/W*100+'%';box.style.top=st.y/H*100+'%';box.style.width=st.width/W*100+'%';box.style.height=st.height/H*100+'%';
  if(!selected){hits.replaceChildren();for(const r of visibleHits(h.hits(),st,h.photo())){const el=document.createElement('div');el.className=kind+'-hit';el.style.left=r.x/W*100+'%';el.style.top=r.y/H*100+'%';el.style.width=r.width/W*100+'%';el.style.height=r.height/H*100+'%';hits.append(el);}}
  const fields={headingX:st.x,headingY:st.y,headingWidth:st.width,headingHeight:st.height,headingSize:st.size,headingSizeRange:st.size,headingFont:st.font,headingWeight:st.weight,headingColor:st.color,headingAlign:st.align,headingLineHeight:st.lineHeight,headingSpacing:st.spacing,headingOpacity:st.opacity,headingBackground:st.background,headingBackgroundOpacity:st.backgroundOpacity,headingStack:st.stack,headingContent:s[source]};for(const[id,v]of Object.entries(fields))if(document.activeElement!==q(id))q(id).value=typeof v==='number'?Math.round(v*100)/100:v;q('headingShadow').checked=st.shadow;q('headingUndo').disabled=!(histories.get(s)||[]).length;
 }
 function commit(fn){if(gesture||h.blocked())return;const s=h.slide();remember(s);ensure();fn(s);selected=true;h.select();h.change(false);sync();}
 function down(e){if(e.button!==0||gesture||h.blocked())return;e.preventDefault();e.stopPropagation();const s=h.slide(),before=snap(s),geometry=copy(s[layerKey]||h.geometry()),rect=overlay.getBoundingClientRect();select();gesture={id:e.pointerId,s,key:h.key(),before,geometry,rect,x:e.clientX,y:e.clientY,corner:e.target.dataset.corner,moved:false};box.focus({preventScroll:true});box.setPointerCapture(e.pointerId);}
 box.onpointerdown=down;hits.onpointerdown=down;
 box.onpointermove=e=>{if(!gesture||e.pointerId!==gesture.id)return;e.preventDefault();const g=gesture;if(g.s!==h.slide()||g.key!==h.key())return cancel();const dx=(e.clientX-g.x)*W/g.rect.width,dy=(e.clientY-g.y)*H/g.rect.height;if(!g.moved&&Math.hypot(dx,dy)<2)return;g.moved=true;g.s[layerKey]=g.corner?resize(g.geometry,g.corner,dx,dy):bound({...g.geometry,x:g.geometry.x+dx,y:g.geometry.y+dy});h.change(true);sync();};
 function finish(e){if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;gesture=null;if(box.hasPointerCapture(g.id))box.releasePointerCapture(g.id);if(g.moved){const list=histories.get(g.s)||[];list.push(g.before);if(list.length>40)list.shift();histories.set(g.s,list);h.change(false);}sync();}
 function cancel(){if(!gesture)return;const g=gesture;gesture=null;restore(g.s,g.before);if(box.hasPointerCapture(g.id))box.releasePointerCapture(g.id);h.change(false);sync();}
 box.onpointerup=finish;box.onpointercancel=cancel;box.onlostpointercapture=()=>{if(gesture)cancel();};
 q('headingSelect').onclick=()=>{select();box.focus({preventScroll:true});};
 const nums={headingX:['x',-2000,2000],headingY:['y',-2000,2000],headingWidth:['width',40,2000],headingHeight:['height',40,1800],headingSize:['size',16,180],headingSizeRange:['size',16,180],headingLineHeight:['lineHeight',.8,3],headingSpacing:['spacing',-2,30],headingOpacity:['opacity',0,1],headingBackgroundOpacity:['backgroundOpacity',0,1]};
 for(const[id,[key,min,max]]of Object.entries(nums))q(id).oninput=e=>{if(e.target.value==='')return;const n=Number(e.target.value);if(!Number.isFinite(n))return;commit(s=>s[layerKey]=bound({...s[layerKey],[key]:clamp(n,min,max)}));};
 for(const[id,key]of Object.entries({headingFont:'font',headingWeight:'weight',headingColor:'color',headingAlign:'align',headingBackground:'background',headingStack:'stack'}))q(id).oninput=e=>commit(s=>{s[layerKey][key]=key==='weight'?Number(e.target.value):e.target.value;});
 q('headingShadow').onchange=e=>commit(s=>s[layerKey].shadow=e.target.checked);
 q('headingContent').oninput=e=>{const value=e.target.value;if(h.slide()[source]===value)return;commit(s=>{s[source]=value;h.contentSync();});};
 q('headingReset').onclick=()=>commit(s=>{delete s[layerKey];});
 q('headingUndo').onclick=()=>{const s=h.slide(),list=histories.get(s);if(gesture||h.blocked()||!list?.length)return;restore(s,list.pop());selected=true;h.select();h.change(false);sync();};
 q('mainCanvas').addEventListener('pointerdown',()=>{selected=false;sync();});
 box.onkeydown=e=>{if(e.key==='Escape'){cancel();selected=false;sync();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();q('headingUndo').click();return;}const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(d){e.preventDefault();commit(s=>s[layerKey]=bound({...s[layerKey],x:s[layerKey].x+d[0]*(e.shiftKey?10:1),y:s[layerKey].y+d[1]*(e.shiftKey?10:1)}));}};
 document.addEventListener('click',e=>{if(gesture&&!box.contains(e.target)){e.preventDefault();e.stopPropagation();}},true);window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});new ResizeObserver(sync).observe(overlay.parentElement);
 return {sync,busy:()=>!!gesture,recordContent(s){if(s[layerKey]||selected)remember(s);},deselect(){selected=false;sync();}};
}
const api={valid,create,validBody:s=>valid(s,'body'),createBody:v=>create(v,'body'),bound,resize,layout,draw,svg,visibleHits,editor};if(typeof module==='object'&&module.exports)module.exports=api;else root.TsumuguHeading=api;
})(globalThis);
