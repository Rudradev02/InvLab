import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbnailProps {
  src?: string | null;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 rounded text-[10px]',
  sm: 'w-9 h-9 rounded-md text-xs',
  md: 'w-12 h-12 rounded-lg text-sm',
  lg: 'w-16 h-16 rounded-xl text-base',
  xl: 'w-24 h-24 rounded-2xl text-lg',
};

const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
};

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  src,
  alt = 'Product image',
  size = 'md',
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);

  // If no source provided or error loading image, render sleek placeholder
  if (!src || hasError) {
    return (
      <div
        className={`${sizeClasses[size]} bg-[#F1F1EC] border border-[#E3E1DA] text-[#5E6B63] flex items-center justify-center shrink-0 select-none ${className}`}
        title={alt}
      >
        <Package className={`${iconSizes[size]} text-[#8C938D]`} />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} relative overflow-hidden bg-[#F8F8F5] border border-[#E3E1DA] shrink-0 ${className}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
};
