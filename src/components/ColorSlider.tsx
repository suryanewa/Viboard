import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface ColorSliderProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export const ColorSlider: React.FC<ColorSliderProps> = ({ value, onChange, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const dragY = useMotionValue(0);
  const springY = useSpring(dragY, { stiffness: 400, damping: 25 });
  const valMotion = useMotionValue(value);
  React.useEffect(() => { valMotion.set(value); }, [value, valMotion]);
  
  const path = useTransform([springY, valMotion], ([y, v]) => {
    const bendAmount = Math.max(-12, Math.min(12, (y as number) * 0.8));
    const cx = 2 + ((v as number) / 360) * 96;
    return `M 2 16 Q ${cx} ${16 + bendAmount} 98 16`;
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
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
    dragY.set(0);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const updateValue = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const trackLeft = rect.left + rect.width * 0.02;
    const trackRight = rect.left + rect.width * 0.98;
    const trackWidth = trackRight - trackLeft;

    let x = clientX - trackLeft;
    x = Math.max(0, Math.min(trackWidth, x));
    const percentage = x / trackWidth;
    const hue = Math.round(percentage * 360);
    onChange(hue);
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
        aria-label="Color slider track"
      >
        <defs>
          <linearGradient id="rainbow" gradientUnits="userSpaceOnUse" x1="2" y1="16" x2="98" y2="16">
            <stop offset="0%" stopColor="hsl(0, 90%, 65%)" />
            <stop offset="16.6%" stopColor="hsl(60, 90%, 65%)" />
            <stop offset="33.3%" stopColor="hsl(120, 90%, 65%)" />
            <stop offset="50%" stopColor="hsl(180, 90%, 65%)" />
            <stop offset="66.6%" stopColor="hsl(240, 90%, 65%)" />
            <stop offset="83.3%" stopColor="hsl(300, 90%, 65%)" />
            <stop offset="100%" stopColor="hsl(360, 90%, 65%)" />
          </linearGradient>
        </defs>
        <motion.path
          d={path}
          stroke="url(#rainbow)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <motion.div
        className="absolute top-[16px] left-0 pointer-events-none z-[10000]"
        style={{ 
          marginLeft: '-16px',
          marginTop: '-26px',
          left: `calc(2% + ${(value / 360) * 96}%)`,
          y: springY,
          width: 32,
          height: 50
        }}
      >
        <svg viewBox="0 0 32 50" className="w-full h-[50px] overflow-visible drop-shadow-md" aria-label="Selected color swatch">
          <motion.path
            initial={false}
            animate={{ 
              d: isDragging 
                ? "M 16 12 C 7.16 12 0 19.16 0 28 C 0 39.25 16 48 16 48 C 16 48 32 39.25 32 28 C 32 19.16 24.84 12 16 12 Z"
                : "M 16 18 C 11.58 18 8 21.58 8 26 C 8 30.42 11.58 34 16 34 C 20.42 34 24 30.42 24 26 C 24 21.58 20.42 18 16 18 Z",
              translateY: isDragging ? -25 : 0
            }}
            transition={{ 
              type: 'spring', 
              damping: 25, 
              stiffness: 400,
              mass: 0.8
            }}
            fill={`hsl(${value}, 90%, 65%)`}
            stroke="white"
            strokeWidth="2.5"
          />
        </svg>
      </motion.div>
    </div>
  );
};
