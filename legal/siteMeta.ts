export interface SiteMeta {
  appName: string;
  subTitle: string;
  copyright: string;
  companyName: string;
  icpNumber?: string;
  userAgreement: {
    title: string;
    version: string;
    updatedAt: string;
    sections: { heading: string; content: string }[];
  };
  privacyPolicy: {
    title: string;
    version: string;
    updatedAt: string;
    sections: { heading: string; content: string }[];
  };
}

export const SITE_META: SiteMeta = {
  appName: "城市守护者",
  subTitle: "价值循环智能体管理系统",
  copyright: "© 2026 城市守护者：价值循环智能体 版权所有",
  companyName: "城市守护者：价值循环智能体",
  icpNumber: "京ICP备20260817号-1",
  userAgreement: {
    title: "用户服务协议",
    version: "v1.2",
    updatedAt: "2026年01月01日",
    sections: [
      {
        heading: "一、服务条款的确认与接受",
        content: "欢迎使用城市守护者价值循环智能体管理系统（以下简称“本系统”）。本协议是您与本系统运营方之间关于使用本系统服务所订立的法律协议。当您登录或使用本系统服务时，即表示您已充分阅读、理解并同意接受本协议的所有内容。"
      },
      {
        heading: "二、账号安全与管理",
        content: "用户应妥善保管本系统的账号与密码，不得将账号出借、转让或授权他人使用。因用户保管不善导致的账号安全风险或数据流失，由用户自行承担相应的责任。"
      },
      {
        heading: "三、价值分配与数据合规",
        content: "本系统内记载的资源确权、产值结算及奖金分配数据均依据系统核定规则计算。用户在使用本系统进行数据核算与交易登记时，应当保证提供信息的真实性、合法性与有效性。"
      },
      {
        heading: "四、知识产权与服务变更",
        content: "本系统的软件著作权、算法设计及相关品牌标识均受法律保护。未经书面许可，任何单位或个人不得擅自复制、反编译或倒卖本系统技术方案。"
      }
    ]
  },
  privacyPolicy: {
    title: "隐私与数据保护政策",
    version: "v1.2",
    updatedAt: "2026年01月01日",
    sections: [
      {
        heading: "一、信息收集范围",
        content: "为了向您提供精准的价值核算与身份验证服务，本系统可能会收集您的必要的个人信息，包括但不限于姓名、工作账号、组织架构、业务交易明细与登录操作日志。"
      },
      {
        heading: "二、信息的使用与保护",
        content: "本系统严格遵循最小化原则使用您的信息，仅用于身份识别、权限控制、绩效激励核算及安全审计。系统采用工业级加密传输与存储技术，全方位保障您的数据隐私与安全。"
      },
      {
        heading: "三、信息共享与第三方服务",
        content: "除非法律法规明确规定或经过您的明确授权，本系统绝不会将您的个人信息与数据出售、租借或分享给无关第三方。"
      },
      {
        heading: "四、您的权利与联系方式",
        content: "您有权查阅、更正或要求删除保存在本系统中的个人数据信息。如对隐私保护政策有任何疑问，请联系系统管理员处理。"
      }
    ]
  }
};

export default SITE_META;
