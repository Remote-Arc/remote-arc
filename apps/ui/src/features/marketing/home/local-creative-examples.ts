type Copy=readonly [string,string];
type Trace={tool:string;input:Record<string,unknown>;output:Copy;working:Copy};
export type LocalCreativeExample={id:'video'|'image';label:Copy;request:Copy;result:Copy;permission:Copy;link:string;traces:readonly Trace[]};
export const LOCAL_CREATIVE_EXAMPLES:readonly LocalCreativeExample[]=[
 {id:'video',label:['Make a video','制作视频'],link:'video-creation#video-gallery',
 request:['“Make a 60-second film about the energy in a bouncing basketball on my computer. Use connected scenes, no voiceover and the BGM I provide. Deliver the MP4 and editable project.”','“在我的电脑上制作一支 60 秒篮球能量科普短片。安排连贯分镜，不要旁白，使用我提供的 BGM，交付 MP4 和可编辑工程。”'],
 result:['The Return is a real 60-second film rendered on a personal computer, with animated cutaways, comparisons and music. Play the finished example below.','《回弹》是在个人电脑上渲染的真实 60 秒成片，包含动态剖面、对比镜头和配乐。可以直接播放下方作品。'],
 permission:['Files + authorized terminal + local video tools','文件 + 已授权终端 + 本地视频工具'],
 traces:[
 {tool:'read_skill',input:{id:'video-creator'},working:['Checking the local video workflow…','正在检查本地视频工作流…'],output:['Local rendering workflow selected · ordinary dependencies prepared when needed','已选择本地渲染流程 · 按需准备普通依赖']},
 {tool:'write_file',input:{path:'~/films/the-return/storyboard.md',mode:'rewrite'},working:['Writing facts, scenes and transitions…','正在编排事实、分镜和镜头衔接…'],output:['Storyboard: impact → compression → recovery → comparison → next dribble','分镜：落地 → 压缩 → 回弹 → 对比 → 下一次运球']},
 {tool:'start_process',input:{cwd:'~/films',command:'python engine/render.py ./the-return',background:true},working:['Rendering the original scenes on your computer…','正在电脑上渲染原创镜头…'],output:['Local render started · checking the background process next','本地渲染已启动 · 接着检查后台进程']},
 {tool:'process_status',input:{process_id:'example-local-film'},working:['Waiting for the render and audio mix…','正在等待渲染与配乐合成…'],output:['Render completed · exit_code: 0','渲染完成 · 退出码：0']},
 {tool:'start_process',input:{cwd:'~/films/the-return',command:'ffprobe -v error -show_format -show_streams final.mp4'},working:['Checking the exported video and reviewing frames…','正在检查导出视频并复查画面…'],output:['MP4 · 60 seconds · 1920 × 1080 · video and audio tracks verified','MP4 · 60 秒 · 1920 × 1080 · 已核验视频与音频轨道']}
 ]},
 {id:'image',label:['Create images','生成图片'],link:'image-studio#image-gallery',
 request:['“Create an original basketball poster and a warm editorial illustration with code on my computer. Export high-resolution PNGs and keep the editable sources.”','“在我的电脑上用代码制作原创篮球海报和暖色编辑插画，导出高清 PNG，并保留可编辑源文件。”'],
 result:['The original poster and illustration are rendered locally as 1200 × 1500 PNGs. Open the references below to explore the actual images and their briefs.','原创海报和插画已在本地渲染为 1200 × 1500 PNG。打开下方参考作品，查看真实图片与创作需求。'],
 permission:['Files + authorized terminal + local drawing tools','文件 + 已授权终端 + 本地绘图工具'],
 traces:[
 {tool:'read_skill',input:{id:'image-studio'},working:['Choosing the local image workflow…','正在选择本地图片创作流程…'],output:['Code graphics selected · Canvas Design and local fonts','已选择代码绘图 · Canvas Design 与本地字体']},
 {tool:'write_file',input:{path:'~/art/poster.mjs',mode:'rewrite'},working:['Drawing the composition, ball geometry and type…','正在绘制构图、篮球几何与字体…'],output:['Original editable drawing source prepared','原创可编辑绘图代码已准备好']},
 {tool:'start_process',input:{cwd:'~/art',command:'node poster.mjs'},working:['Rendering the PNGs on your computer…','正在电脑上渲染 PNG 图片…'],output:['Images exported locally · no image-model download needed for these examples','图片已在本地导出 · 这些示例无需下载绘图模型']},
 {tool:'get_file_info',input:{path:'~/art/court-energy.png'},working:['Checking image dimensions and the finished composition…','正在检查图片尺寸与完成后的构图…'],output:['PNG · 1200 × 1500 · checked alongside the editable source','PNG · 1200 × 1500 · 已检查图片并保留源码']}
 ]}
];
export const findLocalCreative=(id:string)=>LOCAL_CREATIVE_EXAMPLES.find(example=>example.id===id);
