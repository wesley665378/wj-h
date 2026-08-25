
import React from 'react';
import { Lock, Clock, Activity } from 'lucide-react';
import { ProjectStatus, MiningResource } from '../../types';
import { deriveProjectStatus } from '../utils/projectStatus';
import { formatProjectStatusLabel } from '../utils/statusDisplay';

export const Card: React.FC<{
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  headerAction?: React.ReactNode;
  noPadding?: boolean;
}> = ({ children, title, subtitle, className = '', headerAction, noPadding = false }) => (
  <div className={`bg-white border border-slate-200 rounded-sm shadow-sm overflow-hidden ${className}`}>
    {(title || subtitle || headerAction) && (
      <div className="bg-slate-50 px-6 py-2.5 border-b border-slate-200 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        {(title || subtitle) ? (
          <>
            <div className="shrink-0">
              {title && <span className="text-[11px] font-bold text-black uppercase tracking-widest">{title}</span>}
              {subtitle && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">{headerAction}</div>
          </>
        ) : (
          <div className="w-full">{headerAction}</div>
        )}
      </div>
    )}
    <div className={noPadding ? '' : 'p-6'}>
      {children}
    </div>
  </div>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'dark';
  className?: string;
}> = ({ children, variant = 'default', className = '' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-500 border-slate-200',
    success: 'bg-green-50 text-green-600 border-green-200',
    warning: 'bg-amber-50 text-amber-600 border-amber-200',
    error: 'bg-rose-50 text-rose-600 border-rose-200',
    info: 'bg-blue-50 text-blue-600 border-blue-200',
    dark: 'bg-slate-900 text-white border-slate-800',
  };

  return (
    <span className={`px-2 py-0.5 border rounded-sm text-[9px] font-bold uppercase tracking-tighter ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const ProjectStatusBadge: React.FC<{
  resource: MiningResource;
  className?: string;
}> = ({ resource, className = '' }) => {
  const { status, remainingDays } = deriveProjectStatus(resource);
  
  if (status === ProjectStatus.Archived) {
    return (
      <Badge variant="dark" className={`bg-slate-400 border-slate-300 text-white flex items-center gap-1 normal-case ${className}`}>
        <Lock size={10} />
        {formatProjectStatusLabel(status)}
      </Badge>
    );
  }
  
  if (status === ProjectStatus.Capping) {
    return (
      <Badge variant="warning" className={`bg-amber-100 text-amber-700 border-amber-200 flex items-center gap-1 normal-case ${className}`}>
        <Clock size={10} />
        {formatProjectStatusLabel(status)} {remainingDays !== undefined ? `(${remainingDays}天)` : ''}
      </Badge>
    );
  }
  
  return (
    <Badge variant="info" className={`bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1 normal-case ${className}`}>
      <Activity size={10} />
      {formatProjectStatusLabel(status)}
    </Badge>
  );
};

export const ProgressBar: React.FC<{
  value: number;
  max: number;
  color?: string;
  label?: string;
  subLabel?: string;
  className?: string;
}> = ({ value, max, color = 'bg-blue-600', label, subLabel, className = '' }) => {
  const percentage = Math.min(100, (value / (max || 1)) * 100);
  
  return (
    <div className={`space-y-2 ${className}`}>
      {(label || subLabel) && (
        <div className="flex justify-between items-center">
          {label && <span className="text-[9px] font-black uppercase tracking-widest flex items-center">{label}</span>}
          {subLabel && <span className="text-[10px] font-mono font-bold text-slate-500">{subLabel}</span>}
        </div>
      )}
      <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-700`} 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export const StatItem: React.FC<{
  label: string;
  value: string | number;
  subValue?: string;
  className?: string;
}> = ({ label, value, subValue, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <div className="flex items-baseline space-x-2">
      <span className="text-xl font-black text-slate-900 font-mono">{value}</span>
      {subValue && <span className="text-[10px] font-bold text-slate-400">{subValue}</span>}
    </div>
  </div>
);
