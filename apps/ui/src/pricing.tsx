import {WorkspaceLoading} from './workspace-loading.js';
import {useI18n} from './i18n.js';
import './pricing.css';
import {usePlatformCatalog} from './use-platform-catalog.js';
import {ArcPublicPricing} from './arc-public-pricing.js';

export function PricingContent({startHref,usageHref}:{startHref:string;usageHref:string;signedIn:boolean;currentPlan:'free'|'connect'|'plus'|null}){
 const {tr}=useI18n(),catalog=usePlatformCatalog();
 if(catalog)return <ArcPublicPricing catalog={catalog} startHref={startHref} usageHref={usageHref}/>;
 return <main className="pricingContent"><header className="pricingIntro"><h1>{tr('A plan for your work.','适合你的工作方式。')}</h1><WorkspaceLoading label={tr('Loading current prices and allowances…','正在获取最新价格与额度…')} variant="cards"/><a className="primaryButton" href={usageHref}>{tr('View plans in your workspace','前往工作空间查看套餐')} →</a></header></main>;
}
