import React, { useState, useEffect, useRef } from 'react';
import { User, Role, Announcement } from '../../types';
import { Megaphone, Plus, Trash2, Pin, Bell, CheckCircle2, AlertTriangle, AlertCircle, X, Check, CheckCheck, Inbox, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useCityGuardianModal, CityGuardianModal } from './CityGuardianModal';
import { isSystemAdmin } from '../utils/accessControl';
import { safeGetItem, safeSetItem } from '../utils/safeLocalStorage';
import { UI_LABELS } from '../constants/uiLabels';

interface SystemAnnouncementProps {
  currentUser: User;
  onSystemLog?: (action: string, details: string) => void;
}

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ANN-001',
    title: '城市守护者价值循环智能体系统运行通知',
    content: '欢迎使用城市守护者价值循环智能体！各经营单元请及时核查月度价值产出与划转核准日志，确保数据精准上报。',
    publisherName: '系统管理员',
    publisherId: 'admin',
    createdAt: Date.now() - 3600000 * 24, // 1天前
    priority: 'important',
    isPinned: true
  },
  {
    id: 'ANN-002',
    title: '关于职级权限与账号管理的规范说明',
    content: '系统已对经管员高款专、经管员高产专、经管员NPC及VP等职级开放自动建号机制，初始默认密码为 66668888，首次登录请及时修改密码。',
    publisherName: '系统管理员',
    publisherId: 'admin',
    createdAt: Date.now() - 3600000 * 48, // 2天前
    priority: 'normal',
    isPinned: false
  }
];

