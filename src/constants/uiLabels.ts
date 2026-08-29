import { TERMINOLOGY } from './terminology';

export const UI_LABELS = {
  VALUE_FLOW: '价值动态流',
  REVENUE: '收款',
  VALUE: '产值',
  REVENUE_RAIL: '收款轨',
  VALUE_RAIL: '产值轨',
  REVENUE_PACKAGE: '收款包',
  VALUE_PACKAGE: '产兑包',
  TOTAL_PACKAGE: '收产包',
  PENDING: '待确权',
  CONFIRMED: '已确权',
  APPROVED: '入库',
  REJECTED: '已驳回',
  UNCONFIRMED: '未确权',
  MINED: '矿山入库',
  REFINING_TYPE: '提炼类型',

  BTN_CONFIRM: '确认',
  BTN_CANCEL: '取消',
  BTN_SUBMIT: '提交',

  COLLECTOR: TERMINOLOGY.LOG_OPERATOR_ID,
  RANK: TERMINOLOGY.USER_RANK,
  BUSINESS_UNIT: TERMINOLOGY.BUSINESS_UNIT,
  EFFICIENCY_TIER: '评价等级',

  LOGIN_ACCOUNT: TERMINOLOGY.LOGIN_ID,
  MY_ACCOUNT_PAGE: '我的帐户',

  EMPTY_DEFAULT: '暂无数据',
  EMPTY_LIST: '暂无记录',
  EMPTY_MEMBERS: '暂无成员数据',
  EMPTY_MINING: '暂无矿山资源',
} as const;
