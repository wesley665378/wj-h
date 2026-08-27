/**
 * @file SSOT (Single Source of Truth) - 全局核心类型定义
 * @description 城市守护者价值循环系统核心领域模型与 TypeScript 类型定义。
 * 所有业务类型、枚举、数据传输结构均在此统一定义与维护。
 */

export enum Role {
  Admin = 'admin',
  Rank = 'rank',
  Operator = 'operator',
  npcxie = 'npcxie',
  NPC = 'npc',
  RevenueCollector = 'revenue_collector',
  ValueCollector = 'value_collector',
  ReservoirManager = 'reservoir_manager',
  Collector = 'collector'
}

export interface SalaryHistoryRecord {
  effectiveMonth: string; // YYYY-MM
  salary: number;
}

export interface User {
  id: string; // user id (系统主键)
  name: string; // 姓名
  userId?: string; // 工号 (登录 ID)
  avatar?: string; // 头像
  role: Role;
  center?: string;
  category?: '初产专' | '中产专' | '高产专' | '初款专' | '中款专' | '高款专' | '经管员高款专' | '经管员高产专' | 'NPC' | '系统管理员' | 'VP' | '经管员NPC' | '水库管理员' | '统筹水库管理员';
  secondaryRoles?: ('高款专' | '高产专')[]; // 兼任专家
  salaryPackageType?: '收款工资包' | '产值工资包' | '经管员工资包' | 'NPC工资包' | 'VP工资包';
  salaryPackage?: number; // 工资包（三方核定固定）
  salaryHistory?: SalaryHistoryRecord[]; // 工资变更履历
  permissions?: string[]; // 可访问的组件/标签页 ID 列表
  userStatus?: 'active' | 'inactive'; // 用户状态：active(在职), inactive(离职)
  password?: string; // 初始密码 (仅用于同步落库)
  mustChangePassword?: boolean; // 首次登录强制改密标识
  isFirstLogin?: boolean; // 首次登录标识
  resignDate?: string; // 离职日期 YYYY-MM-DD
}

export interface JydyUnit {
  id: string;
  name: string;
  category?: '前台' | '后台';
  status?: 'active' | 'inactive';
}

export interface SystemOperationLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: number;
  ip?: string; // 操作客户端 IP 地址
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  publisherName: string;
  publisherId: string;
  createdAt: number;
  priority?: 'normal' | 'important' | 'urgent';
  isPinned?: boolean;
}

export enum TransactionType {
  Resource = '资源交易'
}

export enum TransactionStatus {
  Pending = '待验证',
  Verified = '已验证',
  Rejected = '已驳回',
  PendingTarget = '待接收方验证',
  PendingNpcxie = '待npcxie审核',
  PendingAdmin = '待管理员审核',
  Returned = '待发起方验证',
  PendingInitiatorVerify = '待发起方验证'
}

export interface CircuitBreaker {
  id: string;
  targetId: string; // 经营单元 ID 或 用户 ID
  targetName: string;
  reason: string;
  type: 'initiation' | 'confirmation' | 'both';
  status: 'active' | 'recovered';
  createdAt: number;
  expiresAt: number;
}

export interface TransactionFailure {
  id: string;
  targetId: string;
  timestamp: number;
  reason: 'insufficient_balance' | 'limit_exceeded' | 'capacity_insufficient' | 'resource_limit_exceeded' | 'other';
}

export interface InternalTransaction {
  id: string;
  type: TransactionType;
  senderId: string;
  receiverId: string;
  miningId?: string; // 仅资源交易/配方确权需要匹配
  amount: number;
  unitPrice?: number; // 单价
  revenueAmount?: number; // 收款交易量
  valueAmount?: number; // 产值交易量
  confirmedRevenue?: number;
  unconfirmedRevenue?: number;
  pendingValue?: number;
  confirmedValue?: number;
  unconfirmedValue?: number;
  description: string;
  timestamp: number;
  month?: string; // 业务月份 YYYY-MM
  businessDate?: string; // 业务日期 YYYY-MM-DD
  status: TransactionStatus;
  valueQuadrants?: { q1: number, q2: number, q3: number, q4: number };
  revenueQuadrants?: { q1: number, q2: number, q3: number };
}

export enum ProjectType {
  OccupationalHealth = '职业卫生',
  SafetyEval = '安全评价',
  ElectricTest = '电气检测',
  FireTest = '消防检测',
  Enterprise = '企业项目',
  Bidding = '招标项目',
  Outsourced = '外派项目'
}

export enum RefineType {
  Enterprise = '企业项目',
  OccHealth = '职业卫生',
  SafetyEval = '安全评价',
  OccHealthElectric = '职业卫生/电气检测',
  Bidding = '招采项目',
  Outsourced = '战略性外派',
  EmergencyG = '应急演练（G)',
  TrainingG = '培训（G）',
  NonEffectiveHours = '非有效工时对冲'
}

export enum RefineCategory {
  Revenue = '收款',
  Value = '产值'
}

