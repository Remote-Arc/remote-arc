import type {Appearance,CssFontSource} from '@stripe/stripe-js';

/** Stripe renders its fields in its own iframe, so it cannot read our CSS variables.
 * Resolve the active theme tokens to plain rgba() values Stripe accepts; a 1x1
 * canvas normalises color-mix(), oklch() and friends to sRGB. */
function tokenColor(scope:HTMLElement,token:string,fallback:string){
 const probe=document.createElement('span');probe.style.color=`var(${token},${fallback})`;probe.style.display='none';scope.appendChild(probe);
 const value=getComputedStyle(probe).color;probe.remove();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)return value||fallback;
 context.clearRect(0,0,1,1);context.fillStyle=value||fallback;context.fillRect(0,0,1,1);
 const [r,g,b,a]=context.getImageData(0,0,1,1).data;return `rgba(${r}, ${g}, ${b}, ${Math.round(a!/255*100)/100})`;
}
const dark=()=>document.documentElement.dataset.theme==='dark';
/** Inter is served cross-origin by Google Fonts so Stripe's iframe can load it. */
export const STRIPE_FONTS:CssFontSource[]=[{cssSrc:'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'}];
export function stripeAppearance(scope:HTMLElement):Appearance{
 const text=tokenColor(scope,'--rs-text',dark()?'#f4f4f5':'#18181b'),muted=tokenColor(scope,'--rs-secondary',dark()?'#a1a1aa':'#5f5f69');
 const surface=tokenColor(scope,'--rs-surface',dark()?'#18181b':'#ffffff'),field=tokenColor(scope,'--rs-bg',dark()?'#0f0f11':'#f7f7f8');
 const border=tokenColor(scope,'--rs-border',dark()?'#2e2e33':'#e4e4e7'),accent=tokenColor(scope,'--dash-accent',dark()?'#f4f4f5':'#18181b');
 return{
  theme:dark()?'night':'stripe',
  variables:{fontFamily:'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',fontSizeBase:'15px',fontWeightNormal:'400',fontWeightMedium:'500',
   colorPrimary:accent,colorBackground:surface,colorText:text,colorTextSecondary:muted,colorTextPlaceholder:muted,colorIcon:muted,colorDanger:dark()?'#ff6b6b':'#d92d20',
   borderRadius:'10px',spacingUnit:'4px',gridRowSpacing:'16px',gridColumnSpacing:'12px',focusBoxShadow:'none',focusOutline:'none'},
  rules:{
   '.Label':{color:muted,fontWeight:'500',fontSize:'13px',marginBottom:'8px'},
   '.Input':{backgroundColor:field,border:`1px solid ${border}`,boxShadow:'none',padding:'12px 14px'},
   '.Input:hover':{borderColor:muted},
   '.Input:focus':{borderColor:accent,boxShadow:`0 0 0 1px ${accent}`},
   '.Input--invalid':{boxShadow:'none'},
   '.Tab':{backgroundColor:field,border:`1px solid ${border}`,boxShadow:'none'},
   '.Tab:hover':{borderColor:muted,color:text},
   '.Tab--selected':{backgroundColor:surface,borderColor:accent,boxShadow:`0 0 0 1px ${accent}`},
   '.Block':{backgroundColor:field,border:`1px solid ${border}`,boxShadow:'none'},
  },
 };
}
/** Re-theme mounted Stripe fields when the dashboard switches light/dark. */
export function onThemeChange(apply:()=>void){
 const observer=new MutationObserver(apply);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect();
}
