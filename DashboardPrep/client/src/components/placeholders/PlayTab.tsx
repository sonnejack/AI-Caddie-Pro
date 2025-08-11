import { Card, CardContent } from '@/components/ui/card';

export default function PlayTab() {
  const features = [
    {
      icon: 'fas fa-crosshairs',
      title: 'Shot Tracker',
      description: 'Real-time shot tracking with GPS precision'
    },
    {
      icon: 'fas fa-stopwatch',
      title: 'Live Timing',
      description: 'Pace of play monitoring and timing'
    },
    {
      icon: 'fas fa-clipboard-list',
      title: 'Digital Scorecard',
      description: 'Interactive scorecard with statistics'
    },
    {
      icon: 'fas fa-wind',
      title: 'Weather Conditions',
      description: 'Real-time weather and wind data'
    },
    {
      icon: 'fas fa-route',
      title: 'Course Navigation',
      description: 'Turn-by-turn course navigation'
    },
    {
      icon: 'fas fa-users',
      title: 'Group Management',
      description: 'Multi-player round coordination'
    }
  ];

  return (
    <Card>
      <CardContent className="p-8">
        <div className="text-center mb-8">
          <i className="fas fa-play text-4xl text-gray-300 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-400 mb-2">Play Tab</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Real-time shot tracking, game management tools, and live round analytics. 
            Track your performance as you play with GPS-enabled shot detection and automatic scoring.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div key={index} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-center">
                <i className={`${feature.icon} text-2xl text-gray-400 mb-3`}></i>
                <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center space-x-3">
            <i className="fas fa-info-circle text-blue-600 dark:text-blue-400"></i>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Coming Soon</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Live round tracking with automatic shot detection, real-time scoring, and performance analytics during play.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
