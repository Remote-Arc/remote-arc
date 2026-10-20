import type {ArcEmployeeScope} from '@remotearc/protocol';
export type ArcDispatchData={goal:string;instructions:string;sourceRunId:string;sourceMessageId:string;sourceEmployeeId:string|null;scope:ArcEmployeeScope|null;depth:number;rootId:string;parentId:string|null};
export const arcDispatchContext=(userId:string,id:string)=>`arc-dispatch:${userId}:${id}`;
