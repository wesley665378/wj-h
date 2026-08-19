import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

interface PieChartData {
  name: string;
  value: number;
  color: string;
}

interface PieChartCardProps {
  title: string;
  icon: string;
  iconBgColor?: string;
  iconTextColor?: string;
  data: PieChartData[];
  dataKey?: string;
  innerRadius?: number;
  outerRadius?: number;
  paddingAngle?: number;
  showLegend?: boolean;
}

export const PieChartCard: React.FC<PieChartCardProps> = ({
  title,
  icon,
  iconBgColor = 'bg-blue-50',
  iconTextColor = 'text-blue-600',
  data,
  dataKey = 'value',
  innerRadius = 60,
  outerRadius = 90,
  paddingAngle = 8,
  showLegend = false,
}) => {
  return (
    <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-slate-100 shadow-xl">
      <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-10 flex items-center">
        <span className={`w-8 h-8 ${iconBgColor} rounded-lg flex items-center justify-center ${iconTextColor} mr-3`}>
          {icon}
        </span>
        {title}
      </h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie 
              data={data} 
              dataKey={dataKey} 
              cx="50%" 
              cy="50%" 
              innerRadius={innerRadius} 
              outerRadius={outerRadius} 
              paddingAngle={paddingAngle} 
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} />
            {showLegend && (
              <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
