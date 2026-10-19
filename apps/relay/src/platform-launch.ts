export type PlatformLaunchEnv={ARC_PLATFORM_ENABLED?:string;ARC_EMERGENCY_PAUSE?:string;ARC_CHAT_ENABLED?:string;ARC_CREDITS_ENABLED?:string;ARC_BILLING_ENABLED?:string};
// Owner enables the platform Secret after credential setup. Ordinary deploys retain it.
// Emergency pause always wins and leaves Connect available.
export const arcEnabled=(env:PlatformLaunchEnv)=>env.ARC_EMERGENCY_PAUSE!=='1'&&(env.ARC_PLATFORM_ENABLED==='1'||env.ARC_CHAT_ENABLED==='1');
export const creditsEnabled=(env:PlatformLaunchEnv)=>env.ARC_PLATFORM_ENABLED==='1'||env.ARC_CREDITS_ENABLED==='1';
export const billingEnabled=(env:PlatformLaunchEnv)=>env.ARC_PLATFORM_ENABLED==='1'||env.ARC_BILLING_ENABLED==='1';
