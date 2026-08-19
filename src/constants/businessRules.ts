export const LINKED_CONFIRMATION_RULES = {
  title: "联动确权规则",
  autoConversion: {
    title: "自动转换机制 (联动确权)",
    description: "作用域：同一矿山(miningId)下，不跨矿。触发：收款提报、确权或产值提报时重算。",
    formula: "转换额度 = min(待确权产值总和, max(0, 已确权收款总和 - 已确权产值总和))",
    boundaryCondition: "边界条件：若 (矿山款初 - 已确权产值总和) <= 0，则 转换额度 = 0",
    definitions: {
      pendingValueSum: "待确权产值总和：该矿山下，产值类且状态为待确权的流水之和。",
      confirmedRevenueSum: "已确权收款总和：该矿山下，收款类且状态为已确权的流水之和。",
      confirmedValueSum: "已确权产值总和：该矿山下，产值类状态为已确权的流水之和。",
      revenueCapacity: "矿山款初：MiningResource.revenueCapacity"
    }
  },
  warehousing: {
    title: "入库",
    description: "当已确权收款 = 已确权产值 = 款初 = 产初，且满 90 天后自动触发入库。"
  }
};

export const PURITY_RULES = {
  title: "经营含金量计算规则",
  green: {
    id: "GREEN",
    label: "绿灯 (优质预付)",
    condition: "已确权收款 > 0 且 (已确权产值 + 待确权产值) = 0",
    color: "emerald",
    icon: "🟢"
  },
  yellow: {
    id: "ORANGE",
    label: "黄灯 (尾款清收)",
    condition: "已确权收款 > 0 且 已确权产值 = 产初 且 (已确权收款 ÷ 已确权产值) > 0",
    color: "orange",
    icon: "🟡"
  },
  red: {
    id: "RED",
    label: "红灯 (重点监控)",
    condition: "已确权收款 = 0 且 (待确权产值 + 已确权产值) > 0",
    color: "rose",
    icon: "🔴"
  },
  blue: {
    id: "BLUE",
    label: "蓝灯 (平稳运营)",
    condition: "不满足以上三种状态的正常运营项目",
    color: "blue",
    icon: "🔵"
  }
};

export const B2_HEDGE_RULES = {
  title: "B2 动态对冲规则 (产值端)",
  definition: "B2对冲权重被定义为“产值端动态抵减项”，代表项目实施中的刚性采购费用。",
  weightFormula: "B2对冲权重(X) = (项目总产初 - 已审批B2消耗) / 项目总产初",
  netValueFormula: "实际净值(¥) = 注入总量 * B2对冲权重 * 提炼因子",
  impact: "B2 的抵减通过降低该项目下所有采集主体的“B2对冲权重”，等比例影响所有关联主体的已确权产值包。"
};

export const C_HEDGE_RULES = {
  title: "C 动态对冲规则 (收款端/产值端)",
  definition: "C对冲权重代表项目实施中的通用运营扣除比例，按剩余额度比例动态计算。",
  formula: "C对冲权重(CWeight) = (初限(Limit) - ΣC积分) / 初限(Limit)"
};

export const FORMULA_FACTOR_RULES = {
  title: "核算配方系数规则",
  description: "价值创造提报时的核心结算依据，决定了积分转化为人民币价值的权重。",
  standardSameBU: {
    title: "同一经营单元 (默认)",
    revenue: "0.27",
    value: "0.48",
    logic: "收款价值 = 积分 * 0.27 | 产值价值 = 积分 * 0.48"
  },
  crossBU: {
    title: "跨经营单元 (跨单元协议)",
    logic: "根据双方协议比例手工设定 (收款比例 + 产值比例 <= 100%)",
    audit: "总比例 > 80% 需经过 NPC 级别审核。"
  }
};

export const DASHBOARD_SPECIAL_POOLS = {
  title: "经营效率看板专项包规则",
  output5: {
    title: "产值 5% 专项包",
    trigger: "初级/中级/产专 角色在产值端确权时触发",
    formula: "注入积分 * 0.05",
    description: "用于核算产值端确权后自动分流至 5% 激励池的价值额度。"
  },
  collection2: {
    title: "收款 2% 专项包",
    trigger: "初级/中级/款专 角色在收款端确权时触发",
    formula: "注入积分 * 0.02",
    description: "用于核算收款端确权后自动分流至 2% 激励池的价值额度。"
  }
};
