/** A user-selected verification scope, never a model-generated permission grant. */
export type ArcVerification =
 | {kind:'inbox';connectionId:string;limit:number;query?:string}
 | {kind:'github_issue';connectionId:string;repo:string;title:string;body:string}
 | {kind:'deployment';connectionId:string;deploymentId:string;teamId?:string};
export type ArcReceipt = {
 version:1;status:'completed'|'partial'|'pending_verification'|'failed';
 scope:ArcVerification|null;
 checks:{code:string;status:'passed'|'pending'|'failed';evidenceIds:string[]}[];
 evidence:{id:string;tool:string;status:string;observedAt:string;resource?:string;url?:string}[];
 changes:{evidenceId:string;operation:string;target:string}[];
 next:'none'|'inspect_before_retry'|'review_remaining'|'verify_result';
 error:string|null;
};
