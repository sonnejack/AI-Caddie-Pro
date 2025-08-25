import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DrawingToolsExpandableProps {
  // These would typically come from the parent state management
}

export default function DrawingToolsExpandable(props: DrawingToolsExpandableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const tools = [
    {
      id: 'green',
      icon: 'fas fa-flag',
      color: 'text-green-500',
      title: 'Green',
      bgColor: 'bg-green-500',
      borderColor: '#10b981'
    },
    {
      id: 'fairway',
      icon: 'fas fa-seedling',
      color: 'text-green-600',
      title: 'Fairway',
      bgColor: 'bg-green-600',
      borderColor: '#16a34a'
    },
    {
      id: 'tee',
      icon: 'fas fa-golf-ball',
      color: 'text-cyan-500',
      title: 'Tee',
      bgColor: 'bg-cyan-500',
      borderColor: '#06b6d4'
    },
    {
      id: 'bunker',
      icon: 'fas fa-mountain',
      color: 'text-yellow-500',
      title: 'Bunker',
      bgColor: 'bg-yellow-500',
      borderColor: '#eab308'
    },
    {
      id: 'water',
      icon: 'fas fa-tint',
      color: 'text-blue-500',
      title: 'Water',
      bgColor: 'bg-blue-500',
      borderColor: '#3b82f6'
    },
    {
      id: 'hazard',
      icon: 'fas fa-exclamation-triangle',
      color: 'text-red-500',
      title: 'Hazard',
      bgColor: 'bg-red-500',
      borderColor: '#ef4444'
    },
    {
      id: 'OB',
      icon: 'fas fa-ban',
      color: 'text-gray-700',
      title: 'OB',
      bgColor: 'bg-gray-700',
      borderColor: '#374151'
    },
    {
      id: 'recovery',
      icon: 'fas fa-tree',
      color: 'text-purple-500',
      title: 'Recovery',
      bgColor: 'bg-purple-500',
      borderColor: '#8b5cf6'
    },
    {
      id: 'rough',
      icon: 'fas fa-grass',
      color: 'text-green-700',
      title: 'Rough',
      bgColor: 'bg-green-700',
      borderColor: '#15803d'
    }
  ];

  const handleToolClick = (toolId: string) => {
    setActiveTool(activeTool === toolId ? null : toolId);
    console.log('Drawing tool selected:', toolId);
  };

  return (
    <TooltipProvider>
      <div className="relative">
        {/* Main Toggle Button - Compact */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isExpanded ? "default" : "ghost"}
              size="sm"
              className={`h-8 w-8 p-0 ${
                isExpanded 
                  ? 'bg-primary text-primary-foreground' 
                  : 'hover:bg-muted'
              }`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <i className={`fas ${isExpanded ? 'fa-times' : 'fa-paint-brush'} text-xs`}></i>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="text-xs">{isExpanded ? 'Close Drawing Tools' : 'Drawing Tools'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Expanded Grid - Glass Card Style like Desktop */}
        {isExpanded && (
          <div className="absolute left-10 top-0 glass-card-mobile p-3 min-w-[200px]">
            <div className="space-y-2">
              <div className="text-xs font-medium text-foreground mb-1">
                Draw Conditions
              </div>
              <div className="grid grid-cols-3 gap-1">
                {tools.map(tool => (
                  <Button
                    key={tool.id}
                    variant="outline"
                    size="sm"
                    className={`h-8 p-1 transition-all duration-200 flex flex-col items-center justify-center border ${
                      activeTool === tool.id 
                        ? 'bg-primary text-primary-foreground border-primary' 
                        : 'hover:bg-muted/50'
                    }`}
                    style={{
                      borderColor: activeTool === tool.id ? undefined : tool.borderColor
                    }}
                    onClick={() => handleToolClick(tool.id)}
                  >
                    <i className={`${tool.icon} text-xs`} style={{ color: activeTool === tool.id ? undefined : tool.borderColor }}></i>
                  </Button>
                ))}
              </div>
              {/* Simplified controls */}
              <div className="flex gap-1 pt-1 border-t border-border/50">
                <Button variant="outline" size="sm" className="flex-1 h-6 text-xs">
                  <i className="fas fa-undo text-xs"></i>
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-6 text-xs">
                  <i className="fas fa-eraser text-xs"></i>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}