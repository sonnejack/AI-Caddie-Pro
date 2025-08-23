import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';

interface CuratedCourse {
  id: string;
  name: string;
  osm: { seeds: string[] };
}

interface SearchCourse {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  type: string;
  center: { lat: number; lon: number };
  display_name: string;
}

// Helper function to parse course name and location
function parseCourseName(fullName: string): { name: string; location: string } {
  const match = fullName.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) {
    return { name: match[1].trim(), location: match[2].trim() };
  }
  return { name: fullName, location: '' };
}

interface CoursePickerProps {
  selectedCourseId: string | null;
  onCourseSelect: (course: CuratedCourse | SearchCourse) => void;
}

export default function CoursePicker({ selectedCourseId, onCourseSelect }: CoursePickerProps) {
  const [mode, setMode] = useState<'curated' | 'search'>('curated');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Debounced search query to avoid hammering the API
  const [debouncedQuery, setDebouncedQuery] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300); // 300ms delay
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: courses, isLoading, error } = useQuery<CuratedCourse[]>({
    queryKey: ['/curated.json'],
    queryFn: async () => {
      const response = await fetch('/curated.json');
      if (!response.ok) {
        throw new Error('Failed to load curated courses');
      }
      return response.json();
    },
    enabled: mode === 'curated',
  });

  const { data: searchResults, isLoading: isSearching, error: searchError } = useQuery<SearchCourse[]>({
    queryKey: ['/api/courses/search', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(`/api/courses/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`);
      if (!response.ok) {
        throw new Error('Failed to search courses');
      }
      return response.json();
    },
    enabled: mode === 'search' && debouncedQuery.length >= 3,
    retry: 1, // Only retry once for search queries
    staleTime: 5 * 60 * 1000, // Cache results for 5 minutes
  });

  // Find selected course name for collapsed state
  const selectedCourse = courses?.find(course => course.id === selectedCourseId) || 
    searchResults?.find(course => course.id === selectedCourseId);

  // Auto-collapse when a course is first selected
  useEffect(() => {
    if (selectedCourseId && !isCollapsed) {
      setIsCollapsed(true);
    }
  }, [selectedCourseId]);

  if (error || searchError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-600 text-sm">
            Failed to load {mode === 'curated' ? 'curated courses' : 'search results'}. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            {selectedCourseId && isCollapsed ? 
              (selectedCourse ? 
                ('osm' in selectedCourse ? parseCourseName(selectedCourse.name).name : selectedCourse.name) : 
                'Loading...') : 
              'Select Course'
            }
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
          >
            <i className={`fas ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'} text-sm`}></i>
          </Button>
        </div>
      </CardHeader>
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
      }`}>
        <CardContent className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex bg-muted rounded-lg p-1">
          <Button
            variant={mode === 'curated' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setMode('curated')}
          >
            Curated
          </Button>
          <Button
            variant={mode === 'search' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setMode('search')}
          >
            Search
          </Button>
        </div>

        {/* Search Input */}
        {mode === 'search' && (
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="Search for golf courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
        )}

        {/* Course List */}
        <div className="space-y-2">
          {(mode === 'curated' ? isLoading : isSearching) ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 border border-border rounded-lg">
                <Skeleton className="w-full h-20 mb-2" />
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              </div>
            ))
          ) : mode === 'search' ? (
            // Search results
            searchQuery.length < 3 ? (
              <div className="p-8 text-center text-muted-foreground">
                <i className="fas fa-search text-4xl mb-4 opacity-50"></i>
                <p>Enter at least 3 characters to search</p>
              </div>
            ) : searchResults?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <i className="fas fa-search text-4xl mb-4 opacity-50"></i>
                <p>No courses found for "{searchQuery}"</p>
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              searchResults.map((course) => (
                <div
                  key={course.id}
                  className={`p-2 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${
                    selectedCourseId === course.id ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  onClick={() => onCourseSelect({
                    id: course.id,
                    name: course.name,
                    osm: { seeds: [course.id] }
                  } as CuratedCourse)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground text-sm leading-tight">{course.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[course.city, course.state, course.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-700 ml-2">
                      Search
                    </Badge>
                  </div>
                </div>
              ))
            ) : debouncedQuery.length >= 3 ? (
              <div className="p-8 text-center text-muted-foreground">
                <i className="fas fa-search text-4xl mb-4 opacity-50"></i>
                <p>No courses found for "{debouncedQuery}"</p>
                <p className="text-xs mt-2">Try a different search term or check the spelling</p>
              </div>
            ) : searchQuery.length >= 3 ? (
              <div className="p-8 text-center text-muted-foreground">
                <i className="fas fa-clock text-4xl mb-4 opacity-50"></i>
                <p>Searching...</p>
              </div>
            ) : null
          ) : (
            // Curated courses
            courses?.map((course) => {
              const { name, location } = parseCourseName(course.name);
              return (
                <div
                  key={course.id}
                  className={`p-2 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${
                    selectedCourseId === course.id ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  onClick={() => onCourseSelect(course)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground text-sm leading-tight">{name}</h4>
                      {location && (
                        <p className="text-xs text-muted-foreground mt-0.5">{location}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 ml-2">
                      Curated
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </CardContent>
      </div>
    </Card>
  );
}
