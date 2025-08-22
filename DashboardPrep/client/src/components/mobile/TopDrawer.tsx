import React, { useState } from 'react';
import { useMobileUI } from '@/hooks/useMobileUI';
import { useQuery } from '@tanstack/react-query';

interface CuratedCourse {
  id: string;
  name: string;
  osm: { seeds: string[] };
}

interface TopDrawerProps {
  className?: string;
  selectedCourseId?: string | null;
  onCourseSelect?: (course: CuratedCourse) => void;
}

const tabs = [
  { id: 'prepare', label: 'Prepare', icon: 'fa-map-marked-alt' },
  { id: 'play', label: 'Play', icon: 'fa-play' },
  { id: 'stats', label: 'Stats', icon: 'fa-chart-bar' },
  { id: 'trends', label: 'Trends', icon: 'fa-chart-line' },
  { id: 'dispersion', label: 'Dispersion', icon: 'fa-bullseye' },
  { id: 'about', label: 'About', icon: 'fa-info-circle' },
];

// Helper function to parse course name and location
function parseCourseName(fullName: string): { name: string; location: string } {
  const match = fullName.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) {
    return { name: match[1].trim(), location: match[2].trim() };
  }
  return { name: fullName, location: '' };
}

export const TopDrawer: React.FC<TopDrawerProps> = ({ 
  className = '', 
  selectedCourseId = null,
  onCourseSelect 
}) => {
  const { 
    topDrawerOpen, 
    setTopDrawerOpen, 
    activeTab, 
    setActiveTab, 
    isDarkMode, 
    setIsDarkMode 
  } = useMobileUI();

  const [showCourseSelection, setShowCourseSelection] = useState(false);

  // Fetch curated courses
  const { data: courses, isLoading } = useQuery<CuratedCourse[]>({
    queryKey: ['/curated.json'],
    queryFn: async () => {
      const response = await fetch('/curated.json');
      if (!response.ok) {
        throw new Error('Failed to load curated courses');
      }
      return response.json();
    },
  });

  const selectedCourse = courses?.find(course => course.id === selectedCourseId);

  if (!topDrawerOpen) return null;

  return (
    <>
      {/* Full Screen Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setTopDrawerOpen(false)}
      />
      
      {/* Full Screen Drawer */}
      <div 
        className={`fixed inset-0 z-50 bg-white dark:bg-slate-900 ${className}`}
        style={{
          paddingTop: 'calc(56px + env(safe-area-inset-top))',
        }}
      >
        <div className="h-full overflow-y-auto">
          {/* Close Button */}
          <div className="flex justify-end p-4 pb-2">
            <button
              onClick={() => setTopDrawerOpen(false)}
              className="w-10 h-10 rounded-[12px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times text-slate-600 dark:text-slate-400 text-lg"></i>
            </button>
          </div>

          {/* Course Selection */}
          <div className="px-4 pb-6">
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4">
              Course Selection
            </h3>
            {showCourseSelection ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    Select Course
                  </span>
                  <button
                    onClick={() => setShowCourseSelection(false)}
                    className="text-sm text-green-600 hover:text-green-700"
                  >
                    Cancel
                  </button>
                </div>
                {isLoading ? (
                  <div className="text-center py-8">
                    <i className="fas fa-spinner fa-spin text-lg text-slate-400"></i>
                    <p className="text-sm text-slate-500 mt-2">Loading courses...</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {courses?.map((course) => {
                      const { name, location } = parseCourseName(course.name);
                      return (
                        <button
                          key={course.id}
                          onClick={() => {
                            onCourseSelect?.(course);
                            setShowCourseSelection(false);
                            setTopDrawerOpen(false);
                          }}
                          className={`w-full p-3 rounded-[12px] text-left transition-all ${
                            selectedCourseId === course.id
                              ? 'bg-green-600 text-white shadow-md'
                              : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <div className="font-medium text-sm">{name}</div>
                          {location && (
                            <div className={`text-xs mt-1 ${
                              selectedCourseId === course.id ? 'text-green-100' : 'text-slate-500 dark:text-slate-400'
                            }`}>
                              {location}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowCourseSelection(true)}
                className="w-full p-4 rounded-[12px] bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-700 dark:text-slate-300">
                      {selectedCourse ? parseCourseName(selectedCourse.name).name : 'Select Course'}
                    </div>
                    {selectedCourse && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {parseCourseName(selectedCourse.name).location}
                      </div>
                    )}
                  </div>
                  <i className="fas fa-chevron-right text-slate-400 text-sm"></i>
                </div>
              </button>
            )}
          </div>

          {/* Tab Grid */}
          <div className="px-4 pb-6">
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4">
              Navigation
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setTopDrawerOpen(false);
                  }}
                  className={`p-4 rounded-[12px] border transition-all ${
                    activeTab === tab.id
                      ? 'bg-green-600 border-green-600 text-white shadow-md'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <i className={`fas ${tab.icon} text-xl ${
                      activeTab === tab.id ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}></i>
                    <span className="font-medium text-base">{tab.label}</span>
                  </div>
                  {activeTab === tab.id && (
                    <div className="mt-2 h-0.5 bg-white rounded-full"></div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Theme Toggle */}
          <div className="px-4 pb-6">
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4">
              Theme
            </h3>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-full p-4 rounded-[12px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <i className={`fas ${isDarkMode ? 'fa-moon' : 'fa-sun'} text-xl text-slate-500 dark:text-slate-400`}></i>
                  <span className="font-medium text-base text-slate-700 dark:text-slate-300">
                    {isDarkMode ? 'Dark Mode' : 'Light Mode'}
                  </span>
                </div>
                <div className={`w-12 h-7 rounded-full transition-colors ${
                  isDarkMode ? 'bg-green-600' : 'bg-slate-300'
                }`}>
                  <div className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${
                    isDarkMode ? 'translate-x-5 ml-0.5' : 'translate-x-0 ml-0.5'
                  }`}></div>
                </div>
              </div>
            </button>
          </div>

          {/* User Profile */}
          <div className="px-4 pb-8">
            <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4">
              Account
            </h3>
            <button className="w-full p-4 rounded-[12px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
                    <i className="fas fa-user text-white text-lg"></i>
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-base text-slate-700 dark:text-slate-300">
                      Golf Pro
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      View Profile
                    </div>
                  </div>
                </div>
                <i className="fas fa-chevron-right text-slate-400 text-lg"></i>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};