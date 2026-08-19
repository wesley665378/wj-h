export const isWeakPassword = (pw: string): boolean => {
  const weakList = [
    '666888',
    '12345678',
    '88888888',
    '11111111',
    '00000000',
    'qwertyui',
    'password',
  ];
  return weakList.includes(pw.trim());
};

export const assertAcceptablePassword = (pw: string): { acceptable: boolean; message?: string } => {
  if (!pw || pw.trim().length < 8) {
    return { acceptable: false, message: '密码长度至少为 8 位' };
  }
  if (isWeakPassword(pw)) {
    return { acceptable: false, message: '密码为弱口令，请设置更复杂的密码（如：禁止 666888 等弱口令）' };
  }
  return { acceptable: true };
};
