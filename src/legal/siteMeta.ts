/**
 * @file SSOT (Single Source of Truth) - 站点法律合规元信息
 * @description 统一收敛站点名称、版权主体、备案号及合规协议配置。
 */

import { LegalDocument, USER_AGREEMENT, PRIVACY_POLICY } from './documents';

export interface SiteMeta {
  appName: string;
  subTitle: string;
  copyright: string;
  companyName: string;
  icpNumber: string;
  icpLink: string;
  userAgreement: LegalDocument;
  privacyPolicy: LegalDocument;
}

export const SITE_META: SiteMeta = {
  appName: "城市守护者",
  subTitle: "价值循环智能体管理系统",
  copyright: "© 2026 深圳市世和安全技术咨询有限公司 版权所有",
  companyName: "深圳市世和安全技术咨询有限公司",
  icpNumber: "粤ICP备09029974号-7",
  icpLink: "https://beian.miit.gov.cn/",
  userAgreement: USER_AGREEMENT,
  privacyPolicy: PRIVACY_POLICY,
};

export default SITE_META;
