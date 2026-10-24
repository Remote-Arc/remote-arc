export type MediaCategory='motion'|'explainer'|'product'|'data'|'maps';
type Localized={en:string;zh:string};
export type MediaDemo={id:string;category:MediaCategory;title:Localized;description:Localized;engine:string;audio:'music'|'narration'|'silent';prompt:Localized;video:string;poster:string;duration:number;width:number;height:number;bytes:number;sha256:string;posterSha256:string};
export const MEDIA_CATEGORIES:ReadonlyArray<{id:MediaCategory;en:string;zh:string}>=[
{id:'motion',en:'Sports & motion',zh:'运动'},
{id:'explainer',en:'Explainers',zh:'科普'},
{id:'product',en:'Product',zh:'产品'},
{id:'data',en:'Data',zh:'数据'},
{id:'maps',en:'Maps',zh:'地图'}
];
// Public presentation metadata only. Video/poster bytes live in R2, outside Git.
export const MEDIA_DEMOS:readonly MediaDemo[]=[
  {
    "id": "basketball",
    "category": "motion",
    "title": {
      "en": "For the love of the game",
      "zh": "篮球 · 热爱就上场"
    },
    "description": {
      "en": "A kinetic basketball short with tactile motion, bold type and an original beat.",
      "zh": "篮球弹跳、运动文字与原创节奏配乐组成的竖屏短片。"
    },
    "engine": "OpenFilm",
    "audio": "music",
    "prompt": {
      "en": "Make a 30-second vertical basketball film with warm orange lighting, kinetic typography, animated court graphics and an original music bed. Deliver an MP4.",
      "zh": "做一支30秒竖屏篮球短片，暖橙色灯光、运动文字、动态球场和原创节奏配乐，交付MP4。"
    },
    "video": "basketball-70058ce458b3.mp4",
    "poster": "basketball-bcae4493ee5f.webp",
    "duration": 30.016,
    "width": 1080,
    "height": 1920,
    "bytes": 6492809,
    "sha256": "70058ce458b3859795501be8a2ad24636871480b54660dc586e55ffba9a5f38d",
    "posterSha256": "bcae4493ee5f281bc11e3ca8837472bb4abe809998e33812c503b3b8234d349f"
  },
  {
    "id": "why-24-hours",
    "category": "explainer",
    "title": {
      "en": "Why does a day have 24 hours?",
      "zh": "为什么一天是24小时？"
    },
    "description": {
      "en": "Clockwork, celestial motion and a black-and-gold editorial style. The original is silent.",
      "zh": "钟表机械、天体运动与黑金科普排版。保留原版无声呈现。"
    },
    "engine": "HyperFrames",
    "audio": "silent",
    "prompt": {
      "en": "Create a vertical science explainer with black-and-gold clockwork, clear visual diagrams and readable captions. Keep it silent and deliver the finished video.",
      "zh": "制作一支竖屏科普短片，用黑金钟表机械、清楚的图解和易读字幕讲故事，保留无声版本并交付成片。"
    },
    "video": "why-24-hours-32532fed221d.mp4",
    "poster": "why-24-hours-18e810ef9a8b.webp",
    "duration": 25.208333,
    "width": 1080,
    "height": 1920,
    "bytes": 2144519,
    "sha256": "32532fed221d658ddd7cdcd973c9e991099b5b70c7e58f74d375c56050dfc867",
    "posterSha256": "18e810ef9a8b03c7c77d713e153c2b5e42de3188cb477de0bd962ec5c89c1938"
  },
  {
    "id": "venus",
    "category": "explainer",
    "title": {
      "en": "Curiosity No. 001 · Venus",
      "zh": "冷知识大赏 No.001 · 金星的一天"
    },
    "description": {
      "en": "A narrated space explainer that combines astronomical diagrams and timed captions.",
      "zh": "结合天文示意、中文解说和时间轴字幕的系列科普短片。"
    },
    "engine": "Local code video",
    "audio": "narration",
    "prompt": {
      "en": "Make a 40-second vertical space explainer with checked facts, astronomical diagrams, Chinese narration and synchronized subtitles.",
      "zh": "做一支40秒竖屏太空科普短片，核对事实，加入天文图解、中文解说和同步字幕。"
    },
    "video": "venus-42f284da9abe.mp4",
    "poster": "venus-ef104c1e9c51.webp",
    "duration": 43.002993,
    "width": 1080,
    "height": 1920,
    "bytes": 14410593,
    "sha256": "42f284da9abef5224c5c9c633c1fee665adf4d6f7496cb02479e12e376ff8c76",
    "posterSha256": "ef104c1e9c51e90d0e07b8251e4c4b0dc0e3621f39f63b93204417aa749a0274"
  },
  {
    "id": "pluto",
    "category": "explainer",
    "title": {
      "en": "Curiosity No. 002 · Pluto",
      "zh": "冷知识大赏 No.002 · 冥王星"
    },
    "description": {
      "en": "A second chapter showing a consistent science series, from visual identity to narration.",
      "zh": "统一视觉风格与解说方式，展示可延续制作的系列科普内容。"
    },
    "engine": "OpenFilm",
    "audio": "narration",
    "prompt": {
      "en": "Create the next episode of a vertical astronomy series. Keep its visual identity consistent, verify the science, and include narration and subtitles.",
      "zh": "制作竖屏天文科普系列的下一集，延续统一视觉，核验科学事实，加入旁白与字幕。"
    },
    "video": "pluto-b6f7047a99ff.mp4",
    "poster": "pluto-6bd9bc96fa97.webp",
    "duration": 41.002,
    "width": 1080,
    "height": 1920,
    "bytes": 5359605,
    "sha256": "b6f7047a99ff4b02b2451b4e1472b0a489e21e89e34a4bcb4a9556009a6c69cc",
    "posterSha256": "6bd9bc96fa97df591ba0df5f795872d84e87e5bde585df0a2e4361c507ba2b81"
  },
  {
    "id": "aura-product",
    "category": "product",
    "title": {
      "en": "AURA · Find your quiet",
      "zh": "AURA · 把注意力留给自己"
    },
    "description": {
      "en": "A fictional headphone launch film with a sculpted product illustration and soft studio lighting.",
      "zh": "用产品造型、柔和棚拍光感与留白排版，制作虚构耳机品牌概念广告。"
    },
    "engine": "OpenFilm",
    "audio": "music",
    "prompt": {
      "en": "Make an 18-second landscape product concept film for a fictional headphone brand. Use a soft sage palette, a sculpted product illustration and restrained typography.",
      "zh": "为虚构耳机品牌做一支18秒横屏产品概念片，鼠尾草绿配色、立体产品插画与克制排版。"
    },
    "video": "aura-product-b276fd0784e3.mp4",
    "poster": "aura-product-836dc8070849.webp",
    "duration": 18.005,
    "width": 1920,
    "height": 1080,
    "bytes": 1394721,
    "sha256": "b276fd0784e32ee58a5148b77ab662806ca81292f439bb001282e3a73639073e",
    "posterSha256": "836dc8070849341f2fb70637cb113c4778cad1e0b2facdd119b5a6e5e23630c6"
  },
  {
    "id": "data-in-motion",
    "category": "data",
    "title": {
      "en": "Data, in motion",
      "zh": "把数字，变成故事"
    },
    "description": {
      "en": "An animated ranking chart that makes changing trends visible. Uses clearly labeled synthetic data.",
      "zh": "用动态排名和数值变化讲清趋势；片内明确标注为演示数据。"
    },
    "engine": "OpenFilm",
    "audio": "music",
    "prompt": {
      "en": "Turn my data into a 20-second animated chart story with a readable legend, changing ranks and a clear takeaway. Identify any example data as synthetic.",
      "zh": "把我的数据制作成20秒动态图表故事，标注清楚、排名变化易读、结论明确；若用演示数据请明确标注。"
    },
    "video": "data-in-motion-a8b35bd37c41.mp4",
    "poster": "data-in-motion-051d8ea3529f.webp",
    "duration": 20.01,
    "width": 1920,
    "height": 1080,
    "bytes": 619510,
    "sha256": "a8b35bd37c41bcefaae1d6dbdaf7ff115b7e5553fbb50729c6d5e3dc3c4593ca",
    "posterSha256": "051d8ea3529f5b99e59c8839fcb3ff95bc669c0fd539617b224863f16095af44"
  },
  {
    "id": "world-connections",
    "category": "maps",
    "title": {
      "en": "Three cities. One moving map.",
      "zh": "一段旅程，一张动态地图"
    },
    "description": {
      "en": "A globe, geographic outlines and animated routes connecting Auckland, Tokyo and Singapore.",
      "zh": "以地球、地理轮廓和动态路线，串联奥克兰、东京与新加坡。"
    },
    "engine": "OpenFilm + d3",
    "audio": "music",
    "prompt": {
      "en": "Create a 20-second landscape map film connecting Auckland, Tokyo and Singapore. Use a rotating globe, accurate geography and animated routes with clear city labels.",
      "zh": "制作一支20秒横屏地图短片，旋转地球、准确的地理轮廓与动态路线，清晰标出奥克兰、东京、新加坡。"
    },
    "video": "world-connections-0c24960266d3.mp4",
    "poster": "world-connections-9d4bcaa57ff9.webp",
    "duration": 20.01,
    "width": 1920,
    "height": 1080,
    "bytes": 1974633,
    "sha256": "0c24960266d349368d090d93847e729fe5fd28f258ae19b2f95e040aacde5ceb",
    "posterSha256": "9d4bcaa57ff91a7a54588bfbb861e4501a63a09384b4e7434d0de1458348f1ea"
  }
];
export const mediaDemoPath=(file:string)=>'/media/demo-gallery/'+file;
