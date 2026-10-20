export const ARC_INPUT_LIMITS={filesPerMessage:3,fileBytes:2*1024*1024,userBytes:32*1024*1024,imageEdge:2048,textChars:16000} as const;
export type ArcAttachment={id:string;name:string;mimeType:string;size:number;kind:'image'|'document';width?:number;height?:number;truncated?:boolean};
export type ArcLocation={label:string;latitude?:number;longitude?:number;accuracyMeters?:number;capturedAt?:string};
