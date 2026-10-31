import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync(new URL('../../apps/ui/src/data/app-directory.json',import.meta.url),'utf8'));
const rows=catalog.apps.map(app=>({app:app.name,category:app.category,tools:app.operationCount,reads:app.operations.filter(op=>op.permission==='read').length,writes:app.operations.filter(op=>op.permission==='write').length,payer:app.payer}));
console.table(rows);console.log(catalog.apps.length+' Apps, '+rows.reduce((n,r)=>n+r.tools,0)+' executable tools, '+catalog.categories.length+' categories. Counts describe implemented native operations; live OAuth/API acceptance is separate.');
