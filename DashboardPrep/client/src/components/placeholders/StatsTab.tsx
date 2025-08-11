import { Card, CardContent } from '@/components/ui/card';

export default function StatsTab() {
  const chartPlaceholders = [
    {
      title: 'Scoring Average',
      description: 'Track your scoring trends over time',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=400',
      alt: 'Golf analytics dashboard with scoring charts and performance metrics'
    },
    {
      title: 'Performance Metrics',
      description: 'Detailed analysis of your game statistics',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&h=400',
      alt: 'Golf performance analytics dashboard showing various charts and graphs'
    }
  ];

  const statCategories = [
    {
      icon: 'fas fa-flag',
      title: 'Scoring',
      stats: ['Average Score', 'Birdies', 'Eagles', 'Pars', 'Bogeys']
    },
    {
      icon: 'fas fa-bullseye',
      title: 'Accuracy',
      stats: ['Fairways Hit', 'Greens in Regulation', 'Up & Down %', 'Sand Saves']
    },
    {
      icon: 'fas fa-golf-ball',
      title: 'Distance',
      stats: ['Drive Distance', 'Approach Accuracy', 'Putting Average', 'Total Distance']
    },
    {
      icon: 'fas fa-chart-line',
      title: 'Trends',
      stats: ['Handicap History', 'Recent Form', 'Course Performance', 'Weather Impact']
    }
  ];

  return (
    <Card>
      <CardContent className="p-8">
        <div className="text-center mb-8">
          <i className="fas fa-chart-bar text-4xl text-gray-300 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-400 mb-2">Statistics Tab</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Comprehensive performance analytics and detailed metrics tracking. 
            Analyze your game with advanced statistics, trends, and comparative analysis.
          </p>
        </div>

        {/* Chart Previews */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {chartPlaceholders.map((chart, index) => (
            <div key={index} className="relative">
              <img 
                src={chart.image} 
                alt={chart.alt}
                className="w-full h-48 object-cover rounded-lg shadow-sm border border-slate-200 dark:border-slate-700"
              />
              <div className="absolute inset-0 bg-black bg-opacity-40 rounded-lg flex items-center justify-center">
                <div className="text-center text-white">
                  <h3 className="font-semibold text-lg mb-2">{chart.title}</h3>
                  <p className="text-sm opacity-90">{chart.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Statistics Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCategories.map((category, index) => (
            <div key={index} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="text-center mb-4">
                <i className={`${category.icon} text-2xl text-primary mb-2`}></i>
                <h3 className="font-medium text-gray-700 dark:text-gray-300">{category.title}</h3>
              </div>
              <ul className="space-y-1">
                {category.stats.map((stat, statIndex) => (
                  <li key={statIndex} className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    {stat}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center space-x-3">
            <i className="fas fa-chart-bar text-green-600 dark:text-green-400"></i>
            <div>
              <h4 className="font-medium text-green-900 dark:text-green-100">Advanced Analytics</h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                Detailed performance tracking with strokes gained analysis, course-specific statistics, and predictive modeling for game improvement.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}