export enum AuditStatus {
  Pending = '待确权',
  Confirmed = '已确权',
  Approved = '入库',
  Rejected = '已驳回'
}

export interface QuotaSnapshot {
  revenue: {
    capacity: number;
    confirmed: number;
    pending: number;
    mined: number;
    available: number;
  };
  value: {
    capacity: number;
    confirmed: number;
    pending: number;
    mined: number;
    available: number;
  };
}

export interface AcceptanceRecord {
  id: string;
  userId: string;
  userName: string;
  category: string; // 发放类别: '产值奖金' | '收款奖金' | '5%专项包' | '2%专项包' | string
  miningId?: string;
  theoreticalAmount: number;
  amount: number; // 实际发放金额 (承兑金额)
  diffType?: string;
  diffReason?: string;
  approvalRef?: string;
  description?: string;
  timestamp: number;
  month: string; // 业务月份 YYYY-MM
  businessDate: string; // 业务日期 YYYY-MM-DD
  status: '已承兑' | '待承兑';
  operatorId?: string;
}

export enum ResourceStatus {
  Exploring = '勘探中',
  StockIn = '入库'
}

export enum ProjectStatus {
  InProgress = '进行中',
  Capping = '待封存',
  Archived = '已结案'
}

export interface MiningResource {
  /**
   * @businessRule 矿山编号
   * @description 矿山资源唯一定量，作为全局唯一标识符
   */
  id: string; 
  initialRevenueCapacity: number; // 合同款初
  initialValueCapacity: number; // 合同产初
  initialRevenueLimit?: number; // 合同款限/款初限
  initialValueLimit?: number; // 合同产限/产初限
  types: RefineType[]; // 提炼类型（支持多选）
  revenueCapacity: number; // 款当
  valueCapacity: number; // 产当
  minedRevenue: number; // 已提炼收款量
  minedValue: number; // 已提炼产值量
  assignedTo: string; // 指派经营单元名称 (保留兼容)
  assignedToRevenue?: string; // 收款指派经营单元
  assignedToValue?: string; // 产值指派经营单元
  category?: '100%' | '据实'; // 类别
  status: ResourceStatus;
  lifecycleStatus?: 'active' | 'archived' | 'settling' | string; // 生命周期状态
  version?: number;
  isPaused?: boolean;
  cappedAt?: number; // 达标时间 (收款与产值均满上限)
  reachedDate?: string; // 触顶日期 YYYY-MM-DD
  archivedAt?: string; // 封存日期 YYYY-MM-DD
  quotas?: {
    centerId: string;
    revenueQuota: number;
    valueQuota: number;
    minedRevenue: number;
    minedValue: number;
  }[];

  // 增强确权状态
  pendingValue: number;
  
  /**
   * @businessRule 已确权产值
   * @description 实时汇总该矿山资源下所有状态为 CONFIRMED 的产值日志金额
   */
  confirmedValue: number;
  unconfirmedValue: number;
  valueDepleted: boolean;

  pendingRevenue: number;
  
  /**
   * @businessRule 已确权收款
   * @description 实时汇总该矿山资源下所有状态为 CONFIRMED 的收款日志金额
   */
  confirmedRevenue: number;
  unconfirmedRevenue: number;
  revenueDepleted: boolean;

  /**
   * @formula purity_ratio = (confirmedRevenue / confirmedValue) * 100
   * @businessRule 含金量百分比
   * @description 实时计算的含金量比例。若 confirmedValue 为 0 且 confirmedRevenue > 0，则视为 >100%
   */
  purity_ratio?: number;

  /**
   * @businessRule 经营成色等级
   * @condition Purity >= 100% -> GREEN (优质预付)
   * @condition 90% <= Purity < 100% -> ORANGE (足金)
   * @condition 60% <= Purity < 90% -> BLUE (K金)
   * @condition Purity < 60% -> RED (镀金)
   */
  purity_grade?: 'GREEN' | 'ORANGE' | 'BLUE' | 'RED';
  
  // Rhythm Control Fields
  totalMonths?: number; 
  rhythmMonthN?: number;
  monthlyQuota?: number;
  monthlyUsed?: number;
  customRevenueFactor?: number; // 收款自定义提炼系数
  customValueFactor?: number; // 产值自定义提炼系数
  refineTypeFactors?: {
    [key in RefineType]?: {
      customRevenueFactor?: number; // 针对特定提炼类型的收款自定义核算系数级配方系数 (0.0~1.0)
      customValueFactor?: number;   // 针对特定提炼类型的产值自定义核算系数级配方系数 (0.0~1.0)
    };
  };
  incentiveOutput5: number; // 产值5%专项包
  incentiveCollection2: number; // 收款2%专项包
}

