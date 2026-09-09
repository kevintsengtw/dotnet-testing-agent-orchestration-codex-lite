// Presentation only; preserve the collected runtime fields in the evidence.
export function usageRows(report, captures = []) {
  const groups = new Map();
  for (const request of report.selectedRequests) {
    if (!groups.has(request.threadId)) groups.set(request.threadId, []);
    groups.get(request.threadId).push(request);
  }
  const row = (label, requests, threadId = null) => {
    const sum = field => requests.length && requests.every(r => Number.isSafeInteger(r.usage?.[field]))
      ? requests.reduce((n, r) => n + r.usage[field], 0) : null;
    const input = sum('input_tokens'), cached = sum('cached_input_tokens');
    return { label, threadId, uncached: input !== null && cached !== null && input >= cached ? input - cached : null,
      cached, output: sum('output_tokens'), total: sum('total_tokens'), requests: requests.length };
  };
  return [...[...groups].sort(([a], [b]) => a === report.rootThreadId ? -1 : b === report.rootThreadId ? 1 : a.localeCompare(b))
    .map(([id, requests]) => row(id === report.rootThreadId ? '主代理' :
      `子代理 ${captures.find(c => c.metadata.id === id)?.metadata.agentPath || id}`, requests, id)),
    row('整個 workflow 合計', report.selectedRequests)];
}

export function creditGroups(report,captures){
 const groups=new Map();
 for(const r of report.selectedRequests){
  const c=captures.find(c=>c.metadata.id===r.threadId);
  const event=c?.events.find(e=>e.type==='token_usage_record'&&e.responseId===r.responseId);
  const ctx=c?.events.filter(e=>e.type==='turn_context'&&e.turnId===r.turnId&&e.line<event?.line).at(-1);
  const settings={model:ctx?.model??null,effort:ctx?.effort??null,serviceTier:ctx?.serviceTier??null};
  const key=JSON.stringify([r.threadId,settings]);
  if(!groups.has(key))groups.set(key,{settings,requests:[]});groups.get(key).requests.push(r);
 }
 return [...groups.values()].map(g=>({...usageRows({...report,selectedRequests:g.requests},captures)[0],...g.settings,settingsSource:'runtime turn_context'}));
}
