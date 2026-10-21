import type {ArcEmployeeScope} from '@remotearc/protocol';
import type {ArcWorkingContext} from './arc-working-context.js';
export type ArcDispatchData={workingContext?:ArcWorkingContext;goal:string;instructions:string;sourceRunId:string;sourceMessageId:string;sourceEmployeeId:string|null;scope:ArcEmployeeScope|null;depth:number;rootId:string;parentId:string|null};
export const arcDispatchContext=(userId:string,id:string)=>`arc-dispatch:${userId}:${id}`;
