import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'./tests/site',
 outputDir:'./work/site-test-results',
 timeout:30000,
 expect:{timeout:8000},
 fullyParallel:true,
 workers:process.env.CI?2:3,
 forbidOnly:Boolean(process.env.CI),
 retries:0,
 reporter:[['list'],['html',{outputFolder:'work/site-test-report',open:'never'}]],
 use:{baseURL:'http://127.0.0.1:4331',reducedMotion:'reduce',trace:'retain-on-failure',screenshot:'only-on-failure',
  ...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})},
 projects:[
  {name:'desktop-en-light',metadata:{language:'en',theme:'light'},use:{viewport:{width:1440,height:1000}}},
  {name:'mobile-zh-dark',metadata:{language:'zh',theme:'dark'},use:{viewport:{width:390,height:844}}},
 ],
 webServer:{command:'pnpm --filter @remotearc/ui dev --host 127.0.0.1 --port 4331 --strictPort',url:'http://127.0.0.1:4331/api/runtime-config',reuseExistingServer:!process.env.CI,env:{VITE_UI_PREVIEW:'1'},timeout:60000},
});
