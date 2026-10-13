import React from 'react';
import { clsx } from 'clsx';
import { formatNumber } from '../../lib/format';

export interface StockIndicatorProps {
  quantity: number;
  reorderLevel: number;
  className?: string;
}

export const StockIndicator: React.FC<StockIndicatorProps> = ({
  quantity,
  reorderLevel,
  className,
}) => {
  const isOutOfStock = quantity <= 0;
  const isLowStock = !isOutOfStock && quantity <= reorderLevel;

  // Max capacity proxy for progress bar calculation
  const benchmark = Math.max(reorderLevel * 3, 20);
  const percentage = isOutOfStock
    ? 0
    : Math.min(Math.round((quantity / benchmark) * 100), 100);

  let barColor = 'bg-[#2F7D4F]'; // Success green
  let statusText = 'In stock';
  let badgeColor = 'text-[#2F7D4F] bg-[#E6F2EA]';

  if (isOutOfStock) {
    barColor = 'bg-[#B3261E]'; // Error red
    statusText = 'Out of stock';
    badgeColor = 'text-[#B3261E] bg-[#FBE9E7]';
  } else if (isLowStock) {
    barColor = 'bg-[#9A5B00]'; // Warning amber
    statusText = 'Low stock';
    badgeColor = 'text-[#9A5B00] bg-[#FBF0DC]';
  }

  return (
    <div className={clsx('flex flex-col gap-1 min-w-[130px]', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[#202521] tabular-nums text-sm">
          {formatNumber(quantity)} <span className="font-normal text-[#5E6B63] text-xs">units</span>
        </span>
        <span className={clsx('px-2 py-0.5 rounded text-[11px] font-medium tracking-tight', badgeColor)}>
          {statusText}
        </span>
      </div>
      {/* Signature thin stock bar */}
      <div className="h-1.5 w-full bg-[#E3E1DA]/70 rounded-full overflow-hidden">
        <div
          className={clsx('h-full transition-all duration-500 rounded-full', barColor)}
          style={{ width: `${isOutOfStock ? 4 : percentage}%` }}
        />
      </div>
    </div>
  );
};
