import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface TooltipProps {
  content: string;
  shortcut?: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  shortcut, 
  children, 
  position = 'top',
  className
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: '-top-10 left-1/2 -translate-x-1/2',
    bottom: '-bottom-10 left-1/2 -translate-x-1/2',
    left: 'top-1/2 right-full -translate-y-1/2 mr-2',
    right: 'top-1/2 left-full -translate-y-1/2 ml-2'
  };

  const animationVariants = {
    initial: { 
      opacity: 0, 
      scale: 0.95, 
      y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0,
      x: position === 'left' ? 4 : position === 'right' ? -4 : 0
    },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0, 
      x: 0 
    },
    exit: { 
      opacity: 0, 
      scale: 0.95,
      transition: { duration: 0.1 }
    }
  };

  return (
    <div 
      className={clsx("relative flex items-center justify-center", className)}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            variants={animationVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={clsx(
              "absolute z-[2147483647] px-2 py-1 flex items-center gap-1.5 whitespace-nowrap pointer-events-none",
              "bg-white/90 backdrop-blur-md border border-zinc-200 shadow-none",
              "text-[11px] font-medium text-zinc-900",
              positionClasses[position]
            )}
          >
            <span>{content}</span>
            {shortcut && (
              <span className="text-zinc-400 font-mono">{shortcut}</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
