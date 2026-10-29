/* 《回弹》 / THE RETURN. Original 60-second mechanism film, no voiceover.
 * Facts: University of Illinois Physics Van /103; Exploratorium ballbounces2.
 * Heights, compression, molecular scale and timing are schematic, not measurements.
 * C night world; all solid props draw under the bloom layer. */
(function(){
'use strict';
const {ss,lerp,clamp,fade}=VK,K=VKit,ZH=document.documentElement.lang!=='en',B=BallArt;
const L=(zh,en)=>ZH?zh:en,PI=Math.PI;
const SUBS=[
[.55,4.05,'把篮球松开，它会自己回来。','Let go. The basketball comes back.'],
[4.7,8.0,'但它，回不到刚才的高度。','But it never reaches the same height.'],
[13.6,17.0,'落地那一瞬，球先被压扁。','At impact, the ball flattens.'],
[17.9,21.25,'球壳变形，里面的空气被压缩。','Its shell deforms. The air compresses.'],
[22.1,25.5,'恢复形状时，它把能量还给运动。','As its shape returns, motion returns.'],
[26.4,29.2,'球暂时存住的，是弹性能。','For a moment, energy is stored elastically.'],
[30.25,33.55,'有些能量，变成了热和声音。','Some energy becomes heat and sound.'],
[34.2,38.1,'所以每次回到空中，都比上一次低。','Each bounce reaches a little lower.'],
[39.1,42.9,'同样高度，缺气的球回得更低。','From the same height, a soft ball returns lower.'],
[43.8,47.6,'把气打进去，球壁不再那么容易弯。','Add air. The shell resists bending.'],
[48.4,51.9,'每次运球，你都在补回一点能量。','Every dribble adds energy back.'],
[53.1,55.9,'那一次次返回，是能量在接力。','Each return passes energy onward.']
];
function txt(c,s,x,y,size=28,color='#d4d9d9',align='center',family='sans',weight=400){c.save();c.font=weight+' '+size+'px "'+(family==='serif'?'VK Serif':family==='latin'?'VK Latin':family==='mono'?'VK Mono':'VK Sans')+'"';c.textAlign=align;c.fillStyle=color;c.fillText(s,x,y);c.restore();}
function line(c,x0,y0,x1,y1,col='#b7cbca',w=2){c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.strokeStyle=col;c.lineWidth=w;c.stroke();}
function arrow(c,x0,y0,x1,y1,col='#68d8e7',w=5){line(c,x0,y0,x1,y1,col,w);const a=Math.atan2(y1-y0,x1-x0),n=17;c.beginPath();c.moveTo(x1,y1);c.lineTo(x1-n*Math.cos(a-.4),y1-n*Math.sin(a-.4));c.lineTo(x1-n*Math.cos(a+.4),y1-n*Math.sin(a+.4));c.closePath();c.fillStyle=col;c.fill();}
function group(c,a,fn){if(a<=.001)return;c.save();c.globalAlpha*=a;fn();c.restore();}
function floor(c,y=785,a=1){c.save();c.globalAlpha*=a;const light=c.createLinearGradient(0,y,0,850);light.addColorStop(0,'#66452788');light.addColorStop(1,'#10182100');c.fillStyle=light;c.fillRect(160,y,1600,65);line(c,160,y,1760,y,'#a98a5c99',2);for(let n=0;n<10;n++)line(c,150+n*175,y,80+n*190,850,'#72543828',1);for(const yy of [807,839])line(c,160,yy,1760,yy,'#72543835',1);c.restore();}
function shadow(c,x,y,r,h,a=1){c.save();c.globalAlpha*=a*Math.max(.08,1-h/1500);c.translate(x,y);c.scale(1,.12);const g=c.createRadialGradient(0,0,0,0,0,r*1.1);g.addColorStop(0,'#050608bb');g.addColorStop(1,'#05060800');c.fillStyle=g;c.fillRect(-r*1.2,-r*1.2,r*2.4,r*2.4);c.restore();}
function ruler(c,x,top=210,bottom=785,a=1){c.save();c.globalAlpha*=a;line(c,x,top,x,bottom,'#a4bfc34d',1);for(let n=0;n<=8;n++){const y=top+(bottom-top)*n/8;line(c,x-8,y,x+10,y,'#a4bfc34d',1);}c.restore();}
function bounce(u,{r=125,release=215,floorY=785,e=.78}={}){const h=floorY-r-release,g=680;let t=Math.max(0,u-.4),fall=Math.sqrt(2*h/g);if(t<fall)return{y:release+.5*g*t*t,sy:1,sx:1};t-=fall;let vel=Math.sqrt(2*g*h)*e;for(let n=0;n<12;n++){if(t<.15){const q=Math.sin(t/.15*PI);return{y:floorY-r*(1-.2*q),sy:1-.2*q,sx:1+.10*q};}t-=.15;const flight=2*vel/g;if(t<flight)return{y:floorY-r-vel*t+.5*g*t*t,sy:1,sx:1};t-=flight;vel*=e;}return{y:floorY-r,sy:1,sx:1};}
function chamber(c,t){
const r=lerp(220,305,ss(t,16.5,18.8))*(1-.42*ss(t,23,25.4)),q=(t<17.5?.20*ss(t,13.7,15.4):lerp(.05,.27,ss(t,18.1,20.6)))*(1-ss(t,22.1,23.5)),rise=260*ss(t,23.2,25.8),sy=1-q;
let y=785-r*sy-rise;if(t<14.1)y=lerp(460,785-r*sy,ss(t,13.0,14.1));
floor(c);shadow(c,960,790,r,785-y);B.draw(c,{x:960,y,r,sy,sx:1+q*.42,cut:ss(t,17.6,18.8)*(1-ss(t,23,24.1)),spin:.13+(t-13)*.018,air:t});
if(t>18&&t<22.9){const a=ss(t,18,18.7)*(1-ss(t,22.2,22.9));group(c,a,()=>{txt(c,L('球壳与压缩空气','SHELL + COMPRESSED AIR'),960,195,25,'#8bbac2');line(c,1325,400,1500,320,'#a7c7cc77',1);txt(c,L('结构与速度示意','STRUCTURE / SPEED: SCHEMATIC'),1490,300,17,'#81989d','right','mono');for(const k of [-1,1])arrow(c,960+k*(r+110),y,960+k*(r+25),y,'#6cc8dcaa',3);});}
if(t>23.5)group(c,ss(t,23.5,24),()=>arrow(c,1220,710,1220,580,'#74dbe7bb',4));
}
function opening(c,t,end=false){floor(c);ruler(c,580,260);const state=bounce(end?(t-52.5)*1.0:t*.85,{r:185,release:260});shadow(c,960,790,220,785-state.y);B.draw(c,{x:960,y:state.y,r:185,sx:state.sx,sy:state.sy,spin:.14+t*.075});line(c,580,260,1190,260,'#d9ba7c55',1.5);txt(c,L('松手的位置','RELEASE HEIGHT'),1210,267,23,'#a9b3ad','left','mono');if(!end&&t>4.5){const a=ss(t,4.5,5.1);group(c,a,()=>{line(c,580,393.144,750,393.144,'#7cc8d777',1.5);txt(c,L('第一次回弹','FIRST RETURN'),560,401,23,'#8fb6c1','right');});}}
function loss(c,t){floor(c);const p=ss(t,29.5,31.2),y=lerp(450,620,p);shadow(c,960,790,190,785-y);B.draw(c,{x:960,y,r:165,sy:1-.10*Math.sin(PI*p),sx:1+.05*Math.sin(PI*p),spin:.2});const q=ss(t,30.5,31.8);group(c,q,()=>{
for(let n=0;n<4;n++){const z=(t-30.5-n*.23);if(z<0)continue;const rr=80+z*170,fade=Math.max(0,1-z/4);c.save();c.globalAlpha*=fade*.6;c.strokeStyle='#71c8da';c.lineWidth=2;c.beginPath();c.ellipse(960,788,rr,rr*.17,0,0,PI*2);c.stroke();c.restore();}
const g=c.createRadialGradient(960,788,5,960,788,220);g.addColorStop(0,'#e3515544');g.addColorStop(1,'#e3515500');c.fillStyle=g;c.fillRect(690,730,540,115);
txt(c,L('热','HEAT'),960,825,21,'#e29b9e');txt(c,L('声','SOUND'),1370,725,21,'#8dd2df');});}
function sequence(c,t){floor(c);ruler(c,570,250);const st=bounce((t-33.7)*1.20,{r:170,e:.68,release:250});shadow(c,960,790,210,785-st.y);B.draw(c,{x:960,y:st.y,r:170,sx:st.sx,sy:st.sy,spin:.4+(t-33.7)*.13});for(const [y,w]of[[250,390],[446.224,290],[536.971,210]])line(c,590,y,590+w,y,'#93acac44',1.2);}
function compare(c,t){const u=(t-38.5)*.95;floor(c);for(const [x,e,soft]of[[540,.50,true],[1380,.84,false]]){const st=bounce(u,{r:soft?149.6:170,e,release:250});ruler(c,x-240,250,785,.7);line(c,x-235,250,x+185,250,'#bcae8866',1);shadow(c,x,790,210,785-st.y);B.draw(c,{x,y:st.y,r:170,sx:st.sx*(soft?1.04:1),sy:st.sy*(soft?.88:1),spin:.2});txt(c,soft?L('充气不足','UNDERINFLATED'):L('充气适当','INFLATED'),x,150,28,soft?'#b8aaa0':'#a8d6da');}txt(c,L('同一高度、同一地面；弹跳高度为机制示意','SAME HEIGHT / SAME SURFACE · HEIGHTS ARE SCHEMATIC'),960,835,17,'#819296','center','mono');}
function pump(c,t){floor(c);const q=ss(t,43.6,47.0),r=155+24*q,sy=.78+.22*q;shadow(c,1125,790,190,0);B.draw(c,{x:1125,y:785-r*sy,r,sy,sx:1.08-.08*q,spin:.18});
c.save();c.strokeStyle='#869b9f';c.lineWidth=12;c.lineCap='round';c.beginPath();c.moveTo(615,760);c.bezierCurveTo(770,790,815,650,955,640);c.stroke();c.fillStyle='#223d49';c.beginPath();c.roundRect(500,445,110,300,22);c.fill();const metal=c.createLinearGradient(500,0,610,0);metal.addColorStop(0,'#3d6875');metal.addColorStop(.45,'#9fb4b6');metal.addColorStop(1,'#294a57');c.fillStyle=metal;c.fillRect(522,440,65,300);const handleY=330+75*Math.sin((t-43.3)*2.4);line(c,553,handleY,553,455,'#9eb2b8',12);line(c,480,handleY,625,handleY,'#a9b5ae',26);line(c,470,747,640,747,'#55727a',20);
c.fillStyle='#0f222b';c.beginPath();c.arc(700,540,60,0,PI*2);c.fill();c.strokeStyle='#8ca9af';c.lineWidth=3;c.stroke();for(let n=0;n<8;n++){const a=PI*.85+n*PI*1.3/7;line(c,700+Math.cos(a)*43,540+Math.sin(a)*43,700+Math.cos(a)*50,540+Math.sin(a)*50,'#b8c4be',2);}const ang=PI*.85+q*PI*1.1;arrow(c,700,540,700+Math.cos(ang)*40,540+Math.sin(ang)*40,'#dfa85c',2.5);c.restore();txt(c,L('恢复支撑形状的气压','AIR PRESSURE SUPPORTS THE SHELL'),960,205,26,'#9ac5cd');}
function hand(c,t){floor(c);const q=ss(t,48.3,49.2),state=bounce((t-48.0)*1.2,{r:170,e:.84,release:300});B.draw(c,{x:960,y:state.y,r:170,sx:state.sx,sy:state.sy,spin:.12+(t-48)*.16});shadow(c,960,790,210,785-state.y);group(c,(1-ss(t,49.0,49.7)),()=>{c.save();c.translate(952,state.y-170-150);c.rotate(.12);const g=c.createLinearGradient(-150,-180,150,160);g.addColorStop(0,'#c5a987');g.addColorStop(1,'#7f624b');c.fillStyle=g;c.beginPath();c.moveTo(-60,-650);c.lineTo(60,-650);c.lineTo(64,-30);c.bezierCurveTo(128,-13,150,35,165,92);c.bezierCurveTo(171,120,153,127,138,107);c.lineTo(109,64);c.lineTo(97,156);c.bezierCurveTo(92,185,72,184,70,157);c.lineTo(62,76);c.lineTo(47,168);c.bezierCurveTo(41,193,21,188,23,161);c.lineTo(25,75);c.lineTo(6,155);c.bezierCurveTo(0,178,-20,173,-15,145);c.lineTo(-9,61);c.bezierCurveTo(-92,47,-86,-27,-60,-60);c.closePath();c.fill();c.restore();});}
function title(fr,t,a,ending=false){if(a<=0)return;const local=ending?t-56.25:t-8.4;fr.g({a},()=>{
fr.text(L('回弹','THE RETURN'),960,ending?380:425,{font:ZH?'serifl':'latinl',size:ZH?176:130,track:ZH?30:12,color:'#e9eee7',a:ss(local,0,.8),glow:12,glowA:.16});
fr.text(L('篮球里面的能量接力','The energy inside a bouncing ball'),960,ending?488:540,{font:ZH?'serifr':'lora',size:ZH?35:34,track:ZH?5:1.0,color:'#adbdc1',a:ss(local,.4,1.3)});
if(ending){fr.text('University of Illinois · Physics Van / 103',960,633,{font:'mono',size:18,color:'#82949b',a:ss(local,.6,1.0)});fr.text('Exploratorium · The Way the Ball Bounces',960,674,{font:'mono',size:18,color:'#82949b',a:ss(local,.7,1.1)});fr.text(L('形变、分子尺度与对比高度均为示意','Deformation, molecular scale and heights are schematic'),960,727,{font:ZH?'sansr':'lora',size:19,color:'#76878e',a:ss(local,.8,1.2)});fr.text('BGM · '+L('开智小曲 (vibe知识大赏)','Kai Zhi Xiao Qu · user-selected recording'),960,773,{font:ZH?'sansr':'mono',size:17,color:'#66777e',a:ss(local,1,1.4)});}
});}
function sub(fr,t){for(const [a,b,zh,en]of SUBS){const op=fade(t,a,b,.35,.27);if(op<.001)continue;fr.text(ZH?zh:en,960,955,{font:ZH?'serifr':'lora',size:ZH?43:40,track:ZH?3.5:.2,color:'#dce2e1',a:op,shadow:.3});}}
VK.film({dur:60,theme:'night',meta:{title:ZH?'回弹':'The Return',drone:0},draw(fr,t){
fr.look.bloom=.22;fr.look.grain=.015;fr.look.bgo={core:.5,stars:.12,tint:0};
fr.look.under=c=>{
group(c,fade(t,0,8.8,.1,.7),()=>opening(c,t));
group(c,fade(t,12.85,26.5,.6,.6),()=>chamber(c,t));
group(c,fade(t,25.9,29.9,.5,.5),()=>{floor(c);B.draw(c,{x:960,y:410,r:185,spin:.35});txt(c,L('弹性能','ELASTIC ENERGY'),960,690,40,'#b4d5d8','center','serif',300);});
group(c,fade(t,29.4,34.1,.5,.5),()=>loss(c,t));
group(c,fade(t,33.6,38.9,.5,.5),()=>sequence(c,t));
group(c,fade(t,38.4,43.6,.5,.5),()=>compare(c,t));
group(c,fade(t,43.1,48.25,.5,.5),()=>pump(c,t));
group(c,fade(t,47.8,53.0,.5,.5),()=>hand(c,t));
group(c,fade(t,52.5,56.75,.5,.5),()=>opening(c,t,true));
};
title(fr,t,fade(t,8.1,13.45,.55,.55));title(fr,t,fade(t,56.25,60,.6,.5),true);
if(t>=13.3&&t<55.9){const marks=t<26?['01',L('藏','STORE')]:t<38.4?['02',L('还','RETURN')]:['03',L('续','CONTINUE')];fr.text(marks.join('  /  '),110,88,{font:'mono',size:17,color:'#7f949b',a:.55,align:'l'});}
sub(fr,t);
for(const when of [1.65,3.65,5.4,16.4,31.2,35.4,37.2,40.3,49.5,54.3])fr.sfx(when,'thud',{gain:.16});
for(const when of [17.6,22.2,43.5])fr.sfx(when,'rise',{gain:.10,dur:.65});
}});
})();
