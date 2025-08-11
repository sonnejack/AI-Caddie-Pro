import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface CuratedCourse {
  id: string;
  name: string;
  osm: { seeds: string[] };
}

interface CoursePickerProps {
  selectedCourseId: string | null;
  onCourseSelect: (course: CuratedCourse) => void;
}

export default function CoursePicker({ selectedCourseId, onCourseSelect }: CoursePickerProps) {
  const [mode, setMode] = useState<'curated' | 'search'>('curated');

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

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-600 text-sm">Failed to load courses. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-secondary">Select Course</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode Toggle */}
        <div className="flex bg-slate-100 rounded-lg p-1">
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

        {/* Course List */}
        <div className="space-y-3">
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-3 border border-slate-200 rounded-lg">
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
            // Search mode placeholder
            <div className="p-8 text-center text-gray-500">
              <i className="fas fa-search text-4xl mb-4 opacity-50"></i>
              <p>Search functionality coming soon</p>
            </div>
          ) : (
            // Curated courses
            courses?.map((course) => (
              <div
                key={course.id}
                className={`p-3 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors ${
                  selectedCourseId === course.id ? 'border-primary bg-primary/5' : 'border-slate-200'
                }`}
                onClick={() => onCourseSelect(course)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-secondary text-sm">{course.name}</h4>
                    <p className="text-xs text-gray-500">{course.osm.seeds.length} OSM seed(s)</p>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    Curated
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
