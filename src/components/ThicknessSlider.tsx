import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface ThicknessSliderProps {
  value: number;
  onChange: (value: number) => void;
  color?: string;
  className?: string;
}

export const ThicknessSlider: React.FC<ThicknessSliderProps> = ({ 
  value, 
  onChange, 
  color = '#000000',
  className = '' 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const dragY = useMotionValue(0);
  const dragScale = useMotionValue(0);
  const springY = useSpring(dragY, { stiffness: 400, damping: 25 });
  const springDragScale = useSpring(dragScale, { stiffness: 400, damping: 25 });
  const valMotion = useMotionValue(value);
  
  React.useEffect(() => { 
    valMotion.set(value); 
  }, [value, valMotion]);
  
  const path = useTransform([springY, valMotion, springDragScale], ([, v, scale]) => {
    const percentage = ((v as number) - 1) / 19;
    const cx = 5 + percentage * 90;
    
    const t_min = 2;
    const t_max = 16;
    const T_cx = t_min + percentage * (t_max - t_min);
    
    const p1y_top = 16 - t_min / 2;
    const p1y_bot = 16 + t_min / 2;
    const p2y_top = 16 - t_max / 2;
    const p2y_bot = 16 + t_max / 2;
    
    const bulge = (scale as number) * 3;
    const c_y_top = 16 - T_cx / 2 - bulge;
    const c_y_bot = 16 + T_cx / 2 + bulge;
    
    return `M 5 ${p1y_top} Q ${cx} ${c_y_top} 95 ${p2y_top} A ${t_max/2} ${t_max/2} 0 0 1 95 ${p2y_bot} Q ${cx} ${c_y_bot} 5 ${p1y_bot} A ${t_min/2} ${t_min/2} 0 0 1 5 ${p1y_top} Z`;
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    dragScale.set(1);
    updateValue(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    updateValue(e.clientX);
    
    const rect = containerRef.current.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;
    const rawDiff = e.clientY - cy;
    
    const resistance = 0.4; 
    const constrainedY = rawDiff * resistance;
    
    dragY.set(Math.max(-30, Math.min(30, constrainedY)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    dragScale.set(0);
    dragY.set(0);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const updateValue = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const trackLeft = rect.left + rect.width * 0.05;
    const trackRight = rect.left + rect.width * 0.95;
    const trackWidth = trackRight - trackLeft;

    let x = clientX - trackLeft;
    x = Math.max(0, Math.min(trackWidth, x));
    const percentage = x / trackWidth;
    const thickness = 1 + percentage * 19;
    onChange(thickness);
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-8 touch-none cursor-pointer !overflow-visible ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <svg 
        className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" 
        viewBox="0 0 100 32" 
        preserveAspectRatio="none"
        aria-label="Thickness slider track"
      >
        <motion.path
          d={path}
          fill={color}
        />
      </svg>

      <motion.div
        className="absolute top-[16px] left-0 pointer-events-none z-[10000] flex items-center justify-center"
        style={{ 
          marginLeft: '-20px',
          marginTop: '-20px',
          left: `calc(5% + ${((value - 1) / 19) * 90}%)`,
          y: springY,
          width: 40,
          height: 40
        }}
      >
        <motion.div
          initial={false}
          animate={{ 
            y: isDragging ? -32 : 0,
            width: isDragging ? 40 : Math.max(16, value + 8),
            height: isDragging ? 40 : Math.max(16, value + 8),
          }}
          transition={{ type: 'spring', damping: 25, stiffness: 400, mass: 0.8 }}
          className="relative bg-white shadow-md border border-zinc-200 flex items-center justify-center pointer-events-none rounded-full"
        >
          <motion.div
            className="rounded-full"
            style={{ backgroundColor: color }}
            animate={{
              width: value,
              height: value,
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};
