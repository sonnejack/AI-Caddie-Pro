import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DrawingToolsMobileProps {
  // These would typically come from the parent state management
  // For now, we'll manage them locally as a wrapper
}

export default function DrawingToolsMobile(props: DrawingToolsMobileProps) {
  // Local state for drawing tools - in a real implementation, these would come from
  // the same state management system as the desktop version
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const tools = [
    {
      id: 'water',
      icon: 'fas fa-water',
      color: 'text-blue-500',
      title: 'Draw Water Hazard'
    },
    {
      id: 'bunker',
      icon: 'fas fa-circle-dot',
      color: 'text-yellow-500',
      title: 'Draw Bunker/Sand'
    },
    {
      id: 'rough',
      icon: 'fas fa-seedling',
      color: 'text-green-700',
      title: 'Draw Rough'
    },
    {
      id: 'fairway',
      icon: 'fas fa-square',
      color: 'text-green-500',
      title: 'Draw Fairway'
    },
    {
      id: 'green',
      icon: 'fas fa-flag',
      color: 'text-green-400',
      title: 'Draw Green'
    },
    {
      id: 'erase',
      icon: 'fas fa-eraser',
      color: 'text-red-500',
      title: 'Erase Drawing'
    }
  ];

  const handleToolClick = (toolId: string) => {
    setActiveTool(activeTool === toolId ? null : toolId);
    // Here you would trigger the actual drawing functionality
    console.log('Drawing tool selected:', toolId);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1">
        {tools.map(tool => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === tool.id ? "default" : "ghost"}
                size="sm"
                className={`h-10 w-10 p-0 ${
                  activeTool === tool.id 
                    ? 'bg-primary text-primary-foreground' 
                    : `hover:bg-muted ${tool.color}`
                }`}
                onClick={() => handleToolClick(tool.id)}
              >
                <i className={`${tool.icon} text-sm`}></i>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs">{tool.title}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}