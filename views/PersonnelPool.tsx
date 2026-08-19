import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Role } from '../types';
import * as XLSX from 'xlsx';
import { Card, Badge } from '../src/components/UI';
import { UserTableRow } from '../src/components/UserTableRow';
import { MENU_ITEMS } from '../constants';
import { checkUserPermission, RANK_CONFIG } from '../src/utils/business';
import { getLocalMonthString } from '../src/utils/dateUtils';
import { toast } from 'sonner';
import { syncWorkspace } from '../src/services/api';
import { CityGuardianModal, useCityGuardianModal } from '../src/components/CityGuardianModal';

interface PersonnelPoolProps {
  users: User[];
  onUpdateUsers: (users: User[]) => void;
  onUpdatePassword: (userId: string, newPassword: string) => Promise<boolean>;
  onClearTestData?: () => void;
  businessUnits: string[];
  onUpdateBusinessUnits: (units: string[]) => void;
}

const PersonnelPool: React.FC<PersonnelPoolProps> = ({ users, onUpdateUsers, onUpdatePassword, onClearTestData, businessUnits, onUpdateBusinessUnits }) => {
  const { modalState, showAlert, showConfirm, closeModal } = useCityGuardianModal();
  const [newCenterName, setNewCenterName] = useState('');
  const [editingCenter, setEditingCenter] = useState<string | null>(null);
  const [editCenterValue, setEditCenterValue] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<'全部' | '采集主体' | '水库管理' | '组件权限设置' | '批量导入 EXCEL'>('全部');
  
  const [searchQuery, setSearchQuery] = useState('');
  
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
    password: '666888'
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredUsers = useMemo(() => {
    let result = users;
    if (activeCategory === '采集主体') {
      result = users.filter(u => 
        u.category !== 'NPC' && u.category !== '系统管理员' && 
        (['初款专', '中款专', '高款专', '初产专', '中产专', '高产专', '经管员高款专', '经管员高产专'].includes(u.category || '') || [Role.Rank, Role.RevenueCollector, Role.ValueCollector].includes(u.role))
      );
    } else if (activeCategory === '水库管理') {
      result = users.filter(u => u.category === '水库管理员' || u.role === Role.ReservoirManager);
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
    if (!newUserFormData.id || !newUserFormData.name || !newUserFormData.category) return showAlert('请填写完整信息');
    if (users.some(u => u.id === newUserFormData.id)) return showAlert(`ID 冲突：工号 [${newUserFormData.id}] 已被占用。`);
    
    const currentMonth = getLocalMonthString();
    const newUser: User = {
      id: newUserFormData.id,
      userId: newUserFormData.userId || newUserFormData.id,
      name: newUserFormData.name,
      center: newUserFormData.center,
      role: Role.Rank, 
      category: newUserFormData.category,
      secondaryRoles: newUserFormData.secondaryRoles,
      salaryPackageType: newUserFormData.salaryPackageType,
      salaryPackage: newUserFormData.salaryPackage,
      salaryHistory: [{ effectiveMonth: currentMonth, salary: newUserFormData.salaryPackage }],
      permissions: [],
      userStatus: 'active'
    };

    const updatedUsers = [...users, newUser];
    try {
      await syncWorkspace({ users: updatedUsers });
      await onUpdatePassword(newUser.id, newUserFormData.password);
      onUpdateUsers(updatedUsers);
      toast.success('新实体创建成功并已写库。');
      setNewUserFormData({ 
        id: '', 
        userId: '',
        name: '', 
        center: '', 
        category: '初款专', 
        salaryPackageType: '产值工资包',
        salaryPackage: 0,
        secondaryRoles: [], 
        password: '666888' 
      });
    } catch (err) {
      toast.error(`新实体创建写库失败：${(err as Error).message || '网络问题'}`);
    }
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
    if (!formData.id || !formData.name) return;

    if (formData.password && formData.password !== formData.confirmPassword) {
      showAlert('两次输入的密码不一致，请重新确认。');
      return;
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
    else if (cat === '水库管理员') role = Role.ReservoirManager;
    else if (cat === 'NPC') role = Role.npcxie;
    else if (cat === '系统管理员') role = Role.Admin;

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
      userStatus: existingUser?.userStatus || 'active'
    };

    const nextUsers = editingUserId 
      ? users.map(u => u.id === editingUserId ? userToSave : u)
      : [...users, userToSave];

    try {
      await syncWorkspace({ users: nextUsers });
      if (formData.password) {
        await onUpdatePassword(formData.id, formData.password);
      }
      onUpdateUsers(nextUsers);
      toast.success(editingUserId ? '用户信息更新成功并已写库。' : '新的人格实体已成功注入矩阵并写库。');
      resetForm();
    } catch (err) {
      toast.error(`用户信息写库失败：${(err as Error).message || '网络错误'}`);
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

  const addCenter = () => {
    if (!newCenterName.trim()) {
      toast.error('请输入单元名称');
      return;
    }
    if (businessUnits.includes(newCenterName.trim())) {
      toast.error('该经营单元已存在');
      return;
    }
    const updatedUnits = [...businessUnits, newCenterName.trim()];
    onUpdateBusinessUnits(updatedUnits);
    setNewCenterName('');
    toast.success(`成功新增单元: ${newCenterName}`);
  };

  const startEditingCenter = (center: string) => {
    setEditingCenter(center);
    setEditCenterValue(center);
  };

  const saveCenterRename = (oldName: string) => {
    const newName = editCenterValue.trim();
    if (!newName || newName === oldName) {
      setEditingCenter(null);
      return;
    }
    if (businessUnits.includes(newName)) {
      toast.error('该经营单元已存在');
      return;
    }
    const updatedUnits = businessUnits.map(unit => unit === oldName ? newName : unit);
    onUpdateBusinessUnits(updatedUnits);
    onUpdateUsers(users.map(u => u.center === oldName ? { ...u, center: newName } : u));
    setEditingCenter(null);
    toast.success(`单元 [${oldName}] 已重命名为 [${newName}]`);
  };

  const deleteCenter = (name: string) => {
    const updatedUnits = businessUnits.filter(c => c !== name);
    onUpdateBusinessUnits(updatedUnits);
    onUpdateUsers(users.map(u => u.center === name ? { ...u, center: '' } : u));
    toast.success(`已注销单元: ${name}`);
  };

  const clearAllCenters = () => {
    showConfirm('确定要清空所有经营单元吗？', () => {
      onUpdateBusinessUnits([]);
      onUpdateUsers(users.map(u => ({ ...u, center: '' })));
      toast.success('经营单元列表已全部清空');
    });
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
            if (row[pk] !== undefined && row[pk] !== null) return row[pk];
            const normalizedPK = pk.toLowerCase().replace(/\s/g, '');
            const foundKey = rowKeys.find(rk => rk.toLowerCase().replace(/\s/g, '') === normalizedPK);
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) return row[foundKey];
          }
          return undefined;
        };

        const userId = String(findValue(['loginid', 'userId', '登录名', '登录账号']) || '');
        const id = String(findValue(['工号', '矿山编号', '实体ID', 'ID', 'id', '实体 ID', '用户名']) || '');
        const name = String(findValue(['名称', '姓名', 'Name', 'name', '采集主体']) || '');
        const roleStr = String(findValue(['角色', 'Role', 'role']) || '').toLowerCase();
        const center = String(findValue(['责任人（单元负责）', '责任人', '经营单元', 'Center', 'center', '所属单元']) || '');
        const category = (findValue(['职级', '分类', 'Category', 'category', '人格分类', '人格等级分类']) || '初款专') as User['category'];
        
        let salaryPackageType = (findValue(['单月刚性工资包类型', '工资包类型', 'PackageType', '工资包类别']) || '收款工资包') as User['salaryPackageType'];
        const lowerType = String(salaryPackageType).toLowerCase();
        if (lowerType.includes('责任人') || lowerType.includes('经营单元') || lowerType.includes('经管') || lowerType.includes('经营')) {
          salaryPackageType = '经管员工资包';
        } else if (lowerType.includes('npc') || lowerType.includes('管理员') || lowerType.includes('刚性包') || lowerType.includes('系统') || lowerType.includes('水库')) {
          salaryPackageType = 'NPC工资包';
        } else if (lowerType.includes('产值') || lowerType.includes('产专') || lowerType.includes('value')) {
          salaryPackageType = '产值工资包';
        } else if (lowerType.includes('收款') || lowerType.includes('款专') || lowerType.includes('revenue') || lowerType.includes('collection')) {
          salaryPackageType = '收款工资包';
        } else {
          salaryPackageType = '收款工资包'; // Default fallback
        }
        
        const salaryPackageRaw = findValue(['单月刚性工资包金额', '工资包金额', '工资包', 'Salary', 'salaryPackage', '金额', 'Amount', '刚性工资包金额']);
        const salaryPackage = typeof salaryPackageRaw === 'string' 
          ? Number(salaryPackageRaw.replace(/[^0-9.]/g, '')) 
          : Number(salaryPackageRaw || 0);
        
        const password = '666888';
        const currentMonth = getLocalMonthString();

        let role = Role.Rank;
        if (roleStr.includes('admin') || roleStr.includes('管理员') || String(category).includes('管理员')) role = Role.Admin;
        else if (roleStr.includes('xie') || roleStr.includes('核心') || category === 'NPC') role = Role.npcxie;
        else if (roleStr.includes('revenue') || roleStr.includes('收款') || (category && (String(category).includes('款专')))) role = Role.RevenueCollector;
        else if (roleStr.includes('wood') || roleStr.includes('产值') || (category && (String(category).includes('产专')))) role = Role.ValueCollector;
        else if (roleStr.includes('reservoir') || roleStr.includes('水库') || category === '水库管理员') role = Role.ReservoirManager;

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
          userStatus: 'active' as const 
        };
      }).filter(u => u.id && u.name);

      if (newUsers.length > 0) {
        showConfirm(`识别到 ${newUsers.length} 个实体，是否合并入矩阵？（重复 ID 将被覆盖）`, () => {
          const newUsersMap = new Map(newUsers.map(u => [u.id, u]));
          const updatedUsers = users.map(u => newUsersMap.has(u.id) ? newUsersMap.get(u.id)! : u);
          const existingIds = new Set(users.map(u => u.id));
          const uniqueNewUsers = newUsers.filter(u => !existingIds.has(u.id));
          onUpdateUsers([...updatedUsers, ...uniqueNewUsers]);
          const newCenters = new Set(newUsers.map(u => u.center).filter(Boolean));
          const currentUnits = new Set(businessUnits);
          const unitsToAdd = Array.from(newCenters).filter(c => !currentUnits.has(c));
          if (unitsToAdd.length > 0) {
            onUpdateBusinessUnits([...businessUnits, ...unitsToAdd]);
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

  const toggleUserStatus = async (user: User) => {
    const isResigning = user.userStatus !== 'inactive';
    const message = isResigning 
      ? `【离职操作确认】\n确定要将 [${user.name}] 办理离职注销吗？\n离职后该账号将无法登录，且默认不在业务列表中显示，但历史数据仍可追溯。`
      : `【复职操作确认】\n确定要将 [${user.name}] 恢复为在职状态吗？`;
    
    showConfirm(message, async () => {
      const newStatus = isResigning ? 'inactive' : 'active';
      const updatedUsers = users.map(u => u.id === user.id ? { ...u, userStatus: newStatus as any } : u);
      try {
        await syncWorkspace({ users: updatedUsers });
        onUpdateUsers(updatedUsers);
        toast.success(`${user.name} 已成功${isResigning ? '离职注销' : '复职'}并已写库`);
      } catch (err) {
        toast.error(`注销/复职写库失败：${(err as Error).message || '网络问题'}`);
      }
    });
  };

  const deleteUser = async (userId: string) => {
    showConfirm('确定要注销此帐号吗？此操作不可逆！', async () => {
      const updatedUsers = users.filter(u => u.id !== userId);
      try {
        await syncWorkspace({ users: updatedUsers });
        onUpdateUsers(updatedUsers);
        toast.success('帐号注销已写库');
      } catch (err) {
        toast.error(`注销帐号写库失败：${(err as Error).message || '网络问题'}`);
      }
    });
  };

  const togglePermission = (userId: string, permissionId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const currentPermissions = user.permissions || [];
    const newPermissions = currentPermissions.includes(permissionId)
      ? currentPermissions.filter(p => p !== permissionId)
      : [...currentPermissions, permissionId];
    onUpdateUsers(users.map(u => u.id === userId ? { ...u, permissions: newPermissions } : u));
  };

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
                    {Object.keys(RANK_CONFIG).filter(r => r.includes('专') || r.includes('管理员') || r === 'NPC').map(rank => <option key={rank} value={rank}>{rank}</option>)}
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
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包额度</p>
                  <input type="number" placeholder="金额" value={newUserFormData.salaryPackage === 0 ? '' : newUserFormData.salaryPackage} onChange={e => setNewUserFormData({...newUserFormData, salaryPackage: Number(e.target.value)})} className="bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold outline-none text-[10px] w-full" />
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
                      <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs">
                        {['系统管理员', 'NPC', '水库管理员', '初款专', '中款专', '高款专', '经管员高款专', '初产专', '中产专', '高产专', '经管员高产专'].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包类型</p>
                      <select value={formData.salaryPackageType} onChange={e => setFormData({...formData, salaryPackageType: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs">
                        {['收款工资包', '产值工资包', '经管员工资包', 'NPC工资包'].map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-bold text-slate-400 ml-1 uppercase">工资包额度</p>
                      <input type="number" placeholder="额度" value={formData.salaryPackage} onChange={e => setFormData({...formData, salaryPackage: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
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
             <div className="flex items-center justify-start gap-8 px-2">
               <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center">
                 <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                 采集主体矩阵
               </h4>
                <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                  <button onClick={() => setActiveCategory('全部')} className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${activeCategory === '全部' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>全部</button>
                  <button onClick={() => setActiveCategory('采集主体')} className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${activeCategory === '采集主体' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>采集主体</button>
                  <button onClick={() => setActiveCategory('水库管理')} className={`px-4 py-1.5 rounded-full text-[9px] font-black transition-all ${activeCategory === '水库管理' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>水库管理</button>
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
                  const collectors = filteredUsers.filter(u => u.category?.includes('专') || u.role === Role.Rank);
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
                    <h5 className="text-xs font-black text-slate-500 tracking-widest uppercase border-b border-slate-100 pb-2 flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2"></span>
                      {center} <span className="ml-2 text-[9px] bg-slate-100 px-2 py-0.5 rounded-full font-mono">{centerUsers.length}</span>
                    </h5>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      {centerUsers.map((u) => {
                        const isInactive = u.userStatus === 'inactive';
                        return (
                          <div key={u.id} className={`bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative ${isInactive ? 'opacity-60 bg-slate-50' : ''}`}>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                              <button onClick={() => handleEdit(u)} className="p-1 px-2 bg-blue-50 text-blue-600 rounded text-[8px] font-black uppercase">属性</button>
                              <button 
                                onClick={() => toggleUserStatus(u)} 
                                className={`p-1 px-2 ${isInactive ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'} rounded text-[8px] font-black uppercase`}
                              >
                                {isInactive ? '复职' : '离职'}
                              </button>
                            </div>
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-xl shadow-lg overflow-hidden">
                                {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" /> : getRoleIcon(u.role)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h5 className="font-black text-slate-900 text-xs truncate">{u.name}</h5>
                                  {isInactive && <span className="text-[8px] bg-slate-200 text-slate-500 px-1 rounded font-black italic">EXIT</span>}
                                </div>
                                <p className="text-[9px] text-slate-400 font-mono">工号: {u.id}</p>
                              </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3">
                              <Badge className="text-[8px] px-1.5 bg-blue-50/50 text-blue-600 border-none">{u.category}</Badge>
                              <span className="text-[10px] font-black text-slate-700 font-mono">{(u.salaryPackage || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))})()}
             </div>
          </div>
        </div>

        <div className="lg:col-span-12 space-y-8 mt-12 pb-12">
          <Card title="经营单元经理" className="p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm" headerAction={businessUnits.length > 0 && (
            <button onClick={clearAllCenters} className="text-rose-500 font-black text-xs uppercase tracking-widest px-4 py-2 hover:bg-rose-50 rounded-xl">一键清空单元库</button>
          )}>
            <div className="space-y-6">
              <div className="flex gap-4 max-w-md">
                <input type="text" value={newCenterName} onChange={e => setNewCenterName(e.target.value)} placeholder="新经营单元名称..." className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm focus:ring-2 focus:ring-slate-900 transition-all" />
                <button onClick={addCenter} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs hover:bg-blue-600 transition-all shadow-lg active:scale-95">新增单元</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {businessUnits.map((center, index) => {
                  const centerUsers = users.filter(u => u.center === center);
                  const collectors = centerUsers.filter(u => u.category?.includes('专') || u.role === Role.Rank || u.role === Role.RevenueCollector || u.role === Role.ValueCollector);
                  const totalCost = centerUsers.reduce((acc, u) => acc + (u.salaryPackage || 0), 0);
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
                          <span className="font-black text-slate-800 text-sm">{center}</span>
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
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                        <input type="password" placeholder="默认 666888" value={newUserFormData.password} onChange={e => setNewUserFormData({...newUserFormData, password: e.target.value})} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm w-full focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">权限职级分配</p>
                      <select value={newUserFormData.category} onChange={e => setNewUserFormData({...newUserFormData, category: e.target.value as any})} className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none text-sm focus:ring-2 focus:ring-blue-500">
                        {['系统管理员', 'NPC', '水库管理员'].map(cat => <option key={cat} value={cat}>{cat}</option>)}
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
               <div className="">
                 <table className="w-full text-left">
                   <thead>
                     <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 tracking-widest leading-none">
                       <th className="py-6 px-3 whitespace-nowrap">登录账号</th>
                       <th className="py-6 px-3 whitespace-nowrap">工号</th>
                       <th className="py-6 px-3 whitespace-nowrap">姓名</th>
                       <th className="py-6 px-3 whitespace-nowrap">职级</th>
                       <th className="py-6 px-3 text-right whitespace-nowrap">管理操作</th>
                     </tr>
                   </thead>
                   <tbody>
                     {users.filter(u => u.role === Role.Admin || u.category === 'NPC' || u.category === '系统管理员' || u.category === '水库管理员' || u.role === Role.Rank).map((u, idx) => (
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
                         <td className="py-5 px-3 text-right whitespace-nowrap">
                            <button onClick={() => handleEdit(u)} className="text-blue-600 font-black text-xs hover:underline">编辑权限</button>
                             <button onClick={() => deleteUser(u.id)} className="text-rose-600 font-black text-xs hover:underline ml-3">注销</button>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
          </Card>
        </div>

        {/* Permissions */}
        <div className="lg:col-span-12 mt-8">
           <Card title="组件访问权限矩阵 (RBAC 控制中心)" className="p-8 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
             <div className="space-y-6">
               {users.filter(u => u.role === Role.Admin || u.category === 'NPC' || u.category === '系统管理员' || u.role === Role.ReservoirManager || u.role === Role.Rank).map((u, idx) => (
                 <div key={u.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                      <div className="flex items-center space-x-3">
                         <span className="text-xl">{getRoleIcon(u.role)}</span>
                         <div>
                            <p className="font-black text-slate-900 text-xs">{u.name}</p>
                            <p className="text-[9px] text-slate-400 font-mono">{u.userId || u.id}</p>
                         </div>
                      </div>
                      <Badge className="bg-slate-100 text-slate-600 font-black border-none text-[8px] uppercase tracking-widest">{u.category}</Badge>
                   </div>
                   <div className="flex flex-wrap gap-3">
                     {MENU_ITEMS.map(item => {
                       const hasPermission = checkUserPermission(u, item.id);
                       return (
                         <button 
                           key={item.id}
                           onClick={() => togglePermission(u.id, item.id)}
                           className={`flex items-center space-x-2 p-2 rounded-xl text-[10px] font-bold transition-all border whitespace-nowrap ${hasPermission ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}
                         >
                            <span className="text-sm">{item.icon}</span>
                            <span>{item.label}</span>
                            {hasPermission && <span className="ml-auto text-[8px] font-black">✓</span>}
                         </button>
                       );
                     })}
                   </div>
                 </div>
               ))}
             </div>
           </Card>
        </div>
        <CityGuardianModal state={modalState} onClose={closeModal} />
      </div>
  );
};

export default PersonnelPool;
