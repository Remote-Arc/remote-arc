/** Task-oriented entry points for the packaged local skills. */
export const SKILL_USE_CASES = [
  {
    "slug": "video-analysis",
    "category": {
      "en": "MEDIA INTELLIGENCE",
      "zh": "视频理解"
    },
    "title": {
      "en": "Understand videos with source timestamps",
      "zh": "分析视频，追溯原片证据"
    },
    "intro": {
      "en": "Compare release videos, explain demonstrations and find technical details. Start with captions, then retrieve only the audio or frames needed.",
      "zh": "对比发布会、解析演示、查找技术细节。先读字幕，需要时再提取音频或画面。"
    },
    "prompt": {
      "en": "Analyze the public video links I provide on my connected computer. Read Media Intelligence, retrieve metadata and captions first, and compare concrete features and technical differences with links to the original timestamps. Download only bounded audio or video sections when evidence is missing; inspect sampled frames for visual claims. Deliver a cited Markdown report and verified evidence files, distinguish source claims from inference, and disclose unavailable or unverified portions.",
      "zh": "在已连接电脑上分析我提供的公开视频链接。读取 Media Intelligence，先获取元数据和字幕，比较具体功能及技术差异，附原视频时间点。缺少证据时才下载有界音频或视频片段；涉及画面结论时查看实际抽帧。交付带引用的 Markdown 报告和校验后的证据文件，区分原文主张与分析推断，说明无法获取或未核实部分。"
    },
    "requires": {
      "en": "Public individual video links, Python 3.11+, Node and an authorized writable workspace on a connected computer.",
      "zh": "单条公开视频链接、Python 3.11+、Node，以及已连接电脑上获授权的可写工作目录。"
    },
    "boundary": {
      "en": "Retrieval and local transcription run on the device; selected evidence enters your AI's model context. Captions can be wrong and frames are samples. Protected or bot-blocked sources may be unavailable. No account cookies.",
      "zh": "获取和本地转录在设备执行，选定证据会进入 AI 的模型上下文。字幕可能有误，画面仅为采样；受保护或触发反爬的视频可能无法访问。不读取账号 Cookie。"
    },
    "steps": [
      {
        "en": "Retrieve captions and locate relevant original-video timestamps.",
        "zh": "优先读取字幕，定位原视频相关时间点。"
      },
      {
        "en": "Inspect missing audio/visual evidence and verify report citations.",
        "zh": "按需补充音频或画面证据，核验报告引用。"
      }
    ],
    "proof": {
      "en": "A cited report, timed transcript or sampled frames, evidence hashes, covered intervals and stated limitations.",
      "zh": "带引用的报告、时间轴文字或抽帧、证据哈希、覆盖区间及已知限制。"
    },
    "skillIds": [
      "media-intelligence"
    ],
    "art": "research",
    "format": "REPORT",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "video-creation",
    "category": {
      "en": "VIDEO & MOTION",
      "zh": "视频与动画"
    },
    "title": {
      "en": "Create a finished video",
      "zh": "制作视频与动态图形"
    },
    "intro": {
      "en": "Turn an idea into a real film: sports edits, explainers, product launches, animated charts or maps. Find inspiration in the finished video gallery.",
      "zh": "把想法做成真实成片：运动短片、科普、产品宣传、动态图表与地图，从作品画廊寻找灵感。"
    },
    "prompt": {
      "en": "Make a finished video on my connected computer. Infer the brief from my topic, confirm duration and format where missing, read the video skill and automatically prepare the ordinary local rendering dependencies. Create the film, inspect representative frames and sound, and deliver an MP4 plus editable sources. Ask before installing Qwen TTS or ACE-Step.",
      "zh": "在已连接电脑上帮我制作一支成片。根据主题确定创意，只补齐缺少的时长、画幅等信息；读取视频技能，按需自动准备普通本地渲染依赖。生成视频、抽检画面与声音，交付 MP4 和可编辑工程。安装 Qwen TTS 或 ACE-Step 前先确认。"
    },
    "requires": {
      "en": "An authorized computer, a writable project folder and space for local rendering tools.",
      "zh": "获授权电脑、可写项目目录，以及本地渲染工具所需空间。"
    },
    "boundary": {
      "en": "Rendering runs on the selected device. Ordinary Remotion/HyperFrames/OpenFilm, FFmpeg, map and base Whisper setup is automatic within existing permissions; large voice/music model installation needs confirmation.",
      "zh": "渲染在所选设备完成。Remotion/HyperFrames/OpenFilm、FFmpeg、地图及基础 Whisper 按现有权限自动准备；大型语音、音乐模型安装前确认。"
    },
    "steps": [
      {
        "en": "Set the brief and gather owned assets or create original code graphics.",
        "zh": "明确主题与画幅，整理自有素材或创作代码图形。"
      },
      {
        "en": "Render locally, inspect frames and audio, then check the actual output.",
        "zh": "本地渲染，抽检画面与声音，并核验实际文件。"
      }
    ],
    "proof": {
      "en": "A playable MP4, editable project files, measured duration/resolution and the checks that ran.",
      "zh": "可播放 MP4、可编辑工程、实测时长和分辨率，以及已执行的检查。"
    },
    "skillIds": [
  "video-creator",
  "remotion-video",
  "hyperframes-video",
  "openfilm-video",
  "manim-video",
  "blender-mcp",
  "map-creator",
  "community-vibe-knowledge-film"
],
    "art": "video",
    "format": "MP4",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "audio-transcription",
    "category": {
      "en": "AUDIO & SUBTITLES",
      "zh": "录音与字幕"
    },
    "title": {
      "en": "Turn recordings into text and subtitles",
      "zh": "录音转文字与字幕"
    },
    "intro": {
      "en": "Transcribe meetings, interviews, lectures and video audio into readable text and timed SRT/VTT files on your computer.",
      "zh": "把会议、访谈、课堂录音或视频音轨，在本机转成可阅读文字及 SRT/VTT 时间轴字幕。"
    },
    "prompt": {
      "en": "Transcribe the recording I choose on my connected computer. Read the transcription skill, automatically prepare local whisper.cpp, FFmpeg and the base multilingual model if missing, and keep the audio on this device. Deliver a readable TXT/Markdown transcript and SRT/VTT subtitles. Review recognition samples and flag unclear speech; create meeting notes only if requested.",
      "zh": "转录我在已连接电脑上选定的录音。读取转录技能，缺少时自动准备本地 whisper.cpp、FFmpeg 和基础多语言模型，音频留在该设备。交付 TXT/Markdown 文字稿及 SRT/VTT 字幕；抽样核对识别结果，标出听不清的内容，需要会议纪要时再按要求整理。"
    },
    "requires": {
      "en": "The source recording/video, authorized file access and enough space for the local Whisper base model.",
      "zh": "源录音或视频、获授权文件访问，以及本地 Whisper 基础模型所需空间。"
    },
    "boundary": {
      "en": "Recognition can make mistakes. Do not invent dialogue, speaker names or decisions; larger recognition models need size-aware download consent.",
      "zh": "语音识别可能出错，不编造对话、说话人身份或会议决定；下载更大识别模型前说明体积并确认。"
    },
    "steps": [
      {
        "en": "Inspect the audio track, language and length; extract suitable local audio.",
        "zh": "检查音轨、语言与时长，提取适合识别的本地音频。"
      },
      {
        "en": "Transcribe, review samples and validate subtitle times before delivery.",
        "zh": "完成识别、抽样校对，并检查字幕时间范围。"
      }
    ],
    "proof": {
      "en": "Readable transcript and actual subtitle files, model used, source duration and uncertain passages.",
      "zh": "可阅读文字稿、真实字幕文件、所用模型、原音频时长及不确定片段。"
    },
    "skillIds": [
      "transcribe-subtitles"
    ],
    "art": "audio",
    "format": "TXT · SRT",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "word-documents",
    "category": {
      "en": "WORD DOCUMENTS",
      "zh": "Word 文档"
    },
    "title": {
      "en": "Create and edit Word documents",
      "zh": "制作与编辑 Word 文档"
    },
    "intro": {
      "en": "Turn notes into reports, proposals, letters or resumes with editable headings, tables and consistent styles.",
      "zh": "把笔记整理为报告、方案、信函或简历，保留可编辑标题、表格与一致样式。"
    },
    "prompt": {
      "en": "Create an editable Word document from the source files I select. Confirm the audience and required structure, read the Word skill, use the connected computer's authoring tools, and save a DOCX. Reopen it to inspect content and styles, render pages when supported, and report any layout checks that could not run.",
      "zh": "根据我选择的源文件制作可编辑 Word 文档。明确受众与结构，读取 Word 技能，使用已连接电脑上的文档工具保存 DOCX。重新读取检查内容和样式，环境支持时渲染页面，并说明未完成的版式检查。"
    },
    "requires": {
      "en": "Source material, a local DOCX authoring library and rendering software for visual checks.",
      "zh": "源材料、本地 DOCX 生成库；视觉验收另需可用渲染软件。"
    },
    "boundary": {
      "en": "Creating a DOCX and verifying its rendered layout are separate checks. Missing libraries or fonts must be reported.",
      "zh": "生成 DOCX 与核验渲染版式是不同检查；缺少文档库或字体时明确说明。"
    },
    "steps": [
      {
        "en": "Arrange the content with editable styles and tables.",
        "zh": "使用可编辑样式与表格组织内容。"
      },
      {
        "en": "Reopen and inspect the file, then review rendered pages when available.",
        "zh": "重新读取文件，环境具备时检查实际页面。"
      }
    ],
    "proof": {
      "en": "The DOCX, checked headings/tables and a clear statement of visual review.",
      "zh": "DOCX 文件、已核对标题与表格，以及视觉验收情况。"
    },
    "skillIds": [
      "arc-docx"
    ],
    "art": "document",
    "format": "DOCX",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "pdf-workflows",
    "category": {
      "en": "PDF WORKFLOWS",
      "zh": "PDF 处理"
    },
    "title": {
      "en": "Read, combine and create PDFs",
      "zh": "阅读、整理与生成 PDF"
    },
    "intro": {
      "en": "Extract useful text, combine or reorder pages, and turn source material into a readable PDF.",
      "zh": "提取有效文本、合并或重排页面，也可把源材料整理成易读 PDF。"
    },
    "prompt": {
      "en": "Help with the PDF files I select. Confirm whether I need extraction, page organization or a new document. Read the PDF skill, preserve originals, perform the requested work locally, and verify page count, order and readable output. Use OCR only when a compatible local engine is available and needed.",
      "zh": "处理我选择的 PDF。先明确需要提取内容、整理页面，还是生成新文档；读取 PDF 技能，保留原文件，在本机完成工作，核对页数、顺序和可读内容。确有需要且本地引擎可用时再执行 OCR。"
    },
    "requires": {
      "en": "Readable source files and the local PDF libraries; OCR/rendering may require separate engines.",
      "zh": "可读源文件与本地 PDF 工具库；OCR、渲染可能另需引擎。"
    },
    "boundary": {
      "en": "Scanned pages may need OCR. Encryption, inaccessible content and unverified visual layout remain explicit limitations.",
      "zh": "扫描页可能需要 OCR；加密、不可访问内容和未核验的视觉版式会明确说明。"
    },
    "steps": [
      {
        "en": "Inspect page structure and choose the required transformation.",
        "zh": "检查页面结构并确定处理方式。"
      },
      {
        "en": "Verify the saved PDF's page sequence and content.",
        "zh": "核对生成 PDF 的页面顺序和内容。"
      }
    ],
    "proof": {
      "en": "The processed PDF or extracted text, with page checks and limitations.",
      "zh": "处理后的 PDF 或提取文本，以及页面检查和限制。"
    },
    "skillIds": [
      "arc-pdf"
    ],
    "art": "pdf",
    "format": "PDF",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "image-studio",
    "category": {
      "en": "IMAGE STUDIO",
      "zh": "图片创作"
    },
    "title": {
      "en": "Create images and code-driven graphics",
      "zh": "图片创作与代码绘图"
    },
    "intro": {
      "en": "Draw posters, covers, editorial illustrations and generative art with local code, or use an available local image model for synthesis and editing.",
      "zh": "用本地代码绘制海报、封面、编辑插画与生成艺术，也可通过已有本地图片模型完成生成和编辑。"
    },
    "prompt": {
      "en": "Create an original image on my connected computer. For posters, graphic illustration or generative art, read Canvas Design or Algorithmic Art and render locally without an image model. Keep editable code and seeds, inspect the actual PNG, and deliver the image. For photographic synthesis or edits, check my local ComfyUI backend and model first; ask before downloading weights.",
      "zh": "在已连接电脑上制作原创图片。海报、图形插画或生成艺术优先读取 Canvas Design 或 Algorithmic Art，用本地代码渲染，无需绘图模型。保留可编辑代码与种子，检查实际 PNG 后交付。照片级生成或图片编辑先检查本地 ComfyUI 和模型，下载权重前确认。"
    },
    "requires": {
      "en": "For code graphics: a local Canvas/Python renderer or p5.js and a browser. Model-based images additionally need a configured local ComfyUI backend and suitable weights.",
      "zh": "代码绘图需要本地 Canvas/Python 渲染器，或 p5.js 与浏览器；模型生图另需可用本地 ComfyUI 后端和适合的模型。"
    },
    "boundary": {
      "en": "Code graphics use a local renderer and need no image model. Photographic synthesis needs a configured local model; downloads and paid providers retain their own authorization.",
      "zh": "代码绘图无需图片模型；照片级生图另需配置本地模型，模型下载和付费服务各自遵循授权。"
    },
    "steps": [
      {
        "en": "Choose code graphics or an available local model, then confirm dimensions, text and source images.",
        "zh": "选择代码绘图或已有本地模型，检查尺寸、文字与源图片。"
      },
      {
        "en": "Generate/edit locally and inspect the resulting file.",
        "zh": "本地生成或编辑，并检查输出图片。"
      }
    ],
    "proof": {
      "en": "Actual image files, dimensions, editable code/seeds where applicable and visible quality checks.",
      "zh": "实际图片文件、尺寸、适用时的可编辑代码与种子，以及画面质量检查。"
    },
    "skillIds": [
      "image-studio",
      "blender-mcp",
      "community-canvas-design",
      "community-algorithmic-art"
    ],
    "art": "image",
    "format": "PNG",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "website-building",
    "category": {
      "en": "WEBSITE & DESIGN",
      "zh": "网站与设计"
    },
    "title": {
      "en": "Build a website or landing page",
      "zh": "制作网站与落地页"
    },
    "intro": {
      "en": "Turn a brief into a responsive page with a coherent visual style, usable interactions and editable source.",
      "zh": "把需求做成响应式页面，统一视觉风格、完成交互并交付可编辑源码。"
    },
    "prompt": {
      "en": "Build the website or landing page I describe in my chosen project. Read the relevant design and framework skills, reuse the existing stack and brand, implement responsive behavior, and test keyboard interactions and representative screen sizes. Show a working preview and source; publish only to the destination I authorize.",
      "zh": "在我选择的项目中制作所描述的网站或落地页。读取相关设计与框架技能，沿用已有技术栈和品牌，完成响应式交互，检查键盘操作和代表性屏幕尺寸。提供可用预览与源码，只发布到我授权的目标。"
    },
    "requires": {
      "en": "A project workspace, source/brand assets and the installed web toolchain.",
      "zh": "项目工作区、源材料或品牌素材，以及本地网站工具链。"
    },
    "boundary": {
      "en": "A preview is distinct from a published site. External services, account access and publishing retain their own authorization.",
      "zh": "预览与正式发布不同；外部服务、账号访问和发布各自遵循授权。"
    },
    "steps": [
      {
        "en": "Design and implement within the existing project.",
        "zh": "在现有项目中完成设计与实现。"
      },
      {
        "en": "Check responsive layout, interactions and the working preview.",
        "zh": "检查响应式布局、交互与可用预览。"
      }
    ],
    "proof": {
      "en": "Editable source, working preview and the relevant browser/build results.",
      "zh": "可编辑源码、工作预览及相关浏览器与构建结果。"
    },
    "skillIds": [
      "community-frontend-design",
      "community-react-best-practices",
      "community-web-design-guidelines"
    ],
    "art": "design",
    "format": "WEB",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "data-visualization",
    "category": {
      "en": "CHARTS & FIGURES",
      "zh": "图表与可视化"
    },
    "title": {
      "en": "Turn data into clear charts",
      "zh": "把数据做成清晰图表"
    },
    "intro": {
      "en": "Create charts, dashboards and exportable figures with readable labels and appropriate scales.",
      "zh": "制作标签清楚、比例合适的图表、看板与可导出研究图。"
    },
    "prompt": {
      "en": "Make charts from the dataset I select. Read the visualization skills, inspect units and missing values, choose chart types that fit the question, and generate actual export files. Verify the plotted values, labels, scales and any uncertainty; save editable plotting source.",
      "zh": "根据我选择的数据制作图表。读取可视化技能，检查单位和缺失值，按问题选择合适图形，生成实际导出文件。核对绘图数值、标签、比例与不确定性，并保存可编辑绘图源码。"
    },
    "requires": {
      "en": "A dataset and compatible local plotting libraries.",
      "zh": "数据集与兼容的本地绘图库。"
    },
    "boundary": {
      "en": "A polished chart must still reflect the source data. Clearly label example data and statistical uncertainty.",
      "zh": "美观图表仍须忠于源数据，明确标注演示数据与统计不确定性。"
    },
    "steps": [
      {
        "en": "Inspect and prepare the data for the chosen question.",
        "zh": "检查并整理回答问题所需的数据。"
      },
      {
        "en": "Plot, export and reconcile values with the source.",
        "zh": "绘图、导出，并与源数据核对数值。"
      }
    ],
    "proof": {
      "en": "Charts in requested formats, plotting source and value/label checks.",
      "zh": "所需格式的图表、绘图源码及数值和标签检查。"
    },
    "skillIds": [
  "community-matplotlib",
  "community-seaborn",
  "community-a-stock-data"
],
    "art": "chart",
    "format": "SVG · PNG",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "statistical-analysis",
    "category": {
      "en": "STATISTICS",
      "zh": "统计分析"
    },
    "title": {
      "en": "Check a hypothesis with evidence",
      "zh": "用数据检验假设"
    },
    "intro": {
      "en": "Explore distributions, compare groups and report statistical results with assumptions and uncertainty.",
      "zh": "探索分布、比较组间差异，并说明统计结果的假设与不确定性。"
    },
    "prompt": {
      "en": "Analyze the statistical question I describe using my dataset. Read the statistics skill, inspect sampling and data quality, choose suitable tests with their assumptions, and report effect sizes and uncertainty alongside results. Save the analysis and reproducible source, and distinguish association from causation.",
      "zh": "用我的数据分析所描述的统计问题。读取统计技能，检查抽样与数据质量，说明检验选择及假设，同时报告效应量和不确定性。保存结果与可复现源码，区分相关与因果。"
    },
    "requires": {
      "en": "A suitable dataset, a clear question and local statistical libraries.",
      "zh": "合适数据集、明确问题与本地统计工具库。"
    },
    "boundary": {
      "en": "Statistical significance does not prove practical importance or causation. Unsupported assumptions must be flagged.",
      "zh": "统计显著不等于实际重要或因果成立，不能满足的假设会明确标出。"
    },
    "steps": [
      {
        "en": "Inspect data quality, sampling and assumptions.",
        "zh": "检查数据质量、抽样和假设。"
      },
      {
        "en": "Run the analysis and report estimates with uncertainty.",
        "zh": "执行分析，并报告估计与不确定性。"
      }
    ],
    "proof": {
      "en": "A reproducible report with test choices, estimates and limitations.",
      "zh": "包含检验选择、估计结果与限制的可复现报告。"
    },
    "skillIds": [
      "community-statistical-analysis"
    ],
    "art": "statistics",
    "format": "ANALYSIS",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "machine-learning",
    "category": {
      "en": "MACHINE LEARNING",
      "zh": "机器学习"
    },
    "title": {
      "en": "Train and evaluate a small model",
      "zh": "训练与评估机器学习模型"
    },
    "intro": {
      "en": "Build a local classification or regression workflow with a baseline and an independent evaluation.",
      "zh": "为分类或回归建立本地流程，包含基线模型与独立评估。"
    },
    "prompt": {
      "en": "Build a machine-learning baseline from the dataset I provide. Read the scikit-learn skill, confirm the target and evaluation metric, split data before fitting preprocessing, and avoid leakage. Train an appropriate baseline, evaluate it on held-out data and save reproducible code with the actual metrics and limitations.",
      "zh": "根据我提供的数据建立机器学习基线。读取 scikit-learn 技能，明确目标和评价指标，在预处理拟合前划分数据，避免信息泄漏。训练合适的基线，在留出数据上评估，保存可复现代码、实际指标和限制。"
    },
    "requires": {
      "en": "A suitable labeled dataset and the local scikit-learn stack.",
      "zh": "合适的已标注数据集与本地 scikit-learn 环境。"
    },
    "boundary": {
      "en": "Measured performance applies to the evaluation data, not a guarantee of future predictions. Large language models are outside this workflow.",
      "zh": "评估指标对应所用测试数据，不保证未来预测表现；此场景是传统机器学习流程。"
    },
    "steps": [
      {
        "en": "Define the target and split data without leakage.",
        "zh": "定义目标并进行无泄漏的数据划分。"
      },
      {
        "en": "Compare a baseline and validate on held-out data.",
        "zh": "对比基线并在留出数据上验证。"
      }
    ],
    "proof": {
      "en": "Reproducible training code, held-out metrics and a clear model/data scope.",
      "zh": "可复现训练代码、留出评估指标，以及明确的模型和数据范围。"
    },
    "skillIds": [
      "community-scikit-learn"
    ],
    "art": "model",
    "format": "MODEL",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "network-analysis",
    "category": {
      "en": "NETWORKS & GRAPHS",
      "zh": "关系网络"
    },
    "title": {
      "en": "Explore networks and dependencies",
      "zh": "分析关系网络与依赖"
    },
    "intro": {
      "en": "Understand connected entities, shortest paths, communities and dependency structures.",
      "zh": "理解实体关联、最短路径、社群和依赖结构。"
    },
    "prompt": {
      "en": "Analyze the network data I provide. Read the NetworkX skill, confirm what nodes and edges mean and whether direction or weight matters. Build the graph, compute the requested measures, inspect disconnected components and export a readable figure with reproducible source.",
      "zh": "分析我提供的关系网络数据。读取 NetworkX 技能，明确节点、边及方向或权重的含义，建立图结构，计算所需指标，检查不连通部分，并导出可读图形与可复现源码。"
    },
    "requires": {
      "en": "Node/edge data and a local NetworkX-compatible Python environment.",
      "zh": "节点与边数据，以及兼容 NetworkX 的本地 Python 环境。"
    },
    "boundary": {
      "en": "Network measures depend on data coverage and the chosen edge meanings; centrality is not proof of causal influence.",
      "zh": "网络指标取决于数据覆盖和边的定义，中心性不证明因果影响。"
    },
    "steps": [
      {
        "en": "Build and inspect the graph structure.",
        "zh": "建立并检查图结构。"
      },
      {
        "en": "Calculate the requested measures and explain the result.",
        "zh": "计算所需指标并解释结果。"
      }
    ],
    "proof": {
      "en": "Graph exports, measured results and node/edge definitions.",
      "zh": "图结构导出、计算结果，以及节点与边定义。"
    },
    "skillIds": [
      "community-networkx"
    ],
    "art": "network",
    "format": "GRAPH",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "research-reports",
    "category": {
      "en": "RESEARCH & REPORTS",
      "zh": "资料研究"
    },
    "title": {
      "en": "Research a topic and write a sourced report",
      "zh": "研究资料并形成有来源的报告"
    },
    "intro": {
      "en": "Bring together authorized pages and documents, compare evidence and produce a traceable report.",
      "zh": "汇总获授权网页与文档，比较证据，形成可追溯来源的研究报告。"
    },
    "prompt": {
      "en": "Research the question I specify using the sources I authorize. Read the research skill, gather source URLs and dates, separate verified facts from inference, and compare conflicting evidence. Deliver a structured report in the requested format with citations and explicit gaps.",
      "zh": "围绕我指定的问题，使用获授权来源开展研究。读取研究技能，记录来源链接与日期，区分已核实事实和推断，比较相互冲突的证据。按所需格式交付有引用、并明确指出资料缺口的结构化报告。"
    },
    "requires": {
      "en": "Accessible source documents/pages and authorized reading tools.",
      "zh": "可访问源文档或页面，以及获授权的读取工具。"
    },
    "boundary": {
      "en": "Access and source quality limit the conclusions. Do not invent citations or claim inaccessible material was checked.",
      "zh": "访问权限与资料质量会限制结论；不编造引用，也不声称核查了无法读取的材料。"
    },
    "steps": [
      {
        "en": "Gather and compare cited source evidence.",
        "zh": "收集并比较带来源的证据。"
      },
      {
        "en": "Write the report and verify citations and open questions.",
        "zh": "撰写报告，核对引用与待解问题。"
      }
    ],
    "proof": {
      "en": "A sourced report, evidence links and a clear account of uncertainties.",
      "zh": "有来源的报告、证据链接与不确定性说明。"
    },
    "skillIds": [
  "research-reports",
  "community-nuwa",
  "community-nuwa-andrej-karpathy",
  "community-nuwa-elon-musk",
  "community-nuwa-feynman",
  "community-nuwa-ilya-sutskever",
  "community-nuwa-mrbeast",
  "community-nuwa-munger",
  "community-nuwa-naval",
  "community-nuwa-paul-graham",
  "community-nuwa-steve-jobs",
  "community-nuwa-sun-yuchen",
  "community-nuwa-taleb",
  "community-nuwa-trump",
  "community-nuwa-x-mentor",
  "community-nuwa-zhang-yiming",
  "community-nuwa-zhangxuefeng"
],
    "art": "research",
    "format": "REPORT",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "webapp-testing",
    "category": {
      "en": "BROWSER TESTING",
      "zh": "网页测试"
    },
    "title": {
      "en": "Test a website in a real browser",
      "zh": "在真实浏览器中测试网站"
    },
    "intro": {
      "en": "Check navigation, forms, accessibility and responsive layouts with screenshots and browser evidence.",
      "zh": "检查导航、表单、可访问性与响应式布局，保留截图和浏览器证据。"
    },
    "prompt": {
      "en": "Test the website or app I own at the URL I provide. Read the browser-testing skills, identify representative user flows and screen sizes, run bounded real-browser checks and capture failures with screenshots/logs. Avoid submissions or external writes unless included in my authorization, and report only checks that actually ran.",
      "zh": "测试我拥有的网站或应用。读取浏览器测试技能，确定代表性用户流程和屏幕尺寸，执行有界真实浏览器检查，并用截图或日志记录失败。未获授权时不提交数据或执行外部写入，只报告实际完成的检查。"
    },
    "requires": {
      "en": "A running app, authorized test scope and an available local browser-testing engine.",
      "zh": "可运行应用、获授权测试范围及可用本地浏览器测试引擎。"
    },
    "boundary": {
      "en": "Passing selected checks is not proof that every user flow works. Production data changes need explicit scope.",
      "zh": "选定检查通过不代表所有流程都正确；修改生产数据需明确范围。"
    },
    "steps": [
      {
        "en": "Choose user flows and start the available browser environment.",
        "zh": "选择用户流程并准备可用浏览器环境。"
      },
      {
        "en": "Exercise interactions and inspect screenshots, logs and failures.",
        "zh": "验证交互并检查截图、日志与失败。"
      }
    ],
    "proof": {
      "en": "Actual browser results, screenshots and reproducible failing cases.",
      "zh": "真实浏览器结果、截图及可复现失败案例。"
    },
    "skillIds": [
      "community-webapp-testing",
      "community-playwright",
      "community-web-design-guidelines"
    ],
    "art": "browser",
    "format": "TEST",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "mcp-integrations",
    "category": {
      "en": "INTEGRATIONS",
      "zh": "工具集成"
    },
    "title": {
      "en": "Build an MCP tool integration",
      "zh": "构建 MCP 工具集成"
    },
    "intro": {
      "en": "Connect a service or local workflow with clear tools, input schemas and verifiable results.",
      "zh": "为服务或本地工作流提供清晰工具、输入结构与可核验结果。"
    },
    "prompt": {
      "en": "Help build an MCP integration for the service or local workflow I name. Read the MCP builder skill, inspect the official interface and existing project, define bounded tools and authentication needs, implement the connector and test validation, errors and representative outcomes. Keep credentials out of source and report what was verified.",
      "zh": "为我指定的服务或本地工作流构建 MCP 集成。读取 MCP Builder 技能，检查官方接口和现有项目，明确有界工具与认证需求，完成连接器并测试输入校验、错误和代表性结果。凭据不进入源码，明确说明已验证内容。"
    },
    "requires": {
      "en": "An authorized API/workflow, a development workspace and the local runtime.",
      "zh": "获授权接口或工作流、开发工作区与本地运行时。"
    },
    "boundary": {
      "en": "Building a connector does not grant access to provider accounts. Live credentials and external mutations retain their own permissions.",
      "zh": "构建连接器不增加第三方账号访问权限；真实凭据与外部修改各自遵循授权。"
    },
    "steps": [
      {
        "en": "Define tool contracts and the required permissions.",
        "zh": "定义工具协议和所需权限。"
      },
      {
        "en": "Implement and verify meaningful end-to-end outcomes.",
        "zh": "实现并验证有意义的端到端结果。"
      }
    ],
    "proof": {
      "en": "Connector source, documented tool contracts and actual validation results.",
      "zh": "连接器源码、工具协议说明与实际验证结果。"
    },
    "skillIds": [
      "community-mcp-builder"
    ],
    "art": "mcp",
    "format": "MCP",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "ui-inspection",
    "category": {
      "en": "INTERFACE REVIEW",
      "zh": "界面检查"
    },
    "title": {
      "en": "Inspect screenshots and interface quality",
      "zh": "检查截图与界面质量"
    },
    "intro": {
      "en": "Find clipped text, layout collisions, weak contrast and keyboard issues in a real interface.",
      "zh": "在真实界面中查找文字截断、布局碰撞、对比度与键盘操作问题。"
    },
    "prompt": {
      "en": "Review the screenshots or interface I provide. Read the interface-inspection and design-review skills, use the available DOM or image evidence, and identify specific layout, text, contrast and keyboard issues. Give reproducible observations and inspect any approved fixes in a new screenshot; report missing screen-access tools.",
      "zh": "检查我提供的截图或界面。读取界面检查与设计审查技能，基于可用 DOM 或图片证据，定位具体布局、文字、对比度及键盘问题。给出可复现观察，获批修复后重新截图核对；缺少屏幕访问工具时明确说明。"
    },
    "requires": {
      "en": "Provided screenshots or an authorized live interface; compatible inspection tools.",
      "zh": "已提供截图或获授权实时界面，以及兼容检查工具。"
    },
    "boundary": {
      "en": "A screenshot does not establish hidden behavior. OS screen access or optional vision models require their own setup and permissions.",
      "zh": "截图不能证明未呈现的交互行为；系统屏幕访问或可选视觉模型需具备相应环境与权限。"
    },
    "steps": [
      {
        "en": "Inspect the available image and interface evidence.",
        "zh": "检查可用的图片与界面证据。"
      },
      {
        "en": "Describe concrete issues and verify approved improvements.",
        "zh": "指出具体问题并核验获批改进。"
      }
    ],
    "proof": {
      "en": "Located issues with screenshots/source references and verified improvements.",
      "zh": "附截图或源码位置的问题，以及已核验改进。"
    },
    "skillIds": [
      "ui-inspector",
      "community-web-design-guidelines"
    ],
    "art": "inspect",
    "format": "REVIEW",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": false
  },
  {
    "slug": "browser-workflows",
    "category": {
      "en": "BROWSER WORKFLOWS",
      "zh": "多步骤网页任务"
    },
    "title": {
      "en": "Complete a bounded browser workflow",
      "zh": "完成有界的多步骤网页任务"
    },
    "intro": {
      "en": "Let your existing AI work through authorized pages, gather results and pause for sign-in or final confirmation.",
      "zh": "让已有 AI 在获授权网页中推进步骤、收集结果，并在登录或最终确认时交还给你。"
    },
    "prompt": {
      "en": "From my AI connected through Remote Arc Connect, prepare the browser workflow I specify. Limit sites to those I name, reuse the authorized task profile, inspect each page and preserve checkpoints. Ask for sign-in/CAPTCHA and final submission where needed. If a separate browser-use reasoning engine is necessary, agree on its model budget first.",
      "zh": "通过 Remote Arc Connect，让我的 AI 准备所指定的网页流程。只允许我指定的网站，复用已授权任务资料，逐页检查并保存检查点。需要登录、CAPTCHA 或最终提交时找我确认；确需独立 browser-use 推理引擎时，先约定模型预算。"
    },
    "requires": {
      "en": "Connect in a compatible AI client, Browser Runner on the computer, and the named sites.",
      "zh": "在兼容 AI 客户端中接入 Connect，电脑开启 Browser Runner，并指定允许网站。"
    },
    "boundary": {
      "en": "This path uses Connect; Arc does not drive Browser Runner yet. It does not bypass sign-in, CAPTCHAs or site restrictions, and a separate reasoning engine may incur model costs.",
      "zh": "此路径使用 Connect，Arc 暂不支持驱动 Browser Runner。不绕过登录、CAPTCHA 或站点限制；独立推理引擎可能产生模型费用。"
    },
    "steps": [
      {
        "en": "Open the permitted task browser and inspect its current page.",
        "zh": "打开获授权任务浏览器并检查当前页面。"
      },
      {
        "en": "Complete authorized steps, pause for user-only actions and verify results.",
        "zh": "推进获授权步骤，在需本人操作时暂停，并核验结果。"
      }
    ],
    "proof": {
      "en": "Observed page results, checkpoints and a verified submission outcome when applicable.",
      "zh": "实际页面结果、检查点，以及适用时已核验的提交状态。"
    },
    "skillIds": [
      "browser-operator",
      "autonomous-browser"
    ],
    "art": "browser",
    "format": "BROWSER",
    "tools": "read_skill · read_file · write_file · start_process",
    "connectOnly": true
  },
{
  "slug": "mathematical-animation",
  "category": {
    "en": "MATHEMATICAL ANIMATION",
    "zh": "数学与原理动画"
  },
  "title": {
    "en": "Explain a concept with Manim",
    "zh": "用 Manim 把原理讲明白"
  },
  "intro": {
    "en": "Make geometry, formulas, algorithms and changing quantities visible: a proof, the area under a curve, a sorting algorithm or a data mechanism.",
    "zh": "把几何、公式、算法和数量变化变成看得见的过程：演示证明、曲线下面积、排序步骤或数据原理。"
  },
  "prompt": {
    "en": "Use Manim on my authorized computer to explain the concept I provide through a clear visual derivation. Prepare its ordinary local dependencies, use my chosen language and notation, verify the mathematics, render and inspect the actual animation, and deliver an MP4 and editable Python scene.",
    "zh": "用我已授权电脑上的 Manim，通过清晰的视觉推演讲解我给出的概念。按需准备普通本地依赖，使用我指定的语言与符号，核对数学关系，渲染并检查实际动画，交付 MP4 和可编辑 Python 场景。"
  },
  "requires": {
    "en": "An authorized computer, a writable task folder and Python/rendering dependencies.",
    "zh": "获授权电脑、可写任务目录和 Python／渲染依赖。"
  },
  "boundary": {
    "en": "Manim and rendering run locally. The ordinary bootstrap includes Cairo rendering, not a TeX distribution; mathematical typesetting dependencies depend on the requested notation.",
    "zh": "Manim 与渲染在本地执行。普通准备流程包含 Cairo 渲染，未包含 TeX 发行版；公式排版依赖按实际符号需求选择。"
  },
  "steps": [
    {
      "en": "Translate the concept into quantities, geometry and meaningful transformations.",
      "zh": "把概念拆成数量、几何对象和有含义的变化。"
    },
    {
      "en": "Render the sequence, inspect the reasoning and labels, and deliver the editable scene.",
      "zh": "渲染过程，检查推理与标签，交付可编辑场景。"
    }
  ],
  "proof": {
    "en": "A playable MP4, editable Python source, measured output metadata and checked mathematical relationships.",
    "zh": "可播放 MP4、可编辑 Python 源码、实测文件信息，以及已核对的数学关系。"
  },
  "skillIds": [
    "manim-video"
  ],
  "art": "math-motion",
  "format": "MP4 · PY",
  "tools": "read_skill · write_file · start_process",
  "connectOnly": false
},
{
  "slug": "blender-3d",
  "category": {
    "en": "3D CREATION",
    "zh": "三维创作"
  },
  "title": {
    "en": "Create a 3D product or scene",
    "zh": "制作三维产品与场景"
  },
  "intro": {
    "en": "Use Blender MCP for real geometry, materials, lights and cameras: product packshots, a room or server hall, an exploded view or an orbit animation.",
    "zh": "用 Blender MCP 创建真实几何、材质、灯光和相机，制作产品展示、房间与机房、结构拆解或环绕运镜。"
  },
  "prompt": {
    "en": "Use local Blender MCP on my authorized computer to create the 3D product or scene I describe. Prepare ordinary dependencies in the task folder, connect to a fresh owned Blender instance, inspect the scene, model and light it, render a preview and deliver the editable blend file and requested final renders.",
    "zh": "用我已授权电脑上的本地 Blender MCP，制作我描述的三维产品或场景。在任务目录准备普通依赖，连接独立 Blender 实例，检查场景，完成建模和布光，渲染预览，交付可编辑 blend 文件和要求的最终渲染。"
  },
  "requires": {
    "en": "An authorized computer with a desktop/display, a writable task folder and space for portable Blender.",
    "zh": "具备桌面／显示环境的获授权电脑、可写任务目录和便携 Blender 所需空间。"
  },
  "boundary": {
    "en": "The live MCP addon needs a Blender GUI event loop; background rendering is a separate process. The local workflow does not enable paid model-generation services or change other AI clients.",
    "zh": "实时 MCP 插件需要 Blender 图形界面的事件循环；后台渲染另行执行。本地流程不会启用付费模型生成服务，也不修改其他 AI 客户端。"
  },
  "steps": [
    {
      "en": "Connect through real MCP, inspect the scene and build named geometry and materials.",
      "zh": "通过真实 MCP 连接，检查场景并创建命名几何与材质。"
    },
    {
      "en": "Preview lighting/camera framing, save the scene, render and inspect the actual output.",
      "zh": "预览灯光与构图，保存场景，渲染并检查真实输出。"
    }
  ],
  "proof": {
    "en": "An editable blend project, actual images or video, scene readback and render checks.",
    "zh": "可编辑 blend 工程、实际图像或视频、场景读回和渲染检查。"
  },
  "skillIds": [
    "blender-mcp"
  ],
  "art": "product-3d",
  "format": "BLEND · PNG",
  "tools": "read_skill · write_file · start_process",
  "connectOnly": false
}
] as const;
export type SkillUseCaseSlug=typeof SKILL_USE_CASES[number]['slug'];
export const LEGACY_USE_CASE_SKILLS:Readonly<Record<string,readonly string[]>>={
  "job-applications": [
    "browser-operator"
  ],
  "remote-development": [
    "community-react-best-practices"
  ],
  "file-organization": [],
  "disk-space-cleanup": [],
  "overnight-goals": [
    "scheduled-routines"
  ],
  "long-running-jobs": [
    "scheduled-routines"
  ],
  "scheduled-checks": [
    "scheduled-routines"
  ],
  "ci-follow-up": [
    "scheduled-routines"
  ],
  "data-work": [
    "community-polars"
  ],
  "home-lab": [],
  "browser-research": [
    "browser-operator"
  ],
  "remote-support": [],
  "presentation-deck": [
    "arc-pptx"
  ],
  "spreadsheet-report": [
    "arc-xlsx"
  ],
  "desktop-automation": [
    "desktop-operator"
  ],
  "cross-device-handoff": []
};
export const useCaseSkillIds=(slug:string):readonly string[]=>SKILL_USE_CASES.find(item=>item.slug===slug)?.skillIds||LEGACY_USE_CASE_SKILLS[slug]||[];
