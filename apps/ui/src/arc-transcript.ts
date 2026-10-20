import type {ChatMessage} from './use-arc-chat.js';
/** Keep the audit trace in the API/activity view; the conversation shows only
 * user messages and final answers, including legacy chat histories. */
export function arcTranscript(messages:ChatMessage[]){
 return messages.filter(message=>message.role!=='tool'&&!(message.role==='assistant'&&message.id.endsWith(':intent'))).map(message=>({kind:'message' as const,message}));
}