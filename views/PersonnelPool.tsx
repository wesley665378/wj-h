import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Role } from '../types';
import * as XLSX from 'xlsx';
import { Card, Badge } from '../src/components/UI';
import { UserTableRow } from '../src/components/UserTableRow';
import { MENU_ITEMS, RANK_DICTIONARY } from '../constants';
import { checkUserPermission, RANK_CONFIG } from '../src/utils/business';
import { getLocalMonthString } from '../src/utils/dateUtils';
import { syncWorkspace } from '../src/services/api';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';
import { assertAcceptablePassword } from '../src/utils/security';
import { 
  suggestResignHedgeAmount, 
  getResignHedgeFormulaDesc,
  buildResignNonEffectiveHoursLog,
  isSalaryActiveForMonth
} from '../src/utils/employmentStatus';
import { getLocalDateString } from '../src/utils/dateUtils';
import { formatMoney } from '../src/utils/formatMoney';

interface PersonnelPoolProps {
  user: User;
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  onUpdatePassword: (userId: string, newPassword: string) => Promise<boolean>;
  onClearTestData?: () => void;
  businessUnits: string[];
  onUpdateBusinessUnits: (units: string[]) => void;
}

const AUTO_ACCOUNT_CATEGORIES = ['经管员高款专', '经管员高产专', '经管员NPC', 'VP'];

