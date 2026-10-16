/**
 * 演示数据的**生成逻辑**（纯函数，没有副作用）。
 *
 * 为什么单独拆一个文件出来？
 *
 * 原来这些代码住在 `seed.js` 里，而 `seed.js` 是个**脚本** ——
 * 文件末尾直接写着 `deleteAllRecords()` 并开始插数据。
 * 于是"导入它"就等于"清库重灌"，这个副作用是躲不掉的。
 *
 * 部署到 Render 之后需要一个"空库就自动补数据"的能力（见 server.js），
 * 那个能力要在服务启动时调用同一套生成逻辑。如果直接从 `seed.js` 导，
 * **服务每启动一次就会把用户的数据清空一次** —— 灾难。
 *
 * 所以把生成逻辑（纯的）和执行动作（带副作用的）分开：
 *   - 本文件：只生成数组，不碰数据库。谁想用谁来 import。
 *   - seed.js：命令行脚本，import 本文件，然后清库 + 写入。
 *
 * 用固定随机种子，保证每次生成的数字都一样 —— 录屏、调试时才好复现。
 */

const EXPENSE = [
  { category: '餐饮', min: 12, max: 88, notes: ['午饭', '晚饭', '咖啡', '外卖', '和朋友聚餐'] },
  { category: '交通', min: 3, max: 60, notes: ['地铁', '打车', '公交', '高铁票'] },
  { category: '购物', min: 39, max: 599, notes: ['日用百货', '衣服', '耳机', '厨房用品'] },
  { category: '娱乐', min: 25, max: 300, notes: ['电影票', '游戏', '演唱会', '剧本杀'] },
  { category: '居住', min: 200, max: 2500, notes: ['房租', '水电费', '物业费', '宽带'] },
  { category: '医疗', min: 20, max: 400, notes: ['感冒药', '体检', '牙科'] },
  { category: '其他', min: 10, max: 200, notes: ['红包', '快递', '话费充值'] },
];

const INCOME = [
  { category: '工资', min: 8000, max: 12000, notes: ['月薪'] },
  { category: '奖金', min: 500, max: 3000, notes: ['季度奖', '项目奖'] },
  { category: '理财', min: 20, max: 800, notes: ['基金收益', '利息'] },
  { category: '兼职', min: 200, max: 2000, notes: ['外包尾款', '接单'] },
];

/** 可复现的伪随机数（mulberry32） */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = makeRng(20261015);

const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const between = (min, max) => min + rng() * (max - min);

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * 生成一批演示记录（本月 + 上个月）。
 * 返回的是普通数组，调用方自己决定写不写库。
 */
function buildRecords() {
  const out = [];
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based

  // 本月 1 号 ~ 今天
  for (let day = 1; day <= today.getDate(); day += 1) {
    const date = ymd(new Date(year, month, day));

    // 每天 0~4 笔支出
    const count = Math.floor(rng() * 5);
    for (let i = 0; i < count; i += 1) {
      const spec = pick(EXPENSE);
      out.push({
        type: 'expense',
        amount: Math.round(between(spec.min, spec.max) * 100) / 100,
        category: spec.category,
        note: pick(spec.notes),
        date,
      });
    }
  }

  // 收入：1 号发工资，15 号可能有一笔外快
  out.push({
    type: 'income',
    amount: 11800,
    category: '工资',
    note: '月薪',
    date: ymd(new Date(year, month, 1)),
  });
  if (today.getDate() >= 15) {
    const spec = pick(INCOME.filter((s) => s.category !== '工资'));
    out.push({
      type: 'income',
      amount: Math.round(between(spec.min, spec.max) * 100) / 100,
      category: spec.category,
      note: pick(spec.notes),
      date: ymd(new Date(year, month, 15)),
    });
  }

  // 上个月也铺一点，让"切换月份"这个功能有东西可看
  const prev = new Date(year, month - 1, 1);
  const prevDays = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= prevDays; day += 1) {
    const date = ymd(new Date(prev.getFullYear(), prev.getMonth(), day));
    const count = Math.floor(rng() * 4);
    for (let i = 0; i < count; i += 1) {
      const spec = pick(EXPENSE);
      out.push({
        type: 'expense',
        amount: Math.round(between(spec.min, spec.max) * 100) / 100,
        category: spec.category,
        note: pick(spec.notes),
        date,
      });
    }
  }
  out.push({
    type: 'income',
    amount: 11800,
    category: '工资',
    note: '月薪',
    date: ymd(prev),
  });

  return out;
}

export { buildRecords };
