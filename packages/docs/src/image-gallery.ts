type Localized={en:string;zh:string};
export type ImageDemo={id:string;engine:string;title:Localized;description:Localized;prompt:Localized;image:string;thumb:string;width:number;height:number;bytes:number;sha256:string;thumbSha256:string};
// Image bytes are original local exports stored in R2, never bundled in Git.
export const IMAGE_DEMOS:readonly ImageDemo[]=[
  {
    "id": "court-energy",
    "engine": "Canvas Design · Canvas 2D",
    "title": {
      "en": "Court energy",
      "zh": "球场能量 · 运动海报"
    },
    "description": {
      "en": "An original basketball poster: typography, simulated ball texture and court geometry drawn with code.",
      "zh": "用代码绘制字体、篮球材质与球场几何，形成原创运动海报。"
    },
    "prompt": {
      "en": "Create an original basketball poster with orange, deep teal, strong type and detailed court geometry. Render a PNG locally and keep the editable drawing code.",
      "zh": "制作原创篮球海报：橙色、深青色、强烈字体和球场几何，本地输出 PNG 并保留绘图代码。"
    },
    "image": "court-energy-f50162d5ca65.png",
    "thumb": "court-energy-thumb-cef18937a215.webp",
    "width": 1200,
    "height": 1500,
    "bytes": 538531,
    "sha256": "f50162d5ca65c1ba719020355ed7d673cfa4a74e307bc0e1d5f955c1f5854834",
    "thumbSha256": "cef18937a2153e111beb1fd61d39d2c99098e624ca4114d1f24cfa0affb3697a"
  },
  {
    "id": "quiet-objects",
    "engine": "Canvas Design · Canvas 2D",
    "title": {
      "en": "Quiet objects",
      "zh": "静物研究 · 编辑插画"
    },
    "description": {
      "en": "A warm editorial illustration uses gradients, contour marks and local typography. Code illustration, not a photograph.",
      "zh": "通过渐变、轮廓纹理和本地字体形成暖色编辑插画；这是代码插画。"
    },
    "prompt": {
      "en": "Draw a warm editorial poster about a ceramic vessel, with restrained typography, earthy colors and plenty of space. Use local code and export a high resolution PNG.",
      "zh": "用本地代码绘制陶器主题编辑海报，克制排字、泥土色系和充足留白，输出高分辨率 PNG。"
    },
    "image": "quiet-objects-c4033be57c0d.png",
    "thumb": "quiet-objects-thumb-aa2f43bb985f.webp",
    "width": 1200,
    "height": 1500,
    "bytes": 442335,
    "sha256": "c4033be57c0d1f71bcdd5915b6278a390126bea84ccabfb653240dba5472dce9",
    "thumbSha256": "aa2f43bb985fef99f11d8ed4888c08a088467d9763fdb71c5023ea470d158e99"
  },
  {
    "id": "tidal-lines",
    "engine": "Algorithmic Art · p5.js",
    "title": {
      "en": "Tidal lines",
      "zh": "潮汐线 · 生成艺术"
    },
    "description": {
      "en": "Hundreds of seeded curves accumulate into a reproducible flow field. Adjust the seed and export a new composition.",
      "zh": "数百条带固定种子的曲线形成可复现流场，修改种子可导出新构图。"
    },
    "prompt": {
      "en": "Create original flow-field artwork with deep teal, fine gold and sea-glass lines. Provide seeded variation controls, a PNG export and a locally runnable p5.js viewer.",
      "zh": "制作深青色流场生成艺术，搭配金色与海玻璃色细线，提供种子控制、PNG 导出和本地可运行 p5.js 查看器。"
    },
    "image": "tidal-lines-5a3b0a11ca29.png",
    "thumb": "tidal-lines-thumb-f95ea3a24d12.webp",
    "width": 1200,
    "height": 1500,
    "bytes": 690315,
    "sha256": "5a3b0a11ca29037c0ccf7a9bf3d13a837b4307b6bfd5c3a9d408ce6250bc102e",
    "thumbSha256": "f95ea3a24d12dec9302acae4f104887a66bb1f9a8f85af164b232ef04ae7cca2"
  },
  {
    "id": "common-ground",
    "engine": "Algorithmic Art · p5.js",
    "title": {
      "en": "Common ground",
      "zh": "共同秩序 · 参数图案"
    },
    "description": {
      "en": "A seeded system of rotated forms explores rhythm, palette and the balance between repetition and variation.",
      "zh": "用带固定种子的旋转图形探索节奏、配色及重复与变化的平衡。"
    },
    "prompt": {
      "en": "Build a reproducible generative print from modular curved forms, with a warm paper palette and editable seed and spacing parameters. Export a PNG locally.",
      "zh": "用模块化曲线图形制作可复现生成版画，暖纸色系，提供可编辑种子和布局参数，本地输出 PNG。"
    },
    "image": "common-ground-6934caa67271.png",
    "thumb": "common-ground-thumb-5e2818a06bbf.webp",
    "width": 1200,
    "height": 1500,
    "bytes": 176407,
    "sha256": "6934caa6727153b24d9cee864820bd50284e78a32476c1a52781ca0a468d8b60",
    "thumbSha256": "5e2818a06bbf47a4102b54db1c8af8096ae2ca632ada1a3a2f5dbae34a2401f0"
  }
];