const PersonnelPool: React.FC<PersonnelPoolProps> = ({ user, users, onUpdateUsers, onUpdatePassword, onClearTestData, businessUnits, onUpdateBusinessUnits }) => {
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const isSyncing = useRef(false);

  const isSystemAdmin = (u: User | null | undefined) => {
    if (!u) return false;
    return u.role === Role.Admin || u.category?.toLowerCase() === '系统管理员';
  };
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterCategory, setNewCenterCategory] = useState<'前台' | '后台'>('前台');
  const [editingCenter, setEditingCenter] = useState<string | null>(null);
  const [editCenterValue, setEditCenterValue] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'全部' | '采集主体' | '管理与VP'>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  


  // RBAC 权限控制中心状态
  const [rbacSearch, setRbacSearch] = useState('');
  const [rbacCategoryFilter, setRbacCategoryFilter] = useState<'全部' | '管理与VP' | 'NPC与经管员' | '采集主体'>('全部');
  
  // 离职流程相关状态
  const [resigningUser, setResigningUser] = useState<User | null>(null);
  const [resignDate, setResignDate] = useState(getLocalDateString());
  const [hedgeAmount, setHedgeAmount] = useState<number>(0);
  
  const [formData, setFormData] = useState<{
    id: string;
    userId: string;
    name: string;
    role: Role;
    center: string;
    category: User['category'];
    secondaryRoles: ('高款专' | '高产专')[];
    salaryPackageType: User['salaryPackageType'];
    salaryPackage: number;
    password?: string;
    confirmPassword?: string;
    permissions?: string[];
  }>({ 
    id: '', 
    userId: '',
    name: '', 
    role: Role.Rank, 
    center: '',
    category: '初款专',
    secondaryRoles: [],
    salaryPackageType: '收款工资包',
    salaryPackage: 0,
    password: '',
    confirmPassword: '',
    permissions: []
  });

  const [newUserFormData, setNewUserFormData] = useState({
    id: '',
    userId: '',
    name: '',
    center: '',
    category: '初款专' as User['category'],
    salaryPackageType: '产值工资包' as User['salaryPackageType'],
    salaryPackage: 0,
    secondaryRoles: [] as ('高款专' | '高产专')[],
    password: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (activeCategory === '采集主体') {
      result = users.filter(u => 
        u.category !== 'NPC' && u.category !== '系统管理员' && u.category !== 'VP' && u.category !== '经管员NPC' &&
        (['初款专', '中款专', '高款专', '初产专', '中产专', '高产专', '经管员高款专', '经管员高产专'].includes(u.category || '') || [Role.Rank, Role.RevenueCollector, Role.ValueCollector].includes(u.role))
      );
    } else if (activeCategory === '管理与VP') {
      result = users.filter(u => ['VP', 'NPC', '系统管理员', '经管员NPC'].includes(u.category || '') || u.role === Role.Admin || u.role === Role.ReservoirManager);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(u => 
        u.name.toLowerCase().includes(q) || 
        u.id.toLowerCase().includes(q) ||
        (u.center || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [users, activeCategory, searchQuery]);

  const handleCreateUser = async () => {
    if (!isSystemAdmin(user)) {
      return showAlert('权限不足：仅系统管理员有权执行人格注入。');
    }

    const isAutoCategory = AUTO_ACCOUNT_CATEGORIES.includes(newUserFormData.category || '');
    const userPassword = newUserFormData.password || (isAutoCategory ? '66668888' : '');

    if (!newUserFormData.id || !newUserFormData.name || !newUserFormData.category || !userPassword) {
      return showAlert('请填写完整信息（包括工号、姓名、职级和初始密码）');
    }
    
    if (userPassword !== '66668888') {
      const pwCheck = assertAcceptablePassword(userPassword);
      if (!pwCheck.acceptable) {
        return showAlert(pwCheck.message || '密码不符合规范');
      }
    }

    if (users.some(u => u.id === newUserFormData.id)) {
      return showAlert(`ID 冲突：工号 [${newUserFormData.id}] 已被占用。`);
    }

    const confirmMsg = `【人格注入确认】\n\n请核对以下信息：\n工号：${newUserFormData.id}\n姓名：${newUserFormData.name}\n职级：${newUserFormData.category}\n初始密码：${userPassword}\n\n确定要将此实体注入城市守护者矩阵吗？`;
    
    showConfirm(confirmMsg, async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;

      const currentMonth = getLocalMonthString();
      let role = Role.Rank;
      const cat = newUserFormData.category;
      if (cat === '初款专' || cat === '中款专' || cat === '高款专' || cat === '经管员高款专') role = Role.RevenueCollector;
      else if (cat === '初产专' || cat === '中产专' || cat === '高产专' || cat === '经管员高产专') role = Role.ValueCollector;
      else if (cat === 'NPC' || cat === '经管员NPC') role = Role.npcxie;
      else if (cat === '系统管理员' || cat === 'VP') role = Role.Admin;

      const newUser: User = {
        id: newUserFormData.id,
        userId: newUserFormData.userId || newUserFormData.id,
        name: newUserFormData.name,
        center: newUserFormData.center,
        role: role, 
        category: newUserFormData.category,
        secondaryRoles: newUserFormData.secondaryRoles,
        salaryPackageType: newUserFormData.salaryPackageType,
        salaryPackage: newUserFormData.salaryPackage,
        salaryHistory: [{ effectiveMonth: currentMonth, salary: newUserFormData.salaryPackage }],
        permissions: [],
        userStatus: 'active',
        password: userPassword,
        mustChangePassword: isAutoCategory || userPassword === '66668888'
      };
      
      try {
        // 直接一次性落库，由后端 syncWorkspace 处理 password_hash
        await syncWorkspace({ users: [...users, newUser] });
        
        // 成功后更新本地内存
        onUpdateUsers([...users, newUser]);
        
        showAlert('新人格实体创建成功，并已成功注入矩阵。');
        setNewUserFormData({ 
          id: '', 
          userId: '',
          name: '', 
          center: '', 
          category: '初款专', 
          salaryPackageType: '产值工资包',
          salaryPackage: 0,
          secondaryRoles: [], 
          password: '' 
        });
        if (showAddAccountForm) setShowAddAccountForm(false);
      } catch (err) {
        // 失败展示后端「未设置密码/弱密码」原文
        showAlert(`实体创建同步失败：${(err as Error).message || '未知错误'}`);
      } finally {
        isSyncing.current = false;
      }
    });
  };

  const handleEdit = (user: User) => {
    setFormData({
      id: user.id,
      userId: user.userId || '',
      name: user.name,
      role: user.role,
      center: user.center || '',
      category: user.category || '初款专',
      secondaryRoles: user.secondaryRoles || [],
      salaryPackageType: user.salaryPackageType || '收款工资包',
      salaryPackage: user.salaryPackage || 0,
      password: '',
      confirmPassword: '',
      permissions: user.permissions || []
    });
    setEditingUserId(user.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSystemAdmin(user)) {
      return showAlert('权限不足：仅系统管理员有权执行保存操作。');
    }
    if (isSyncing.current) return;

    if (!formData.id || !formData.name) return;

    if (formData.password) {
      if (formData.password !== formData.confirmPassword) {
        showAlert('两次输入的密码不一致，请重新确认。');
        return;
      }
      const pwCheck = assertAcceptablePassword(formData.password);
      if (!pwCheck.acceptable) {
        showAlert(pwCheck.message || '密码不符合规范');
        return;
      }
    }

    if (!editingUserId || (editingUserId !== formData.id)) {
      if (users.some(u => u.id === formData.id)) {
        showAlert(`ID 冲突：工号 [${formData.id}] 已被占用。`);
        return;
      }
    }

    let role = formData.role;
    const cat = formData.category;
    if (cat === '初款专' || cat === '中款专' || cat === '高款专' || cat === '经管员高款专') role = Role.RevenueCollector;
    else if (cat === '初产专' || cat === '中产专' || cat === '高产专' || cat === '经管员高产专') role = Role.ValueCollector;
    else if (cat === 'NPC' || cat === '经管员NPC') role = Role.npcxie;
    else if (cat === '系统管理员' || cat === 'VP') role = Role.Admin;

    const existingUser = users.find(u => u.id === (editingUserId || formData.id));
    const currentMonth = getLocalMonthString();
    let updatedHistory = [...(existingUser?.salaryHistory || [])];

    // 如果是新用户，或者工资包发生了变化，则记录履历
    if (!existingUser || existingUser.salaryPackage !== formData.salaryPackage) {
      const monthIdx = updatedHistory.findIndex(h => h.effectiveMonth === currentMonth);
      if (monthIdx > -1) {
        updatedHistory[monthIdx] = { ...updatedHistory[monthIdx], salary: formData.salaryPackage };
      } else {
        updatedHistory.push({ effectiveMonth: currentMonth, salary: formData.salaryPackage });
      }
      updatedHistory.sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
    }

    const userToSave: User = {
      id: formData.id,
      userId: formData.userId,
      name: formData.name,
      role: role,
      center: formData.center,
      category: formData.category,
      secondaryRoles: formData.secondaryRoles,
      salaryPackageType: formData.salaryPackageType,
      salaryPackage: formData.salaryPackage,
      salaryHistory: updatedHistory,
      permissions: formData.permissions,
      userStatus: existingUser?.userStatus || 'active',
      // If it's a new user, include the password for one-shot sync
      ...( (!editingUserId && formData.password) ? { password: formData.password } : {} )
    };

    const nextUsers = editingUserId 
      ? users.map(u => u.id === editingUserId ? userToSave : u)
      : [...users, userToSave];

    isSyncing.current = true;
    try {
      await syncWorkspace({ users: nextUsers });
      
      // If editing existing user, still use onUpdatePassword for clarity/legacy
      if (editingUserId && formData.password) {
        const pwSuccess = await onUpdatePassword(formData.id, formData.password);
        if (!pwSuccess) {
          throw new Error('密码修改失败，请重试');
        }
      }
      
      // 成功后更新内存
      onUpdateUsers(nextUsers);
      
      showAlert(editingUserId ? '用户信息更新成功。' : '新的人格实体已成功注入矩阵。');
      resetForm();
    } catch (err) {
      showAlert(`用户信息同步失败：${(err as Error).message || '网络错误'}`);
    } finally {
      isSyncing.current = false;
    }
  };

  const resetForm = () => {
    setFormData({ 
      id: '', 
      userId: '',
      name: '', 
      role: Role.Rank, 
      center: '',
      category: '初款专',
      secondaryRoles: [],
      salaryPackageType: '收款工资包',
      salaryPackage: 0,
      password: '',
      confirmPassword: '',
      permissions: []
    });
    setEditingUserId(null);
    setShowForm(false);
  };

  const addCenter = async () => {
    if (!isSystemAdmin(user)) {
      return showAlert('权限不足：仅系统管理员有权操作经营单元。');
    }
    if (isSyncing.current) return;

    const rawName = newCenterName.trim();
    if (!rawName) {
      showAlert('请输入单元名称');
      return;
    }

    let formattedName = rawName;
    if (!rawName.endsWith('(前台)') && !rawName.endsWith('(后台)')) {
      formattedName = `${rawName} (${newCenterCategory})`;
    }

    if (businessUnits.includes(formattedName) || businessUnits.includes(rawName)) {
      showAlert('该经营单元已存在');
      return;
    }
    const updatedUnits = [...businessUnits, formattedName];
    
    isSyncing.current = true;
    try {
      onUpdateBusinessUnits(updatedUnits);
      await syncWorkspace({ businessUnits: updatedUnits });
      setNewCenterName('');
      showAlert(`成功新增单元: ${formattedName}`);
    } catch (err) {
      showAlert('经营单元同步失败，请重试');
    } finally {
      isSyncing.current = false;
    }
  };

  const startEditingCenter = (center: string) => {
    setEditingCenter(center);
    setEditCenterValue(center);
  };

  const saveCenterRename = async (oldName: string) => {
    if (!isSystemAdmin(user)) {
      setEditingCenter(null);
      return showAlert('权限不足。');
    }
    if (isSyncing.current) return;

    const newName = editCenterValue.trim();
    if (!newName || newName === oldName) {
      setEditingCenter(null);
      return;
    }
    if (businessUnits.includes(newName)) {
      showAlert('该经营单元已存在');
      return;
    }
    const updatedUnits = businessUnits.map(unit => unit === oldName ? newName : unit);
    const updatedUsers = users.map(u => u.center === oldName ? { ...u, center: newName } : u);

    isSyncing.current = true;
    try {
      onUpdateBusinessUnits(updatedUnits);
      onUpdateUsers(updatedUsers);
      await syncWorkspace({ businessUnits: updatedUnits, users: updatedUsers });
      setEditingCenter(null);
      showAlert(`单元 [${oldName}] 已重命名为 [${newName}]`);
    } catch (err) {
      showAlert('重命名同步失败');
    } finally {
      isSyncing.current = false;
    }
  };

  const normalizeUnitName = (str: string) => {
    if (!str) return '';
    return str
      .replace(/\s*[\(（](前台|后台)[\)）]/gi, '')
      .replace(/\s+/g, '')
      .toLowerCase();
  };

  const deleteCenter = (name: string) => {
    if (!isSystemAdmin(user)) {
      return showAlert('权限不足：仅系统管理员有权注销经营单元。');
    }
    showConfirm(`确定要注销单元 [${name}] 及其关联别名吗？`, async () => {
      if (isSyncing.current) return;

      const targetNorm = normalizeUnitName(name);
      const targetLower = name.trim().toLowerCase();

      const updatedUnits = businessUnits.filter(c => {
        const cNorm = normalizeUnitName(c);
        const cLower = c.trim().toLowerCase();
        return cNorm !== targetNorm && cLower !== targetLower;
      });

      if (updatedUnits.length === 0) {
        return showAlert('注销失败：系统至少须保留一个经营单元，经营单元列表不可为空。');
      }

      isSyncing.current = true;

      const updatedUsers = users.map(u => {
        if (!u.center) return u;
        const uCenterNorm = normalizeUnitName(u.center);
        const uCenterLower = u.center.trim().toLowerCase();
        if (uCenterNorm === targetNorm || uCenterLower === targetLower) {
          return { ...u, center: '' };
        }
        return u;
      });
      
      try {
        onUpdateBusinessUnits(updatedUnits);
        onUpdateUsers(updatedUsers);
        await syncWorkspace({ businessUnits: updatedUnits, users: updatedUsers });
        showAlert(`已成功注销单元 [${name}] 及其关联别名，并已清空关联人员归属。`);
      } catch (err) {
        showAlert('注销单元写库同步失败，请重试');
      } finally {
        isSyncing.current = false;
      }
    });
  };

  const clearAllCenters = () => {
    if (!isSystemAdmin(user)) return showAlert('权限不足：仅系统管理员有权操作。');
    return showAlert('注销失败：系统至少须保留一个经营单元，经营单元列表不可为空。');
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case Role.Admin: return '⚡';
      case Role.npcxie: return '🛡️';
      case Role.RevenueCollector: return '';
      case Role.ValueCollector: return '🌲';
      case Role.ReservoirManager: return '🌊';
      case Role.Collector: return '🔧';
      default: return '👤';
    }
  };

  const processExcelFile = (file: File) => {
    if (!isSystemAdmin(user)) {
      showAlert('权限不足：仅系统管理员有权执行批量导入。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newUsers: User[] = data.map((row: any) => {
        const rowKeys = Object.keys(row);
        const findValue = (possibleKeys: string[]) => {
          for (const pk of possibleKeys) {
            if (row[pk] !== undefined && row[pk] !== null && String(row[pk]).trim() !== '') return row[pk];
            const normalizedPK = pk.toLowerCase().replace(/\s/g, '');
            const foundKey = rowKeys.find(rk => rk.toLowerCase().replace(/\s/g, '') === normalizedPK);
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') return row[foundKey];
          }
          return undefined;
        };

        const userId = String(findValue(['loginid', 'userId', '登录名', '登录账号']) || '').trim();
        const id = String(findValue(['工号', '矿山编号', '实体ID', 'ID', 'id', '实体 ID', '用户名']) || '').trim();
        const name = String(findValue(['名称', '姓名', 'Name', 'name', '采集主体']) || '').trim();
        const roleStr = String(findValue(['角色', 'Role', 'role']) || '').toLowerCase().trim();
        const center = String(findValue(['责任人（单元负责）', '责任人', '经营单元', 'Center', 'center', '所属单元']) || '').trim();
        const rawCategory = String(findValue(['职级', '分类', 'Category', 'category', '人格分类', '人格等级分类']) || '').trim();
        
        let category: User['category'] = '初款专';
        const upperCat = rawCategory.toUpperCase();
        if (upperCat.includes('VP') || rawCategory.includes('副总')) {
          category = 'VP';
        } else if (rawCategory.includes('经管员NPC') || (rawCategory.includes('经管') && rawCategory.includes('NPC'))) {
          category = '经管员NPC';
        } else if (RANK_DICTIONARY.includes(rawCategory as any)) {
          category = rawCategory as any;
        } else {
          const matched = RANK_DICTIONARY.find(r => rawCategory.includes(r));
          if (matched) category = matched as any;
        }

        // 职级 VP（副总裁）时，工资包类型须填「VP工资包」，勿填「NPC工资包」
        const rawPackageType = String(findValue(['单月刚性工资包类型', '工资包类型', 'PackageType', '工资包类别']) || '').trim();
        let salaryPackageType: User['salaryPackageType'] = '收款工资包';
        
        if (category === 'VP') {
          salaryPackageType = 'VP工资包';
        } else if (rawPackageType) {
          const lowerType = rawPackageType.toLowerCase();
          if (lowerType.includes('vp') || lowerType.includes('副总')) {
            salaryPackageType = 'VP工资包';
          } else if (lowerType.includes('责任人') || lowerType.includes('经营单元') || lowerType.includes('经管') || lowerType.includes('经营')) {
            salaryPackageType = '经管员工资包';
          } else if (lowerType.includes('npc') || lowerType.includes('管理员') || lowerType.includes('刚性包') || lowerType.includes('系统') || lowerType.includes('水库')) {
            salaryPackageType = 'NPC工资包';
          } else if (lowerType.includes('产值') || lowerType.includes('产专') || lowerType.includes('value')) {
            salaryPackageType = '产值工资包';
          } else if (lowerType.includes('收款') || lowerType.includes('款专') || lowerType.includes('revenue') || lowerType.includes('collection')) {
            salaryPackageType = '收款工资包';
          } else {
            salaryPackageType = rawPackageType as any;
          }
        } else {
          salaryPackageType = (category as string) === 'VP' ? 'VP工资包' : '收款工资包';
        }
        
        const salaryPackageRaw = findValue(['单月刚性工资包金额', '工资包金额', '工资包额度', '工资包', 'Salary', 'salaryPackage', '金额', 'Amount', '刚性工资包金额']);
        // 金额空则按 0 落库
        const salaryPackage = (salaryPackageRaw === undefined || salaryPackageRaw === null || String(salaryPackageRaw).trim() === '')
          ? 0
          : (typeof salaryPackageRaw === 'string' 
              ? Number(salaryPackageRaw.replace(/[^0-9.]/g, '')) || 0 
              : Number(salaryPackageRaw) || 0);
        
        const isAutoAccount = AUTO_ACCOUNT_CATEGORIES.includes(category || '');
        const password = isAutoAccount ? '66668888' : 'Guardian@2026';
        const currentMonth = getLocalMonthString();

        const resignDateRaw = findValue(['离职日期', 'ResignDate', 'resignDate', '离职时间']);
        const resignDate = resignDateRaw ? String(resignDateRaw) : undefined;
        const userStatus = (resignDate || findValue(['状态', 'Status', 'userStatus']) === 'inactive') ? 'inactive' : 'active';

        let role = Role.Rank;
        if (roleStr.includes('admin') || roleStr.includes('管理员') || String(category).includes('管理员') || category === 'VP') role = Role.Admin;
        else if (roleStr.includes('xie') || roleStr.includes('核心') || category === 'NPC' || category === '经管员NPC') role = Role.npcxie;
        else if (roleStr.includes('revenue') || roleStr.includes('收款') || (category && (String(category).includes('款专')))) role = Role.RevenueCollector;
        else if (roleStr.includes('wood') || roleStr.includes('产值') || (category && (String(category).includes('产专')))) role = Role.ValueCollector;

        return { 
          id, 
          userId: userId || id, 
          name, 
          role, 
          center, 
          category, 
          salaryPackageType, 
          salaryPackage, 
          salaryHistory: [{ effectiveMonth: currentMonth, salary: salaryPackage }],
          password,
          mustChangePassword: isAutoAccount,
          userStatus: userStatus as any,
          resignDate
        };
      }).filter(u => u.id && u.name);

      if (newUsers.length > 0) {
        showConfirm(`识别到 ${newUsers.length} 个实体，是否合并入矩阵？（重复 ID 将被覆盖）`, async () => {
          if (!isSystemAdmin(user)) return showAlert('权限不足：仅系统管理员有权执行批量导入。');
          if (isSyncing.current) return;
          isSyncing.current = true;

          const newUsersMap = new Map(newUsers.map(u => [u.id, u]));
          const mergedUsers = users.map(u => newUsersMap.has(u.id) ? newUsersMap.get(u.id)! : u);
          const existingIds = new Set(users.map(u => u.id));
          const uniqueNewUsers = newUsers.filter(u => !existingIds.has(u.id));
          const finalUsers = [...mergedUsers, ...uniqueNewUsers];

          const newCenters = new Set(newUsers.map(u => u.center).filter(Boolean));
          const currentUnits = new Set(businessUnits);
          const unitsToAdd = Array.from(newCenters).filter(c => !currentUnits.has(c));
          const finalUnits = [...businessUnits, ...unitsToAdd];

          try {
            onUpdateUsers(finalUsers);
            if (unitsToAdd.length > 0) {
              onUpdateBusinessUnits(finalUnits);
            }
            await syncWorkspace({ users: finalUsers, businessUnits: finalUnits });
            showAlert('批量导入成功。');
          } catch (err) {
            showAlert('批量导入同步失败');
          } finally {
            isSyncing.current = false;
          }
        });
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processExcelFile(file);
  };

  const toggleUserStatus = async (userToToggle: User) => {
    const isResigning = userToToggle.userStatus !== 'inactive';
    
    if (isResigning) {
      // 进入离职确认流程
      setResigningUser(userToToggle);
      const today = getLocalDateString();
      setResignDate(today);
      const suggested = suggestResignHedgeAmount(userToToggle, today);
      setHedgeAmount(suggested);
      return;
    }

    // 复职逻辑
    const message = `【复职操作确认】\n确定要将 [${userToToggle.name}] 恢复为在职状态吗？\n复职后其离职日期将被清空，系统将恢复其计薪资格。`;
    
    showConfirm(message, async () => {
      if (!isSystemAdmin(user)) return showAlert('权限不足。');
      if (isSyncing.current) return;
      isSyncing.current = true;

      const updatedUsers = users.map(u => u.id === userToToggle.id ? { ...u, userStatus: 'active' as const, resignDate: undefined } : u);
      try {
        onUpdateUsers(updatedUsers);
        await syncWorkspace({ users: updatedUsers });
        showAlert(`${userToToggle.name} 已成功复职。`, () => {
          // 提示旧对冲单仍在
          showAlert('提示：复职操作不会自动冲销原有的离职对冲单，如需调整请在「动态消耗」中手动处理。');
        });
      } catch (err) {
        showAlert(`复职更新失败：${(err as Error).message || '网络问题'}`);
      } finally {
        isSyncing.current = false;
      }
    });
  };

  /**
   * 提交离职处理
   */
  const handleResignSubmit = async () => {
    if (!resigningUser || isSyncing.current) return;
    
    const userToResign = resigningUser;
    isSyncing.current = true;

    try {
      const updatedUser: User = { 
        ...userToResign, 
        userStatus: 'inactive', 
        resignDate: resignDate 
      };
      const updatedUsers = users.map(u => u.id === userToResign.id ? updatedUser : u);
      
      const syncPayload: any = { users: updatedUsers };
      
      // 如果对冲金额 > 0，生成一条非有效工时日志
      if (hedgeAmount > 0) {
        const hedgeLog = buildResignNonEffectiveHoursLog(
          userToResign,
          resignDate,
          hedgeAmount,
          user.id // 操作管理员 ID
        );
        syncPayload.logs = [hedgeLog];
      }
      
      await syncWorkspace(syncPayload);
      onUpdateUsers(updatedUsers);
      
      showAlert(`${userToResign.name} 已成功办理离职。${hedgeAmount > 0 ? '\n已自动生成一条「非有效工时对冲」待确权单据。' : ''}`);
      setResigningUser(null);
    } catch (err) {
      showAlert(`离职办理同步失败：${(err as Error).message || '未知错误'}`);
    } finally {
      isSyncing.current = false;
    }
  };

  const deleteUser = async (userId: string) => {
    if (!isSystemAdmin(user)) return showAlert('权限不足。');
    showConfirm('确定要注销此帐号吗？此操作不可逆！', async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;

      const updatedUsers = users.filter(u => u.id !== userId);
      try {
        onUpdateUsers(updatedUsers);
        await syncWorkspace({ users: updatedUsers });
        showAlert('帐号注销成功');
      } catch (err) {
        showAlert(`帐号注销失败：${(err as Error).message || '网络问题'}`);
      } finally {
        isSyncing.current = false;
      }
    });
  };

  const togglePermission = async (userId: string, permissionId: string) => {
    if (!isSystemAdmin(user)) {
      showAlert('权限不足：仅系统管理员有权手动修改组件访问权限。');
      return;
    }
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    let currentPermissions = targetUser.permissions;
    if (!currentPermissions || currentPermissions.length === 0) {
      currentPermissions = MENU_ITEMS.map(item => item.id).filter(id => checkUserPermission(targetUser, id));
    }

    const newPermissions = currentPermissions.includes(permissionId)
      ? currentPermissions.filter(p => p !== permissionId)
      : [...currentPermissions, permissionId];

    const updatedUsers = users.map(u => u.id === userId ? { ...u, permissions: newPermissions } : u);
    onUpdateUsers(updatedUsers);

    try {
      await syncWorkspace({ users: updatedUsers });
    } catch (err) {
      showAlert(`权限修改同步失败：${(err as Error).message || '网络错误'}`);
    }
  };

  const grantAllPermissions = async (userId: string) => {
    if (!isSystemAdmin(user)) {
      showAlert('权限不足：仅系统管理员有权手动修改组件访问权限。');
      return;
    }
    const allIds = MENU_ITEMS.map(item => item.id);
    const updatedUsers = users.map(u => u.id === userId ? { ...u, permissions: allIds } : u);
    onUpdateUsers(updatedUsers);
    try {
      await syncWorkspace({ users: updatedUsers });
      showAlert('已成功为该成员开启全部组件访问权限');
    } catch (err) {
      showAlert(`权限修改同步失败：${(err as Error).message || '网络错误'}`);
    }
  };

  const revokeAllPermissions = async (userId: string) => {
    if (!isSystemAdmin(user)) {
      showAlert('权限不足：仅系统管理员有权手动修改组件访问权限。');
      return;
    }
    const updatedUsers = users.map(u => u.id === userId ? { ...u, permissions: [] } : u);
    onUpdateUsers(updatedUsers);
    try {
      await syncWorkspace({ users: updatedUsers });
      showAlert('已关停该成员的所有组件访问权限');
    } catch (err) {
      showAlert(`权限修改同步失败：${(err as Error).message || '网络错误'}`);
    }
  };

  const resetUserPermissionToDefault = async (userId: string) => {
    if (!isSystemAdmin(user)) {
      showAlert('权限不足：仅系统管理员有权手动修改组件访问权限。');
      return;
    }
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        const copy = { ...u };
        delete copy.permissions;
        return copy;
      }
      return u;
    });
    onUpdateUsers(updatedUsers);
    try {
      await syncWorkspace({ users: updatedUsers });
      showAlert('已成功重置为职级默认权限配置');
    } catch (err) {
      showAlert(`重置权限同步失败：${(err as Error).message || '网络错误'}`);
    }
  };

  const filteredRbacUsers = useMemo(() => {
    return users.filter(u => {
      if (rbacCategoryFilter === '管理与VP') {
        if (u.role !== Role.Admin && u.category !== '系统管理员' && u.category !== 'VP') return false;
      } else if (rbacCategoryFilter === 'NPC与经管员') {
        if (!['NPC', '经管员NPC', '经管员高款专', '经管员高产专'].includes(u.category || '') && u.role !== Role.npcxie && u.role !== Role.ReservoirManager) return false;
      } else if (rbacCategoryFilter === '采集主体') {
        if (['系统管理员', 'VP', 'NPC', '经管员NPC'].includes(u.category || '')) return false;
      }

      if (rbacSearch.trim()) {
        const query = rbacSearch.trim().toLowerCase();
        const matchName = u.name?.toLowerCase().includes(query);
        const matchId = u.id?.toLowerCase().includes(query);
        const matchUserId = u.userId?.toLowerCase().includes(query);
        const matchCategory = u.category?.toLowerCase().includes(query);
        const matchCenter = u.center?.toLowerCase().includes(query);
        return matchName || matchId || matchUserId || matchCategory || matchCenter;
      }

      return true;
    });
  }, [users, rbacCategoryFilter, rbacSearch]);

  return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4">
        <div className="lg:col-span-4 space-y-8">
          <Card title="新增 采集主体" className="p-6 rounded-[2.5rem] border-2 border-blue-50 bg-blue-50/20 shadow-sm">
            <div className="flex justify-end mb-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-emerald-600 text-white px-4 py-1 rounded-full font-black shadow-lg hover:bg-emerald-700 transition-all flex items-center space-x-2 text-[10px] uppercase tracking-widest active:scale-95"
              >
                <span>导入</span>
                <span className="text-xs">↑</span>
              </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleExcelUpload} 
              accept=".xlsx, .xls" 
              className="hidden" 
            />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工号</p>
                  <input type="text" placeholder="工号" value={newUserFormData.id} onChange={e => setNewUserFormData({...newUserFormData, id: e.target.value})} className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-[10px] w-full" />
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">姓名</p>
                  <input type="text" placeholder="姓名" value={newUserFormData.name} onChange={e => setNewUserFormData({...newUserFormData, name: e.target.value})} className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-[10px] w-full" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">经营单元</p>
                  <select value={newUserFormData.center} onChange={e => setNewUserFormData({...newUserFormData, center: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-[10px]">
                    <option value="">指派单元...</option>
                    {businessUnits.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">职级</p>
                  <select value={newUserFormData.category} onChange={e => {
                    const cat = e.target.value as any;
                    const config = RANK_CONFIG[cat];
                    setNewUserFormData({
                      ...newUserFormData, 
                      category: cat,
                      salaryPackageType: (config?.salaryType as any) || newUserFormData.salaryPackageType
                    });
                  }} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-[10px]">
                    {RANK_DICTIONARY.map(rank => <option key={rank} value={rank}>{rank}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包类型</p>
                  <select value={newUserFormData.salaryPackageType} onChange={e => setNewUserFormData({...newUserFormData, salaryPackageType: e.target.value as any})} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold outline-none text-[10px]">
                    <option value="收款工资包">收款工资包</option>
                    <option value="产值工资包">产值工资包</option>
                    <option value="经管员工资包">经管员工资包</option>
                    <option value="NPC工资包">NPC工资包</option>
                    <option value="VP工资包">VP工资包</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包金额</p>
                  <input type="number" placeholder="工资包金额" value={newUserFormData.salaryPackage === 0 ? '' : newUserFormData.salaryPackage} onChange={e => setNewUserFormData({...newUserFormData, salaryPackage: e.target.value === '' ? 0 : Number(e.target.value)})} className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-[10px] w-full" />
                </div>
              </div>

              <button onClick={handleCreateUser} className="w-full bg-blue-600 text-white font-black py-3 rounded-xl text-[10px] tracking-widest hover:bg-blue-700 transition-all mt-2">注入采集主体矩阵</button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-8">
          {showForm && (
            <Card className="p-8 rounded-[2.5rem] border-2 border-blue-100 shadow-xl bg-white animate-in zoom-in-95 duration-200">
              <form onSubmit={handleSubmit} className="space-y-6">
                 <h4 className="font-black text-slate-800 text-sm">采集主体参数</h4>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1">登录账号</p>
                      <input type="text" placeholder="loginid" value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工号 (必填)</p>
                      <input type="text" placeholder="工号" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} disabled={!!editingUserId} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">姓名 (必填)</p>
                      <input type="text" placeholder="名称" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">指派经营单元</p>
                      <select value={formData.center} onChange={e => setFormData({...formData, center: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs">
                        <option value="">未分类 / 全域</option>
                        {businessUnits.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">职级</p>
                      <select value={formData.category} onChange={e => {
                        const cat = e.target.value as any;
                        const config = RANK_CONFIG[cat];
                        setFormData({
                          ...formData, 
                          category: cat,
                          salaryPackageType: (config?.salaryType as any) || formData.salaryPackageType
                        });
                      }} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs">
                        {RANK_DICTIONARY.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包类型</p>
                      <select value={formData.salaryPackageType} onChange={e => setFormData({...formData, salaryPackageType: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs">
                        {['收款工资包', '产值工资包', '经管员工资包', 'NPC工资包', 'VP工资包'].map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包金额</p>
                      <input type="number" placeholder="工资包金额" value={formData.salaryPackage === 0 ? '' : formData.salaryPackage} onChange={e => setFormData({...formData, salaryPackage: e.target.value === '' ? 0 : Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">重置密码 (留空则不修改)</p>
                      <input type="password" placeholder="新密码" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">确认新密码</p>
                      <input type="password" placeholder="确认密码" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
                    </div>
                 </div>
                 <div className="flex justify-end space-x-3">
                   <button type="button" onClick={resetForm} className="px-6 py-3 font-bold text-slate-400 text-xs">取消</button>
                   <button type="submit" className="bg-blue-600 text-white font-black px-10 py-3 rounded-xl text-xs">{editingUserId ? '保存变更' : '激活人格'}</button>
                 </div>
              </form>
            </Card>
          )}

          <div className="space-y-4">
             <div className="flex items-center justify-between gap-4 px-2 flex-wrap">
               <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center">
                 <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                 采集主体矩阵
               </h4>
                <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                  <button onClick={() => setActiveCategory('全部')} className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${activeCategory === '全部' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>全部</button>
                  <button onClick={() => setActiveCategory('采集主体')} className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${activeCategory === '采集主体' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>采集主体</button>
                  <button onClick={() => setActiveCategory('管理与VP')} className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${activeCategory === '管理与VP' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>管理与VP</button>
                  <div className="relative ml-2">
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索姓名/工号/单元..."
                      className="bg-slate-100 border-none rounded-full px-4 py-1.5 text-[9px] font-black focus:ring-2 focus:ring-blue-500 outline-none w-32 md:w-48 transition-all"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
                      >
                        ×
                      </button>
                    )}
                  </div>

                </div>
             </div>
             <div className="space-y-8">
               {(() => {
                  const collectors = filteredUsers.filter(u => u.category?.includes('专') || u.role === Role.Rank || u.role === Role.RevenueCollector || u.role === Role.ValueCollector || activeCategory !== '采集主体');
                  const groups: Record<string, User[]> = {};
                  businessUnits.forEach(unit => { groups[unit] = []; });
                  collectors.forEach(u => {
                    const center = u.center || '未分配经营单元';
                    if (!groups[center]) groups[center] = [];
                    groups[center].push(u);
                  });
                  return Object.entries(groups).sort(([a], [b]) => {
                    if (a === '未分配经营单元') return 1;
                    if (b === '未分配经营单元') return -1;
                    return a.localeCompare(b);
                  }).map(([center, centerUsers], idx) => (
                  <div key={idx} className="space-y-4">
                    <h5 className="text-xs font-black text-slate-700 tracking-widest uppercase border-b border-slate-100 pb-2 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span>
                      {center} <span className="ml-2 text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">{centerUsers.length} 人</span>
                    </h5>
                    
                      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-center border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">工号</th>
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">姓名</th>
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">经营单元</th>
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">分类/职级</th>
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">月刚性工资包</th>
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">在职状态</th>
                                <th className="py-2.5 px-4 text-center whitespace-nowrap">管理操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                              {centerUsers.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-6 text-slate-400 text-center font-bold">暂无成员数据</td>
                                </tr>
                              ) : (
                                centerUsers.map((u) => {
                                  const isInactive = u.userStatus === 'inactive';
                                  return (
                                    <tr key={u.id} className={`hover:bg-slate-50/70 transition-colors ${isInactive ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                      <td className="py-2.5 px-4 font-mono text-slate-500 font-bold text-[11px] whitespace-nowrap">{u.id}</td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        <div className="flex items-center justify-center space-x-2">
                                          <div className="w-6 h-6 bg-slate-900 rounded-md flex items-center justify-center text-xs text-white overflow-hidden shrink-0">
                                            {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : getRoleIcon(u.role)}
                                          </div>
                                          <span className="font-black text-slate-900">{u.name}</span>
                                        </div>
                                      </td>
                                      <td className="py-2.5 px-4 text-slate-600 font-bold whitespace-nowrap">{center}</td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        <Badge className="text-[8px] px-2 py-0.5 bg-blue-50 text-blue-600 border-none">{u.category}</Badge>
                                      </td>
                                      <td className="py-2.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                                        {formatMoney(u.salaryPackage || 0)}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        {isInactive ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-rose-50 text-rose-600 border border-rose-200">
                                            离职 {u.resignDate ? `(${u.resignDate})` : ''}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200">
                                            在职
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 whitespace-nowrap">
                                        <div className="flex items-center justify-center space-x-2">
                                          <button onClick={() => handleEdit(u)} className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded text-[10px] font-black transition-colors">
                                            属性
                                          </button>
                                          <button 
                                            onClick={() => toggleUserStatus(u)} 
                                            className={`px-2 py-1 ${isInactive ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600' : 'bg-orange-50 hover:bg-orange-100 text-orange-600'} rounded text-[10px] font-black transition-colors`}
                                          >
                                            {isInactive ? '复职' : '离职'}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                  </div>
                ))})()}
             </div>
          </div>
        </div>

        <div className="lg:col-span-12 space-y-8 mt-12 pb-12">
          <Card title="经营单元经理" className="p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3 max-w-2xl">
                <input 
                  type="text" 
                  value={newCenterName} 
                  onChange={e => setNewCenterName(e.target.value)} 
                  placeholder="新经营单元名称..." 
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm focus:ring-2 focus:ring-slate-900 transition-all min-w-[200px]" 
                />
                <div className="flex items-center space-x-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-bold text-slate-400 px-2">属性:</span>
                  <button
                    type="button"
                    onClick={() => setNewCenterCategory('前台')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${newCenterCategory === '前台' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    前台
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCenterCategory('后台')}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${newCenterCategory === '后台' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    后台
                  </button>
                </div>
                <button onClick={addCenter} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs hover:bg-blue-600 transition-all shadow-lg active:scale-95 whitespace-nowrap">
                  新增单元
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {businessUnits.map((center, index) => {
                  const centerUsers = users.filter(u => u.center === center);
                  const collectors = centerUsers.filter(u => u.category?.includes('专') || u.role === Role.Rank || u.role === Role.RevenueCollector || u.role === Role.ValueCollector);
                  const totalCost = centerUsers.reduce((acc, u) => acc + (u.salaryPackage || 0), 0);
                  const isBackOffice = center.includes('后台') || ['HR', 'FIN', 'QA', '行政', 'IT'].some(dept => center.toUpperCase().includes(dept));
                  return (
                    <div key={index} className="bg-white p-6 rounded-[2rem] border border-slate-100 group hover:shadow-md transition-all">
                      <div className="flex items-center justify-between">
                        {editingCenter === center ? (
                          <input 
                            autoFocus
                            value={editCenterValue}
                            onChange={e => setEditCenterValue(e.target.value)}
                            onBlur={() => saveCenterRename(center)}
                            onKeyDown={e => e.key === 'Enter' && saveCenterRename(center)}
                            className="font-black text-slate-800 text-sm bg-slate-50 border-b border-blue-500 outline-none w-2/3"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800 text-sm">{center}</span>
                            {isBackOffice ? (
                              <span className="px-2 py-0.5 text-[8px] font-black rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 shrink-0">
                                后台
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[8px] font-black rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                                前台
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                           <button 
                             onClick={() => startEditingCenter(center)} 
                             className="text-blue-500 opacity-0 group-hover:opacity-100 uppercase text-[10px] font-black transition-all hover:scale-110"
                           >
                             编辑
                           </button>
                           <button onClick={() => deleteCenter(center)} className="text-rose-500 opacity-0 group-hover:opacity-100 uppercase text-[10px] font-black transition-all hover:scale-110">注销</button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <p className="font-bold text-slate-400">刚性成本包</p>
                        <p className="font-black text-slate-800">{totalCost.toLocaleString()}</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-50">
                         <div className="flex justify-between items-center mb-2">
                           <p className="text-[8px] font-black text-slate-400 uppercase">归类采集主体</p>
                           <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">{collectors.length} 人</span>
                         </div>
                         <div className="flex flex-wrap gap-1">
                            {collectors.length > 0 ? (
                              collectors.slice(0, 5).map(u => (
                                <span key={u.id} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold border border-slate-100 truncate max-w-[80px]">
                                  {u.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[9px] text-slate-300 italic">暂无归类人员</span>
                            )}
                            {collectors.length > 5 && <span className="text-[9px] text-slate-400 font-bold self-center">...</span>}
                         </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card 
            title="帐号管理 (权限账户概览)" 
            className="p-8 rounded-[3rem] border border-slate-100 shadow-sm"
            headerAction={
              <button 
                onClick={() => setShowAddAccountForm(!showAddAccountForm)}
                className={`text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all shadow-md ${showAddAccountForm ? 'bg-rose-50 text-rose-500 active:scale-95' : 'bg-slate-900 text-white hover:bg-blue-600 active:scale-95'}`}
              >
                {showAddAccountForm ? '取消新增' : '新增加管理帐号'}
              </button>
            }
          >
             <div className="space-y-6">
               {showAddAccountForm && (
                 <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 space-y-6 animate-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 tracking-widest ml-1">登录名</p>
                        <input type="text" placeholder="设置登录 ID" value={newUserFormData.userId} onChange={e => setNewUserFormData({...newUserFormData, userId: e.target.value})} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm w-full focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">工号</p>
                        <input type="text" placeholder="内部唯一识别号" value={newUserFormData.id} onChange={e => setNewUserFormData({...newUserFormData, id: e.target.value})} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm w-full focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">真实姓名</p>
                        <input type="text" placeholder="输入持有人姓名" value={newUserFormData.name} onChange={e => setNewUserFormData({...newUserFormData, name: e.target.value})} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm w-full focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">初始密码</p>
                        <input type="password" placeholder="设置初始密码 (指定职级默认66668888)" value={newUserFormData.password} onChange={e => setNewUserFormData({...newUserFormData, password: e.target.value})} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm w-full focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">权限职级分配</p>
                      <select 
                        value={newUserFormData.category} 
                        onChange={e => {
                          const cat = e.target.value as any;
                          const isAuto = AUTO_ACCOUNT_CATEGORIES.includes(cat);
                          setNewUserFormData({
                            ...newUserFormData, 
                            category: cat,
                            password: isAuto ? '66668888' : newUserFormData.password
                          });
                        }} 
                        className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        {RANK_DICTIONARY.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <button 
                      onClick={() => {
                        handleCreateUser();
                        setShowAddAccountForm(false);
                      }} 
                      className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl text-xs tracking-[0.3em] uppercase hover:bg-blue-700 transition-all shadow-xl active:scale-95"
                    >
                      确认激活帐号
                    </button>
                 </div>
               )}
               <div className="space-y-4">
                 <div className="p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl text-xs font-bold text-indigo-900 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <span className="text-base">🔐</span>
                     <span>自动建号说明：当采集主体职级为 <strong>【经管员高款专, 经管员高产专, 经管员NPC, VP】</strong> 时，系统自动配发登录账号，默认初始密码为 <strong>66668888</strong>，首次登录后提醒修改密码。</span>
                   </div>
                 </div>
                 <div className="overflow-x-auto">
                   <table className="w-full text-left">
                     <thead>
                       <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 tracking-widest leading-none">
                         <th className="py-6 px-3 whitespace-nowrap">登录账号</th>
                         <th className="py-6 px-3 whitespace-nowrap">工号</th>
                         <th className="py-6 px-3 whitespace-nowrap">姓名</th>
                         <th className="py-6 px-3 whitespace-nowrap">职级</th>
                         <th className="py-6 px-3 whitespace-nowrap">账号机制/初始密码</th>
                         <th className="py-6 px-3 text-right whitespace-nowrap">管理操作</th>
                       </tr>
                     </thead>
                     <tbody>
                       {users.filter(u => u.role === Role.Admin || u.category === 'NPC' || u.category === '经管员NPC' || u.category === 'VP' || u.category === '系统管理员' || AUTO_ACCOUNT_CATEGORIES.includes(u.category || '') || u.role === Role.Rank).map((u, idx) => {
                         const isAutoAccount = AUTO_ACCOUNT_CATEGORIES.includes(u.category || '');
                         return (
                         <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${u.userStatus === 'inactive' ? 'opacity-40' : ''}`}>
                           <td className="py-5 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">{u.userId || u.id}</td>
                           <td className="py-5 px-3 font-mono font-bold text-xs whitespace-nowrap">{u.id}</td>
                           <td className="py-5 px-3 whitespace-nowrap">
                             <div className="flex items-center space-x-3">
                               {u.avatar ? (
                                 <img src={u.avatar} className="w-6 h-6 rounded-md object-cover flex-shrink-0" />
                               ) : (
                                 <span className="text-lg flex-shrink-0">{getRoleIcon(u.role)}</span>
                               )}
                               <span className="font-black text-slate-800 text-sm whitespace-nowrap">{u.name}</span>
                             </div>
                           </td>
                           <td className="py-5 px-3 whitespace-nowrap">
                             <Badge className="bg-slate-100 text-slate-600 font-black border-none text-[9px] uppercase tracking-widest">{u.category}</Badge>
                           </td>
                           <td className="py-5 px-3 whitespace-nowrap">
                             {isAutoAccount ? (
                               <Badge className="bg-amber-100 text-amber-800 border-none text-[9px] font-bold">
                                 自动建号 | 默认密码: 66668888
                               </Badge>
                             ) : (
                               <Badge className="bg-slate-100 text-slate-500 border-none text-[9px]">
                                 常规账号
                               </Badge>
                             )}
                           </td>
                           <td className="py-5 px-3 text-right whitespace-nowrap">
                              <button onClick={() => handleEdit(u)} className="text-blue-600 font-black text-xs hover:underline">编辑权限</button>
                               <button onClick={() => deleteUser(u.id)} className="text-rose-600 font-black text-xs hover:underline ml-3">注销</button>
                           </td>
                         </tr>
                       );
                       })}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>
          </Card>
        </div>

        {/* Permissions */}
        <div className="lg:col-span-12 mt-8">
           <Card title="组件访问权限矩阵 (RBAC 控制中心)" className="p-8 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
             <div className="space-y-6">
               {/* 说明与搜索过滤工具栏 */}
               <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div className="space-y-1">
                   <div className="flex items-center gap-2">
                     <span className="text-base">🔐</span>
                     <h5 className="font-black text-slate-900 text-xs">RBAC 自定义访问权限控制</h5>
                   </div>
                   <p className="text-[11px] text-slate-500 font-medium">
                     系统管理员可直接在此点选开启或关闭任意成员的组件访问权限。开启后将覆盖其职级默认权限规则，全局实时生效。
                   </p>
                 </div>
                 
                 <div className="flex items-center gap-2 flex-wrap">
                   <input 
                     type="text" 
                     value={rbacSearch}
                     onChange={e => setRbacSearch(e.target.value)}
                     placeholder="搜索成员姓名 / 工号 / 职级..." 
                     className="bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-slate-900 w-52"
                   />
                   <div className="flex items-center space-x-1 bg-slate-200/70 p-1 rounded-xl">
                     {(['全部', '管理与VP', 'NPC与经管员', '采集主体'] as const).map(cat => (
                       <button
                         key={cat}
                         type="button"
                         onClick={() => setRbacCategoryFilter(cat)}
                         className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${rbacCategoryFilter === cat ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                       >
                         {cat}
                       </button>
                     ))}
                   </div>
                 </div>
               </div>

               {/* 人员权限列表 */}
               {filteredRbacUsers.length === 0 ? (
                 <div className="py-12 text-center text-slate-400 font-bold text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                   未找到符合条件的成员
                 </div>
               ) : (
                 filteredRbacUsers.map((u) => {
                   const isCustom = Array.isArray(u.permissions) && u.permissions.length > 0;
                   const enabledCount = MENU_ITEMS.filter(item => checkUserPermission(u, item.id)).length;
                   
                   return (
                     <div key={u.id} className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all space-y-4">
                       <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                         <div className="flex items-center space-x-3">
                           <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-base overflow-hidden shrink-0">
                             {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : getRoleIcon(u.role)}
                           </div>
                           <div>
                             <div className="flex items-center gap-2">
                               <h5 className="font-black text-slate-900 text-xs">{u.name}</h5>
                               <Badge className="bg-slate-100 text-slate-600 font-bold border-none text-[9px]">{u.category}</Badge>
                               {u.center && <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{u.center}</span>}
                             </div>
                             <p className="text-[10px] text-slate-400 font-mono">工号: {u.id} {u.userId ? `| 账号: ${u.userId}` : ''}</p>
                           </div>
                         </div>

                          <div className="flex items-center space-x-2">
                            {isCustom ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5 animate-pulse"></span>
                                自定义模式 ({enabledCount}/{MENU_ITEMS.length})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                                默认职级模式 ({enabledCount}/{MENU_ITEMS.length})
                              </span>
                            )}

                           <div className="flex items-center space-x-1 pl-2 border-l border-slate-100">
                             <button
                               type="button"
                               onClick={() => grantAllPermissions(u.id)}
                               className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                               title="开启该成员所有组件权限"
                             >
                               全选
                             </button>
                             <button
                               type="button"
                               onClick={() => revokeAllPermissions(u.id)}
                               className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                               title="禁用该成员所有组件权限"
                             >
                               清空
                             </button>
                             {isCustom && (
                               <button
                                 type="button"
                                 onClick={() => resetUserPermissionToDefault(u.id)}
                                 className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                 title="恢复为职级默认权限"
                               >
                                 重置默认
                               </button>
                             )}
                           </div>
                         </div>
                       </div>

                       {/* 12 个组件矩阵勾选按钮 */}
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                         {MENU_ITEMS.map(item => {
                           const hasPermission = checkUserPermission(u, item.id);
                           return (
                             <button 
                               key={item.id}
                               type="button"
                               onClick={() => togglePermission(u.id, item.id)}
                               className={`flex items-center justify-between p-2.5 rounded-xl text-[10px] font-bold transition-all border ${
                                 hasPermission 
                                   ? 'bg-blue-600 text-white border-blue-600 shadow-xs' 
                                   : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                               }`}
                             >
                               <div className="flex items-center space-x-1.5 truncate">
                                 <span className="text-xs">{item.icon}</span>
                                 <span className="truncate">{item.label}</span>
                               </div>
                               <span className={`text-[10px] font-black ml-1 shrink-0 ${hasPermission ? 'text-white' : 'text-slate-300'}`}>
                                 {hasPermission ? '✓' : '✕'}
                               </span>
                             </button>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })
               )}
             </div>
           </Card>
        </div>
        <CityGuardianModal state={modalState} onClose={closeModal} />
        
        {/* 离职办理专供弹窗 */}
        {resigningUser && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all scale-100">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🛡️</span>
                  <h3 className="font-bold text-base tracking-wide">城市守护者 · 离职办理</h3>
                </div>
                <button 
                  onClick={() => setResigningUser(null)}
                  className="text-slate-400 hover:text-white transition-colors p-1 rounded-md"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-bold mb-1">离职人员</p>
                  <p className="text-sm font-black text-slate-900">{resigningUser.name} ({resigningUser.id})</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 ml-1 uppercase">离职日期</p>
                  <input 
                    type="date" 
                    value={resignDate} 
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setResignDate(newDate);
                      setHedgeAmount(suggestResignHedgeAmount(resigningUser, newDate));
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 ml-1 uppercase">非有效工时对冲金额 (实际对冲额)</p>
                  <input 
                    type="number" 
                    value={hedgeAmount} 
                    onChange={(e) => setHedgeAmount(Math.round(Number(e.target.value)))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[9px] text-blue-600 font-bold mt-1 ml-1 italic">
                    {getResignHedgeFormulaDesc(resigningUser, resignDate)}
                  </p>
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-[10px] leading-relaxed text-blue-700 font-medium">
                    业务说明：<br/>
                    1. 离职当月整月仍计入单元刚性工资包。<br/>
                    2. 若离职非月末，建议设置对冲金额以冲减当月刚性。<br/>
                    3. 对冲金额将生成「非有效工时」单据，经确权后在看板生效。
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={() => setResigningUser(null)}
                  className="px-6 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleResignSubmit}
                  className="px-8 py-2.5 text-xs font-black text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
                >
                  确认办理
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default PersonnelPool;
