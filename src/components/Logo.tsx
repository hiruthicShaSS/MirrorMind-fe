import { Brain } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

const iconSizes = {
  sm: 'w-5 h-5',
  md: 'w-7 h-7',
  lg: 'w-10 h-10',
};

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true }) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${sizeClasses[size]} bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center rounded-2xl shadow-lg`}
      >
        <Brain className={iconSizes[size]} />
      </div>
      {showText && (
        <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
          Mirror.Mind
        </span>
      )}
    </div>
  );
};
