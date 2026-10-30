/** Author perspective: keep the Chinese and English article in sync. */
export const INTENT_ESSAY = {
  "slug": "from-code-to-intent-driven-computing",
  "date": "30 Oct 2026",
  "title": {
    "en": "Could AI become the next compiler?",
    "zh": "我有个假设：AI 会不会成为下一代 Compiler？"
  },
  "description": {
    "en": "A thought on how code may recede into the background, why prompts may only be a transition, and what this could mean for Remote Arc.",
    "zh": "我在想，未来写代码会不会慢慢变成像写汇编一样的事？Prompt 又是不是终点？这也让我重新思考 Remote Arc 的定位。"
  },
  "deck": {
    "en": "We used to write code to make software do things. What if we increasingly just told AI what we wanted?",
    "zh": "以前我们写代码来驱动软件。以后，会不会变成写 Prompt、告诉 AI 想做什么，然后由 AI 来驱动软件？"
  },
  "intro": [
    {
      "zh": "我最近想到一个假设：以后的 AI，会不会就像以前的 Compiler？",
      "en": "I've been thinking about a possibility: what if AI becomes something like the compiler was for an earlier generation of computing?"
    },
    {
      "zh": "以前要让软件做点什么，我们得学习编程语言，自己写代码。以后是不是只需要把想做的事情告诉 AI，它就能把代码写出来、调用工具，甚至直接把事情做完？",
      "en": "For a long time, making software do something meant learning a programming language and writing code ourselves. What if we increasingly just describe what we want, and AI writes the code, uses the tools, or even finishes the work?"
    },
    {
      "zh": "如果沿着这个方向走下去，代码会不会慢慢变得像今天的汇编语言？它不会真的消失，只是大多数人不再需要亲手写了。",
      "en": "Follow that idea far enough, and code might become a little like assembly language today. It won't actually disappear. Most people may simply stop needing to write it by hand."
    }
  ],
  "sections": [
    {
      "heading": {
        "zh": "从代码到 Prompt，我觉得这事已经在发生了",
        "en": "I think we're already seeing the shift"
      },
      "paragraphs": [
        {
          "zh": "回头看计算机的发展，很多变化其实都是把底层复杂的东西藏起来。从机器码到汇编，再到 C、JavaScript、Python。我们越来越不用关心机器具体怎么执行，只需要描述更高一层的逻辑。",
          "en": "If you look back at computing, so much of its progress has been about hiding details. Machine code, assembly, C, JavaScript, Python. At each layer, we think a little less about what the machine is doing underneath."
        },
        {
          "zh": "现在 Claude Code、Codex 已经能自己读项目、改代码、跑测试了。以前我需要告诉电脑每一步怎么做，现在很多时候，我告诉 AI 要什么结果就行。这不只是提高编程效率，我觉得可能是在改变人和软件对话的方式。",
          "en": "Claude Code and Codex can already read projects, change code and run tests. Instead of explaining every step to the computer, I can increasingly tell an AI the result I want. To me, that's more than faster programming. It may change how we interact with software."
        }
      ]
    },
    {
      "heading": {
        "zh": "不过，AI 和 Compiler 还是不太一样",
        "en": "There is a catch in the compiler analogy"
      },
      "paragraphs": [
        {
          "zh": "Compiler 不需要猜你什么意思。你写了什么，它按规则转换就行。AI 不一样，人说的话经常不够明确，它得自己判断，判断错了还可能真的闯祸。",
          "en": "A compiler doesn't have to guess what you meant. It translates instructions with defined rules. AI is different. Human requests are often ambiguous, and a wrong guess can have real consequences."
        },
        {
          "zh": "比如我说“把电脑里没用的东西清理一下”。什么叫没用？没提交的代码算不算？删了之后要不要能恢复？这些事不是模型够聪明就可以随便替我决定的。",
          "en": "Say I ask it to clean up unused files. What counts as unused? Is uncommitted code disposable? Should deletion be reversible? A smarter model shouldn't automatically get to make those decisions for me."
        },
        {
          "zh": "所以我不是说代码和软件工程都会消失。只是以后人自己写代码的比例可能会越来越低，而定义需求、检查结果、控制风险这些事情反而会变得更重要。",
          "en": "So I don't think code or software engineering disappears. I think people may write less of the code themselves, while defining requirements, checking outcomes and managing risk becomes even more important."
        }
      ]
    },
    {
      "heading": {
        "zh": "再往后，Prompt 可能也不是终点",
        "en": "And prompts may not be the final interface either"
      },
      "paragraphs": [
        {
          "zh": "今天大家都在研究怎么写 Prompt。但如果 AI 真的能理解人的意思，为什么还要每个人学一套复杂的提示词技巧？",
          "en": "People spend a lot of time learning how to write prompts. But if AI eventually understands what people mean, why should everyone need to learn a complicated set of prompt tricks?"
        },
        {
          "zh": "我觉得以后更重要的可能是说清楚三个问题：我要什么、哪些事情不能做、怎么证明做完了。缺的信息，AI 应该主动问，而不是要求用户第一句话就把所有细节写完整。",
          "en": "Maybe the more important questions are: what do I want, what must not happen, and how do I know the job is done? The AI should ask for missing details rather than expect one perfect instruction."
        },
        {
          "zh": "那时候，真正的接口可能不是代码，甚至不是 Prompt，而是人的意图。",
          "en": "At that point, the interface might be neither code nor clever prompts. It might simply be human intent."
        }
      ]
    },
    {
      "heading": {
        "zh": "那 Remote Arc 应该处在哪一层？",
        "en": "Where does that leave Remote Arc?"
      },
      "paragraphs": [
        {
          "zh": "想到这里，我也在重新看 Remote Arc 的定位。如果 AI 模型未来都很会写代码、很会操作电脑，那我们不能只靠“让 AI 动手”来证明自己的价值。Claude Code 和 Codex 本来就已经能做不少这样的事。",
          "en": "It also makes me rethink what Remote Arc should be. If models keep getting better at writing code and using computers, we can't build our whole value around simply letting AI take action. Claude Code and Codex can already do a lot of that."
        },
        {
          "zh": "我更在意的是下一步：AI 知道该做什么之后，怎么真正用到用户自己的电脑、浏览器和应用？不同 AI 能不能用同一套权限和执行层？任务做没做完、哪里出错了，能不能查得清楚？",
          "en": "The more interesting question is what comes next. Once AI knows what to do, how does it reach the user's actual computers, browser and apps? Can different AIs share one permission and execution layer? Can we tell what actually happened, and what failed?"
        },
        {
          "zh": "所以我觉得 Connect 更应该是 Remote Arc 的基础设施主线，让 ChatGPT、Claude、Codex 等已经存在的 AI 客户端接进来。Arc 是建立在这一层上、我们自己的第一方体验。两者不是两套独立的平台。",
          "en": "That's why I see Connect as Remote Arc's infrastructure: a way for existing AI clients like ChatGPT, Claude and Codex to connect to a user's environment. Arc is our own first-party experience built on that same layer, not another separate platform."
        },
        {
          "zh": "当然，跨平台也不一定就是护城河。大模型厂商和操作系统以后自己做执行能力怎么办？更现实的是，用户真的会同时用几个 AI、几台电脑吗？还是一个 AI 加一台电脑就够了？这些问题不能只靠想象，最后还是要看真实用户怎么用。",
          "en": "But being cross-platform isn't automatically a moat. Model companies and operating systems may build execution features themselves. And do people really need several AI clients across multiple computers, or is one assistant and one machine enough? We need real usage to answer that, not a convincing story."
        },
        {
          "zh": "安全和可靠性也是一样。执行一个命令不难，难的是不该做的时候能拦住，出问题的时候能查清楚，中断之后能知道下一步怎么处理。Remote Arc 现在也远没把这些都解决：终端执行不是操作系统沙箱，Undo 也不能撤销所有操作。但我觉得这些比单纯增加工具数量更值得继续做。",
          "en": "Security and reliability matter just as much. Running a command isn't the hard part. The hard part is knowing when not to run it, understanding failures and handling interruptions safely. Remote Arc hasn't solved all of this: terminal access isn't an OS sandbox, and Undo can't reverse everything. To me, that work matters more than simply adding more tools."
        }
      ]
    },
    {
      "heading": {
        "zh": "最后",
        "en": "Where I've landed, for now"
      },
      "paragraphs": [
        {
          "zh": "所以我的想法还是那个：代码不会消失，但人可能会越来越少亲自写代码。Prompt 也可能只是中间的一站。以后大家更多地负责告诉 AI 要做什么、不能做什么，然后用实际结果判断它到底做没做好。",
          "en": "So I still come back to the original idea: code won't disappear, but people may write less and less of it directly. Prompts might be a transitional step too. More of our job may be to tell AI what we want, what it must not do, and then check what actually happened."
        },
        {
          "zh": "至于这条路最后会走到哪里，我也不确定。但对 Remote Arc 来说，真正值得证明的不是 AI 能不能动手，而是 AI 动手之后，用户能不能放心。",
          "en": "I don't know exactly where that leads. But for Remote Arc, the thing worth proving isn't whether AI can act. It's whether people can actually trust what happens after it does."
        }
      ]
    }
  ]
} as const;
