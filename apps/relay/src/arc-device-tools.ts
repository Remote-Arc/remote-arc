import {z} from 'zod';
const path=z.string().min(1).max(1000),processId=z.string().min(1).max(160);
/** Portable file/process contracts shared with the public computer-tool semantics. */
export const arcDeviceSchemas:Record<string,z.ZodType>={
 list_directory:z.object({path,depth:z.number().int().min(1).max(6).optional()}).strict(),
 read_file:z.object({path,offset:z.number().int().nonnegative().optional(),length:z.number().int().min(1).max(1200).optional()}).strict(),
 get_file_info:z.object({path}).strict(),
 write_file:z.object({path,content:z.string().max(200000),mode:z.enum(['rewrite','append']).optional()}).strict(),
 edit_block:z.object({file_path:path,old_string:z.string().max(200000),new_string:z.string().max(200000),expected_replacements:z.number().int().min(1).max(20).optional()}).strict(),
 start_process:z.object({command:z.string().min(1).max(4000),cwd:z.string().max(500).optional(),timeout_ms:z.number().int().min(1).max(120000).optional(),background:z.boolean().optional()}).strict(),
 process_status:z.object({process_id:processId,wait_ms:z.number().int().nonnegative().optional(),until_text:z.string().max(500).optional()}).strict(),
 process_output:z.object({process_id:processId,cursor:z.number().int().nonnegative().optional(),max_bytes:z.number().int().min(1).max(262144).optional()}).strict(),
 stop_process:z.object({process_id:processId}).strict(),
};
export function arcDeviceInputError(args:{tool:string;arguments:unknown}){const schema=arcDeviceSchemas[args.tool];if(!schema)return null;const parsed=schema.safeParse(args.arguments);return parsed.success?null:{code:'ARC_TOOL_ARGUMENTS_INVALID',issues:parsed.error.issues.map(issue=>({path:['arguments',...issue.path],message:issue.message})),inputSchema:z.toJSONSchema(schema),guidance:'Correct the inner device_tool.arguments object; no device request was made.'};}