export const SystemAnnouncement: React.FC<SystemAnnouncementProps> = ({ currentUser, onSystemLog }) => {
  const { modalState, showConfirm, closeModal } = useCityGuardianModal();
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    try {
      const saved = safeGetItem('shihe_announcements');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to load announcements:', e);
    }
    return DEFAULT_ANNOUNCEMENTS;
  });

  // Track read announcement IDs per user
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const key = `shihe_read_announcements_${currentUser.id}`;
      const saved = safeGetItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Failed to load read announcements state:', e);
    }
    return [];
  });

  const [isOpen, setIsOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'read'>('all');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  // Form State for Admin
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>('important');
  const [isPinned, setIsPinned] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const isAdmin = isSystemAdmin(currentUser);

  // Save announcements to localStorage
  useEffect(() => {
    try {
      safeSetItem('shihe_announcements', JSON.stringify(announcements));
    } catch (e) {
      console.error('Failed to save announcements:', e);
    }
  }, [announcements]);

  // Save read status to localStorage
  useEffect(() => {
    try {
      const key = `shihe_read_announcements_${currentUser.id}`;
      safeSetItem(key, JSON.stringify(readIds));
    } catch (e) {
      console.error('Failed to save read state:', e);
    }
  }, [readIds, currentUser.id]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const sortedAnnouncements = React.useMemo(() => {
    return [...announcements].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [announcements]);

  const unreadCount = React.useMemo(() => {
    return announcements.filter(a => !readIds.includes(a.id)).length;
  }, [announcements, readIds]);

  const filteredAnnouncements = React.useMemo(() => {
    return sortedAnnouncements.filter(item => {
      const isRead = readIds.includes(item.id);
      if (filterMode === 'unread') return !isRead;
      if (filterMode === 'read') return isRead;
      return true;
    });
  }, [sortedAnnouncements, readIds, filterMode]);

  const handleMarkAsRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!readIds.includes(id)) {
      setReadIds(prev => [...prev, id]);
      toast.success('已标记为已读');
    }
  };

  const handleMarkAllAsRead = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const allIds = announcements.map(a => a.id);
    setReadIds(allIds);
    toast.success('已将全部站内信息标记为已读');
  };

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('请填写完整的站内信息标题与内容');
      return;
    }

    const newAnnouncement: Announcement = {
      id: `ANN-${Date.now().toString().slice(-6)}`,
      title: title.trim(),
      content: content.trim(),
      publisherName: currentUser.name || '系统管理员',
      publisherId: currentUser.id,
      createdAt: Date.now(),
      priority,
      isPinned
    };

    setAnnouncements(prev => [newAnnouncement, ...prev]);
    setIsPublishModalOpen(false);
    setTitle('');
    setContent('');
    setPriority('important');
    setIsPinned(false);

    toast.success('站内信息发布成功！');
    if (onSystemLog) {
      onSystemLog('发布站内信息', `标题: ${newAnnouncement.title} [${priority}]`);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showConfirm('确定要删除此条站内信息吗？', () => {
      const target = announcements.find(a => a.id === id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      setReadIds(prev => prev.filter(rId => rId !== id));
      toast.success('信息已删除');
      if (onSystemLog && target) {
        onSystemLog('删除站内信息', `标题: ${target.title}`);
      }
    });
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAnnouncements(prev => prev.map(a => {
      if (a.id === id) {
        const nextState = !a.isPinned;
        toast.info(nextState ? '信息已置顶' : '已取消置顶');
        return { ...a, isPinned: nextState };
      }
      return a;
    }));
  };

  const getPriorityBadge = (p?: 'normal' | 'important' | 'urgent') => {
    switch (p) {
      case 'urgent':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500 text-white shadow-sm">
            <AlertCircle className="w-3 h-3 mr-1" />
            紧急
          </span>
        );
      case 'important':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-white shadow-sm">
            <AlertTriangle className="w-3 h-3 mr-1" />
            重要
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            通知
          </span>
        );
    }
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${date} ${hours}:${minutes}`;
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Header Top Right Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
          isOpen
            ? 'bg-blue-600 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
        title="点击查看站内信息"
      >
        <div className="relative">
          <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-amber-500 animate-bounce' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black px-1 min-w-[16px] h-[16px] rounded-full flex items-center justify-center ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <span className="hidden sm:inline">站内信息</span>
      </button>

      {/* Message Center Popover Modal Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-[92vw] sm:w-[450px] bg-white rounded-3xl shadow-2xl border border-slate-200/80 z-50 overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
          {/* Header Bar */}
          <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-black text-sm sm:text-base text-white tracking-tight">站内信息</h3>
                  {unreadCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase">
                      {unreadCount} 条未读
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                      已全部已读
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">通知与系统发布公告</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {isAdmin && (
                <button
                  onClick={() => {
                    setIsPublishModalOpen(true);
                    setIsOpen(false);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 shadow transition-all active:scale-95"
                  title="发布新站内信息"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">发布</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar & Quick Read All */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1 bg-slate-200/60 p-1 rounded-xl">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-0.5 rounded-lg font-bold transition-all ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                全部 ({announcements.length})
              </button>
              <button
                onClick={() => setFilterMode('unread')}
                className={`px-2.5 py-0.5 rounded-lg font-bold transition-all ${
                  filterMode === 'unread'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                未读 ({unreadCount})
              </button>
              <button
                onClick={() => setFilterMode('read')}
                className={`px-2.5 py-0.5 rounded-lg font-bold transition-all ${
                  filterMode === 'read'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                已读 ({announcements.length - unreadCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>全部已读</span>
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {filteredAnnouncements.length === 0 ? (
              <div className="px-6 py-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">{UI_LABELS.EMPTY_DEFAULT}</div>
            ) : (
              filteredAnnouncements.map(item => {
                const isRead = readIds.includes(item.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleMarkAsRead(item.id)}
                    className={`p-3.5 rounded-2xl transition-all border cursor-pointer relative group ${
                      !isRead
                        ? 'bg-blue-50/60 border-blue-200/90 shadow-sm'
                        : item.isPinned
                        ? 'bg-amber-50/30 border-amber-200/60'
                        : 'bg-white border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 min-w-0 flex-wrap">
                          {!isRead ? (
                            <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 animate-pulse" />
                          ) : (
                            <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          )}

                          {item.isPinned && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-700">
                              <Pin className="w-2.5 h-2.5 mr-0.5" />
                              置顶
                            </span>
                          )}
                          {getPriorityBadge(item.priority)}
                          <h4 className="font-bold text-xs sm:text-sm text-slate-800 truncate max-w-[180px]">
                            {item.title}
                          </h4>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {!isRead && (
                            <button
                              onClick={e => handleMarkAsRead(item.id, e)}
                              className="text-[10px] font-bold text-blue-600 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors"
                            >
                              标记已读
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                onClick={e => handleTogglePin(item.id, e)}
                                className={`p-1 rounded text-[10px] ${
                                  item.isPinned ? 'text-amber-500 bg-amber-100' : 'text-slate-400 hover:text-slate-600'
                                }`}
                                title={item.isPinned ? '取消置顶' : '置顶'}
                              >
                                <Pin className="w-3 h-3" />
                              </button>
                              <button
                                onClick={e => handleDelete(item.id, e)}
                                className="p-1 rounded text-rose-400 hover:text-rose-600"
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed font-normal whitespace-pre-wrap">
                        {item.content}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 font-mono border-t border-slate-100/60">
                        <span>发布人: {item.publisherName}</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Admin Publish Modal */}
      {isPublishModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-[2.5rem] p-6 md:p-8 max-w-xl w-full shadow-2xl border border-slate-100 space-y-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-slate-900">发布站内信息</h3>
                  <p className="text-xs text-slate-400 font-bold">面向全平台所有用户展示</p>
                </div>
              </div>
              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">
                  信息标题 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="请输入明确的信息标题"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 font-bold outline-none text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">
                    优先级/类型
                  </label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 font-bold outline-none text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                  >
                    <option value="normal">普通通知</option>
                    <option value="important">重要信息</option>
                    <option value="urgent">紧急提示</option>
                  </select>
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="flex items-center space-x-3 cursor-pointer p-3.5 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100/80 transition-all">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      onChange={e => setIsPinned(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span className="text-xs font-black text-slate-700">设置为【置顶信息】</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">
                  详细内容 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={5}
                  placeholder="请输入具体内容与注意事项..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-5 font-medium outline-none text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsPublishModalOpen(false)}
                  className="px-6 py-3.5 rounded-2xl text-xs font-black text-slate-500 hover:bg-slate-100 transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black tracking-widest uppercase shadow-xl hover:shadow-blue-500/20 active:scale-95 transition-all"
                >
                  确认发布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <CityGuardianModal state={modalState} onClose={closeModal} />
    </div>
  );
};

export default SystemAnnouncement;
