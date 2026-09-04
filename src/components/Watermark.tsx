import React, { useEffect, useState, useMemo } from 'react';
import { User } from '../types';

export interface WatermarkProps {
  /**
   * 当前登录用户信息（若存在且有 name 字段，则默认展示用户名）
   */
  user?: User | null;
  /**
   * 自定义水印文本（传值时优先于 user.name）
   */
  text?: string;
  /**
   * 无用户信息时的固定备选文字，默认为 "内部资料，请勿外传"
   */
  fallbackText?: string;
  /**
   * 水印字体大小 (px)，默认 16
   */
  fontSize?: number;
  /**
   * 水印旋转角度（度数），默认 -30
   */
  rotate?: number;
  /**
   * 水印文字透明度 (0.1 ~ 0.2)，默认 0.15
   */
  opacity?: number;
  /**
   * 水印文字颜色（RGB 基础色），默认浅灰色 rgb(100, 116, 139)
   */
  color?: string;
  /**
   * 单个水印单元格宽度，默认 280
   */
  gapX?: number;
  /**
   * 单个水印单元格高度，默认 180
   */
  gapY?: number;
  /**
   * 层级 z-index，默认 0 (置于内容底层，配合 pointer-events-none 不影响点击)
   */
  zIndex?: number;
  /**
   * 容器额外 className
   */
  className?: string;
}

/**
 * 全局高性能背景水印组件
 * - 支持根据登录用户信息自动渲染用户姓名，无用户时使用固定保密文字
 * - 采用 Canvas Pattern 生成超轻量高分辨率平铺背景，窗口缩放时自动重绘自适应
 * - pointer-events-none 彻底规避对正常交互和点击事件的拦截
 */
export const Watermark: React.FC<WatermarkProps> = ({
  user,
  text,
  fallbackText = '内部资料，请勿外传',
  fontSize = 16,
  rotate = -30,
  opacity = 0.15,
  color = '100, 116, 139', // slate-500 浅灰基础色
  gapX = 280,
  gapY = 180,
  zIndex = 0,
  className = '',
}) => {
  const [watermarkUrl, setWatermarkUrl] = useState<string>('');

  // 优先级：传入自定义 text -> 登录用户 name -> 固定保密文字
  const displayText = useMemo(() => {
    if (text && text.trim().length > 0) {
      return text.trim();
    }
    if (user && user.name && user.name.trim().length > 0) {
      return user.name.trim();
    }
    return fallbackText;
  }, [user?.name, text, fallbackText]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const renderWatermark = () => {
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      const width = gapX;
      const height = gapY;

      canvas.width = width * dpr;
      canvas.height = height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 视网膜高清屏抗锯齿缩放
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);

      // 样式配置
      ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = `rgba(${color}, ${opacity})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 旋转绘制
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.fillText(displayText, 0, 0);
      ctx.restore();

      const url = canvas.toDataURL('image/png');
      setWatermarkUrl(url);
    };

    renderWatermark();

    // 窗口尺寸/DPI变化自适应监听
    window.addEventListener('resize', renderWatermark);
    return () => {
      window.removeEventListener('resize', renderWatermark);
    };
  }, [displayText, fontSize, rotate, opacity, color, gapX, gapY]);

  if (!watermarkUrl) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none select-none overflow-hidden transition-opacity duration-300 ${className}`}
      style={{
        zIndex,
        backgroundImage: `url(${watermarkUrl})`,
        backgroundRepeat: 'repeat',
        backgroundPosition: '0 0',
        backgroundSize: `${gapX}px ${gapY}px`,
      }}
    />
  );
};

export default Watermark;