export interface ValueCreationLog {
  id: string;
  miningId: string;
  rankId: string;
  recordedCollectorId?: string; // 提炼人员（仅为记录，不参与计算）
  category: RefineCategory;
  type: RefineType;
  costCategory?: 'A' | 'B' | 'C'; // 动态消耗计入类别
  valueConsumptionMode?: 'B1' | 'B2'; // 产值B类消耗模式
  amount: number; // 积分/资源量
  rawAmount: number; // 原始注入总量（用于动态对冲计算基准）
  dynamicCost: number; // 动态消耗（同步录入费用）
  cClassCost?: number; // C类消耗（直接在产出申报中扣除）
  cClassRatio?: number; // C对冲权重
  b2ClassRatio?: number; // B2对冲权重
  
  /**
   * @formula netValue = amount - dynamicCost - (cClassCost || 0)
   * @businessRule 净产值计算
   * @description 扣除动态消耗和C类消耗后的实际净产值
   */
  netValue: number; 
  timestamp: number;
  month?: string; // 业务月份 YYYY-MM
  businessDate?: string; // 业务日期 YYYY-MM-DD
  
  /**
   * @businessRule 确权状态
   * @condition 只有当 status === 'Confirmed' 时，amount 才会被计入 MiningResource 的 confirmedRevenue 或 confirmedValue
   */
  status: AuditStatus;
  confirmationType?: '自动确权' | '手动确权' | '联动确权';
  confirmedAt?: number; // 确权时间，用于3个月倒计时
  deleted?: boolean;
  deletedAt?: string; // 删除时间
}

export interface PersonalEvaluation {
  userId: string;
  userName: string;
  totalIncome: number; // 收入包
  totalCost: number; // 个人成本 (工资+五险一金+差旅等)
  contribution: number;
  bonusEligibility: boolean;
  tier: string;
  efficiency: number;
  yearlyEfficiency: number;
  salaryStructure: {
    fixedRatio: number; // 刚性占比
    flexibleRatio: number; // 弹性占比
  };
}

export interface ValueEfficiencySnapshot {
  id?: string;
  userId: string;
  userName: string;
  category: string;
  filterMonth: string;
  monthlyIncome: number;
  monthlyCost: number;
  monthlyEfficiency: number;
  yearlyIncome: number;
  yearlyCost: number;
  yearlyEfficiency: number;
  tier: string;
  contribution: number;
  fixedRatio: number;
  timestamp: number;
}

export interface CenterDistribution {
  id: string;
  centerName: string;
  grossProfit: number;
  bonusPool: number; // 60%
  centerSurplus: number; // 40%
  dividendAmount: number; // Surplus * 50%
}

export interface MeetingSample {
  id: string; // e.g. "month:2026-08" or "quarter:2026-Q3"
  periodType: 'month' | 'quarter';
  periodKey: string; // "2026-08" or "2026-Q3"
  frozenAt: number; // 时间戳
  frozenByUserId: string; // 工号
  frozenByName: string; // 姓名
  label: string; // e.g. "2026年8月 会务留样" / "2026年Q3 会务留样"
  fixedNotice?: string; // "会务留样 · 仅对生成时刻数据负责"
  checksum?: string; // 校验摘要
  kpis: {
    totalRevenueAndValuePackage: number; // 收产包 (整数)
    totalRevenuePackage: number; // 收款包 (整数)
    totalValuePackage: number; // 产兑包 (整数)
    rigidSalaryPackage?: number; // 刚性保底/工资包 (整数)
    operatingLoss?: number; // 运营损耗 (整数)
    totalBonusPool?: number; // 奖金池 (整数)
    platformCoordinationPool?: number; // 统筹留用池 (整数)
    dividendPool?: number; // 分红池纯结余 (整数)
    reservoirInflow?: number; // 蓄水入库 (整数)
    globalWeightedPurity?: number; // 加权含金量 %
    totalRigidExpenses?: number; // 刚性保底开支
    logCount?: number; // 该期流水条数
    [key: string]: any;
  };
}

export type SettlementPayoutCategory = '产值奖金' | '收款奖金' | '5%专项包' | '2%专项包' | '刚性保证' | '弹性激励' | '特批调整' | '其他' | string;

export interface DividendPoolAdjustment {
  id: string;
  centerId?: string;
  centerName?: string;
  amount: number;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
  timestamp?: number;
  month?: string;
  periodMonth?: string;
  recordType?: 'system' | 'manual' | 'fhctz' | 'supplement' | string;
  entrySide?: 'in' | 'out' | 'credit' | 'debit' | string;
  status?: 'pending' | 'approved' | 'verified' | 'rejected' | 'active' | string;
  details?: string;
  source?: string;
  targetId?: string;
  targetName?: string;
  [key: string]: any;
}

export interface SettlementPayout {
  id: string;
  userId: string;
  userName: string;
  category: SettlementPayoutCategory;
  miningId?: string;
  theoreticalAmount?: number;
  amount: number;
  diffType?: string;
  diffReason?: string;
  approvalRef?: string;
  description?: string;
  operatorId?: string;
  status: '已承兑' | '待承兑' | 'pending' | 'approved' | 'rejected' | 'paid' | string;
  timestamp?: number;
  month?: string;
  businessDate?: string;
  remarks?: string;
  [key: string]: any;
}
