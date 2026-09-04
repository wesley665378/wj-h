import { UI_TOKENS } from '../src/constants/uiTokens';
import React from 'react';
import { Card } from '../src/components/UI';
import { 
  BookOpen, 
  Info, 
  CheckCircle2, 
  ShieldCheck, 
  Layers, 
  TrendingUp, 
  Zap, 
  Scale, 
  Users,
  Bookmark
} from 'lucide-react';

const SystemInstructions: React.FC = () => {
  const terms = [
    {
      term: '收款包',
      desc: '指销售专家或款专在收款（Revenue）通道，通过系统确权流程审批通过后，进入个人或经营单元账户的纯净收益部分。',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
    },
    {
      term: '产兑包',
      desc: '指技术专家或产专在产值（Value）通道，通过系统确权流程审批通过后（或通过收款背书在途自动联动），进入账户的可承兑收益。',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200/50'
    },
    {
      term: '收产包',
      desc: '收款包与产兑包两者的合计数。用作综合考量专家个人流水的财务总盘口径。',
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200/50'
    },
    {
      term: '提报日期',
      desc: '价值提报时的物理真实提交时间，由系统底层时间戳自动采集并锁定，不可由专家手动篡改编辑。',
      origin: '业务日期',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200/50'
    },
    {
      term: '经营单元流入',
      desc: '水库管理中，各个经营项目在确权入库时按照确权比例（例如20%）统筹注入公共储备水库的流动性部分。',
      origin: '统筹池流入 (20%)',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/50'
    },
    {
      term: '月度效率 / 年度效率',
      desc: '用于反映经营单元各月、各年度投入产出的财务效益比，严禁采用任何英文缩写表达。',
      origin: 'ROI / 投资回报率',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200/50'
    }
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12 animate-fadeIn" id="system-instructions-view">
      {/* 头部展示区 */}
      <div className={`relative ${UI_TOKENS.RADIUS_PANEL} bg-gradient-to-br from-slate-900 to-indigo-950 p-8 md:p-12 overflow-hidden shadow-2xl border border-slate-800`}>
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -ml-20 -mb-20"></div>
        
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center space-x-2 bg-blue-500/15 border border-blue-500/30 text-blue-400 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
            <BookOpen size={14} />
            <span>核心业务说明与规范指南</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white tracking-tighter uppercase leading-tight">
            城市守护者价值循环<br />系统说明书
          </h1>
          <p className="text-slate-400 text-sm md:text-base font-bold max-w-2xl leading-relaxed">
            本指南阐明基于“六元价值循环模型”与“双口径对账审计”的系统运行机制。确保底层运算一致性、逻辑闭环以及各模块数据资产的分配精度。
          </p>
        </div>
      </div>

      {/* 规范业务术语词典 */}
      <Card className={`${UI_TOKENS.RADIUS_PANEL} bg-white border border-slate-100 shadow-xl overflow-hidden`}>
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md">
              <Bookmark size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                系统标准术语对照词典
              </h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                消除装饰与行话，统一规范名称及底层对应字段
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {terms.map((item, idx) => (
              <div key={idx} className="p-5 border border-slate-100 rounded-2xl bg-slate-50/30 space-y-3 hover:border-slate-200/80 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-slate-900 text-base">{item.term}</span>
                  </div>
                  {item.origin && (
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${item.badgeColor}`}>
                      原: {item.origin}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 text-xs font-bold leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 核心机制与四大系统运算一致性规范 (四大金刚规则) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 规则 1 */}
        <Card className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-md flex flex-col justify-between">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
              <Zap size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">0.933 收益提纯准则</h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                扣除 6.7% 折耗率的财务逻辑闭环
              </p>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              系统内所有提报点数及矿山收益在<strong>加载或确权入库时</strong>已完成了 <span className="font-bold text-slate-900">0.933 提纯提炼</span>（已扣除 6.7% 的法定损耗与税折率）。后续进行利益分红对冲、指标运算或作为 B2 成本核算时，必须严格直接引用纯净值，<span className="text-rose-600 font-bold">严禁在任何下游环节进行重复折算折减</span>。
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 text-xs font-black text-blue-600 uppercase tracking-wider">
            <CheckCircle2 size={14} />
            <span>保障系统数据运算不出现双重折损</span>
          </div>
        </Card>

        {/* 规则 2 */}
        <Card className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-md flex flex-col justify-between">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm">
              <Layers size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">C类消耗与 B2 耗散归一机制</h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                计量基数平面对齐，防止异常熔断
              </p>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              当经营单元发生 C 级动态折损对冲、或 B2 级消耗系数变动时，折算计算扣减的基数，<strong>必须与矿山的总容量、待确权水位完全处于同一基准面之上</strong>（统一采用税后纯净积分或统一原始积分）。防止两端由于基数不对齐引起的水位高估，从而造成虚假熔断报警。
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 text-xs font-black text-amber-600 uppercase tracking-wider">
            <CheckCircle2 size={14} />
            <span>保证动态消耗系数对冲处于同等平面</span>
          </div>
        </Card>

        {/* 规则 3 */}
        <Card className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-md flex flex-col justify-between">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
              <TrendingUp size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">未确权进度占比公式标准</h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                消除多象限看板视觉割裂的数学锚定
              </p>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              规定表达未确权进度的全量财务公式为：
              <span className="block my-2 p-2 bg-slate-50 rounded-xl font-mono text-xs text-slate-800 border border-slate-200/60 text-center font-bold">
                Unconfirmed = Max(0, Capacity - Confirmed - Pending - Mined)
              </span>
              各处看板（主仪表盘、矿山资源页、进度四象限）在计算未确权水位、进度比率时，其分母与分子取值逻辑已严格统一，防范逻辑脱节。
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 text-xs font-black text-indigo-600 uppercase tracking-wider">
            <CheckCircle2 size={14} />
            <span>确保仪表盘四象限与个人进度一致</span>
          </div>
        </Card>

        {/* 规则 4 */}
        <Card className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-md flex flex-col justify-between">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">内部交易越界保护与防误熔断</h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                考虑提纯折耗引起的账户水位偏差
              </p>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed">
              内部流转交易（如承兑额度交易）在进行跨账户转移与扣划限额验证时，均已精准内嵌入 6.7% 折耗的损耗抵消。这防止了由于未考虑纯净提纯转换导致高估账户余额，而在高频额度变动时发生额度异常报错或触发系统交易误锁死。
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center space-x-2 text-xs font-black text-rose-600 uppercase tracking-wider">
            <CheckCircle2 size={14} />
            <span>在安全合规转移额度的前提下杜绝误锁</span>
          </div>
        </Card>
      </div>

      {/* 水库盈利排名榜双行口径说明 */}
      <Card className={`${UI_TOKENS.RADIUS_PANEL} bg-white border border-slate-100 shadow-xl overflow-hidden`}>
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-md">
              <Scale size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                经营单元排名双口径对账基准
              </h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                「已确权」与「已确权+待确权」口径拆解
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 md:p-8 space-y-6">
          <p className="text-slate-600 text-sm leading-relaxed">
            为精细化评估经营单元的静态已实现成果与动态潜在盈亏，排名榜采用<strong>双行口径机制</strong>进行严密呈递。榜单的<strong>总体排名名次完全基于第二行口径的月度盈亏结果</strong>。
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="p-5 bg-blue-50/40 border border-blue-100 rounded-2xl space-y-3">
              <div className="inline-block px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-black rounded">
                第一行：已确权
              </div>
              <ul className="text-slate-600 text-xs font-bold space-y-2">
                <li className="flex items-start">
                  <span className="mr-1.5 mt-0.5 text-blue-500">▪</span>
                  <span>产兑包：仅统计完全「已确权」的产出日志。</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1.5 mt-0.5 text-blue-500">▪</span>
                  <span>收产包：等于「收款包」+「第一行产兑包」。</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1.5 mt-0.5 text-blue-500">▪</span>
                  <span>月度盈亏：仅以已确权收产包减去本月各级成本。</span>
                </li>
              </ul>
            </div>

            <div className="p-5 bg-amber-50/40 border border-amber-100 rounded-2xl space-y-3">
              <div className="inline-block px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black rounded">
                第二行：已确权+待确权
              </div>
              <ul className="text-slate-600 text-xs font-bold space-y-2">
                <li className="flex items-start">
                  <span className="mr-1.5 mt-0.5 text-amber-600">▪</span>
                  <span>产兑包：等于「已确权」+「联动待确权」之和。</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1.5 mt-0.5 text-amber-600">▪</span>
                  <span>收款包两行同值，确保在途流动性对账精准。</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-1.5 mt-0.5 text-amber-600">▪</span>
                  <span>各列都出数：收产、成本包、月度/年度盈亏第二行均全部填出，不要任何横杠。</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 flex items-start space-x-3 text-xs font-bold text-slate-500">
            <Info size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-slate-700 font-black">联动待确权与非联动判定规则：</p>
              <p className="mt-1">
                联动待确权产兑包（即收款背书在途）会作为合理的在途收益计入第二行；任何状态为待确权但确权方式属于手动人工审核的（非联动待审记录），<strong>一律不计入任何计算中</strong>，防范虚假资产注水。
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 2% 与 5% 专项包挂载说明 */}
      <Card className={`${UI_TOKENS.RADIUS_PANEL} bg-white border border-slate-100 shadow-xl overflow-hidden`}>
        <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-md">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                专项特殊政策包挂载展示规范
              </h3>
              <p className="text-slate-500 text-xs font-bold mt-1">
                经管员款专与产专职责绑定的金库与蓄水池
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 md:p-8 space-y-6">
          <p className="text-slate-600 text-sm leading-relaxed">
            在价值分配列表（`Distribution.tsx`）中，系统动态展示了分配给专家所负责矿山对应的两类高额专项激励包的累计剩余额度，保障分红与调节时拥有真实的数据背书：
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 border border-emerald-100 rounded-2xl bg-emerald-50/20 space-y-3">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="font-black text-slate-900 text-sm">款专 2% 专项金库</span>
              </div>
              <p className="text-slate-500 text-xs font-bold leading-relaxed">
                针对分类或职责标为高级<strong>「款专」</strong>的用户行，实时穿透汇总所有由其在资源中负责的矿山（`assignedToRevenue` 为其 ID）名下的收款 2% 专项累计余额。并于行内高亮呈递“收款2%金库：{'{coll2_Sum}'}”的高对比度暗绿色徽标。
              </p>
            </div>

            <div className="p-5 border border-amber-100 rounded-2xl bg-amber-50/20 space-y-3">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <span className="font-black text-slate-900 text-sm">产专 5% 专项蓄水池</span>
              </div>
              <p className="text-slate-500 text-xs font-bold leading-relaxed">
                针对分类或职责标为高级<strong>「产专」</strong>的用户行，实时汇总该专家管理的矿山（`assignedToValue` 为其 ID）名下的 5% 产值专项包余额。于分配行内呈现“产值5%蓄水：{'{out5_Sum}'}”的精美琥珀色微章，控制手动超标派发。
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SystemInstructions;
