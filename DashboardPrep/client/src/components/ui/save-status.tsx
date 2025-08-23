import { Badge } from '@/components/ui/badge';
import type { SaveStatus } from '@/hooks/useAutoSave';

interface SaveStatusProps {
  status: SaveStatus;
  lastSaved: Date | null;
  error: string | null;
  className?: string;
}

export function SaveStatusIndicator({ status, lastSaved, error, className }: SaveStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          variant: 'secondary' as const,
          text: 'Changes pending...',
          icon: 'fa-clock',
          color: 'text-yellow-600'
        };
      case 'saving':
        return {
          variant: 'secondary' as const,
          text: 'Saving...',
          icon: 'fa-spinner fa-spin',
          color: 'text-blue-600'
        };
      case 'saved':
        return {
          variant: 'default' as const,
          text: 'Saved',
          icon: 'fa-check',
          color: 'text-green-600'
        };
      case 'error':
        return {
          variant: 'destructive' as const,
          text: 'Save failed',
          icon: 'fa-exclamation-triangle',
          color: 'text-red-600'
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config && status === 'idle') {
    return null; // Don't show anything when idle
  }

  if (!config) return null;

  const formatLastSaved = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffMins > 0) {
      return `${diffMins}m ago`;
    } else if (diffSecs > 5) {
      return `${diffSecs}s ago`;
    } else {
      return 'just now';
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Badge variant={config.variant} className="flex items-center space-x-1">
        <i className={`fas ${config.icon} text-xs ${config.color}`}></i>
        <span className="text-xs font-medium">{config.text}</span>
      </Badge>
      
      {lastSaved && status === 'idle' && (
        <span className="text-xs text-muted-foreground">
          Saved {formatLastSaved(lastSaved)}
        </span>
      )}
      
      {error && status === 'error' && (
        <span className="text-xs text-red-600 max-w-[200px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}