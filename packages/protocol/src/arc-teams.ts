export type ArcEmployeeAvatar={kind:'initials';color:string}|{kind:'emoji';value:string;color:string}|{kind:'image';dataUrl:string};
export type ArcEmployeeScope={appMode:'none'|'read'|'write';connectionIds:string[];deviceIds:string[];deviceTools:string[];skillIds:string[];delegationTeamIds?:string[]};
export type ArcEmployeeProfile={name:string;responsibility:string;instructions:string;modelId:string;avatar:ArcEmployeeAvatar;scope:ArcEmployeeScope};
export type ArcEmployee=ArcEmployeeProfile&{id:string;version:number;status:'active'|'archived';createdAt:string;updatedAt:string};
export type ArcTeamProfile={name:string;purpose:string;employeeIds:string[];coordinatorId:string|null};
export type ArcTeam=ArcTeamProfile&{id:string;version:number;status:'active'|'archived';createdAt:string;updatedAt:string};
export type ArcTeamRoom={id:string;kind:'direct'|'team'|'group';name:string;teamId:string|null;employeeIds:string[];createdAt:string;updatedAt:string};
export type ArcTeamEvent={id:string;type:string;employeeId:string|null;teamId:string|null;roomId:string|null;referenceId:string|null;details:Record<string,unknown>;createdAt:string};

export type ArcEmployeeDraft={id:string;sourceRunId:string;profile:ArcEmployeeProfile;status:'pending'|'confirmed'|'cancelled'|'expired';expiresAt:string;employeeId:string|null};
export type ArcDelegationProgress={id:string;sourceRunId:string;status:'queued'|'working'|'completed'|'failed'|'cancelled'|'paused'|'unknown';updatedAt:string;members:{id:string;employeeId:string;name:string;avatar:ArcEmployeeAvatar;status:'queued'|'working'|'completed'|'failed'|'cancelled'|'unknown';step:number;activity:string;updatedAt:string}[]};
