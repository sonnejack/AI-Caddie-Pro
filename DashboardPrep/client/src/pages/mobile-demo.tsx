import React, { useEffect } from 'react';
import { MobilePrepareDemo } from '@/components/mobile';

export default function MobileDemo() {
  // Apply mobile viewport meta tag for proper scaling
  useEffect(() => {
    const existingMeta = document.querySelector('meta[name="viewport"]');
    if (existingMeta) {
      existingMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <div className="w-full h-screen overflow-hidden">
      {/* Mobile Layout Demo */}
      <MobilePrepareDemo />
      
      {/* Instructions overlay for desktop viewers */}
      <div className="hidden lg:flex fixed inset-0 bg-black/80 items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-900 rounded-lg p-8 max-w-md mx-4 text-center">
          <i className="fas fa-mobile-alt text-4xl text-slate-400 mb-4"></i>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Mobile Layout Demo
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            This page is optimized for mobile devices in portrait mode. 
            Please view on a mobile device or resize your browser window to ~393px width to see the mobile UI.
          </p>
          <div className="text-sm text-slate-500 dark:text-slate-500">
            Target: iPhone 15 Pro (393×852pt)
          </div>
        </div>
      </div>
    </div>
  );
}