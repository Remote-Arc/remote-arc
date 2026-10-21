export function communityExperience(id:string,tr:(en:string,zh:string)=>string){const names:Record<string,[string,string,string,string]>={
 'community-frontend-design':['Frontend design','专业界面设计','Anthropic’s interface design skill: visual direction, typography, layout and production code.','Anthropic 的界面设计技能：视觉方向、字体排版、布局与可用代码。'],
 'community-webapp-testing':['Web app testing','网页应用测试','Real Playwright tests with screenshots, browser logs and the bundled server helper.','使用真实 Playwright 测试、截图、浏览器日志和随包服务启动脚本。'],
 'community-playwright':['Browser automation','浏览器操作与自动化','Microsoft’s Playwright CLI skill for navigating pages, interacting with elements and capturing evidence.','Microsoft Playwright CLI 技能：浏览网页、操作元素、截图并保留证据。'],
 'community-react-best-practices':['React performance','React 性能优化','Vercel engineering rules for real React and Next.js projects, with detailed references.','Vercel 工程团队的 React／Next.js 优化规则，附完整参考资料。'],
 'community-web-design-guidelines':['Web interface review','界面质量与无障碍检查','Review keyboard behavior, accessibility, forms, interactions and interface quality.','检查键盘操作、无障碍、表单、交互细节和界面质量。'],
 'community-mcp-builder':['MCP server builder','MCP 工具与集成开发','Anthropic’s MCP development package with examples, evaluation scripts and implementation references.','Anthropic MCP 开发技能包，包含示例、评估脚本与实现资料。'],
 'community-polars':['Data analysis with Polars','数据清洗与分析','Analyze actual data with Polars: joins, aggregation, lazy queries and export.','用 Polars 处理真实数据：清洗、关联、聚合、惰性查询和导出。'],
 'community-matplotlib':['Charts with Matplotlib','数据图表与可视化','Build and export charts from real data with Matplotlib and bundled technical references.','基于真实数据制作并导出 Matplotlib 图表，附技术参考资料。'],
};const item=names[id];return item?{title:tr(item[0],item[1]),description:tr(item[2],item[3])}:undefined;}
