/** Layout placeholders are decorative; the status label stays available to
 * assistive technology. No invented balances, progress percentages or results. */
export function WorkspaceLoading({label,variant='rows'}:{label:string;variant?:'rows'|'cards'|'compact'}){
 return <div className={'workspaceLoading workspaceLoading--'+variant} role="status" aria-live="polite" aria-busy="true"><span className="workspaceLoadingLabel">{label}</span><div className="workspaceLoadingShapes" aria-hidden="true">{Array.from({length:variant==='compact'?2:3},(_,index)=><div className="workspaceLoadingShape" key={index}><i/><i/><i/></div>)}</div></div>;
}
