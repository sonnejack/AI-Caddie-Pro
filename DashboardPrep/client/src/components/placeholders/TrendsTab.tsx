import { Card, CardContent } from '@/components/ui/card';

export default function TrendsTab() {
  const trendFeatures = [
    {
      icon: 'fas fa-arrow-trend-up',
      title: 'Performance Trends',
      description: 'Track improvement over time with detailed trend analysis',
      color: 'text-green-500'
    },
    {
      icon: 'fas fa-calendar-alt',
      title: 'Historical Data',
      description: 'Comprehensive historical performance data and insights',
      color: 'text-blue-500'
    },
    {
      icon: 'fas fa-bullseye',
      title: 'Goal Tracking',
      description: 'Set and monitor progress toward your golf improvement goals',
      color: 'text-purple-500'
    },
    {
      icon: 'fas fa-trophy',
      title: 'Achievements',
      description: 'Track milestones, personal bests, and breakthrough moments',
      color: 'text-yellow-500'
    },
    {
      icon: 'fas fa-weather-sun',
      title: 'Condition Analysis',
      description: 'Performance correlation with weather and course conditions',
      color: 'text-orange-500'
    },
    {
      icon: 'fas fa-users',
      title: 'Peer Comparison',
      description: 'Compare your trends against similar skill level players',
      color: 'text-indigo-500'
    }
  ];

  const trendTypes = [
    {
      title: 'Short-term Trends',
      period: 'Last 30 days',
      description: 'Recent performance changes and immediate areas for improvement',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      textColor: 'text-blue-700 dark:text-blue-300'
    },
    {
      title: 'Seasonal Analysis',
      period: 'Current season',
      description: 'Performance evolution throughout the golf season',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      textColor: 'text-green-700 dark:text-green-300'
    },
    {
      title: 'Long-term Progress',
      period: 'Year over year',
      description: 'Multi-year improvement tracking and handicap development',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderColor: 'border-purple-200 dark:border-purple-800',
      textColor: 'text-purple-700 dark:text-purple-300'
    }
  ];

  return (
    <Card>
      <CardContent className="p-8">
        <div className="text-center mb-8">
          <i className="fas fa-chart-line text-4xl text-gray-300 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-400 mb-2">Trends Tab</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Long-term performance trends and improvement tracking. 
            Analyze your golf journey with comprehensive trend analysis and predictive insights.
          </p>
        </div>

        {/* Trend Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {trendFeatures.map((feature, index) => (
            <div key={index} className="p-4 bg-muted rounded-lg border border-border">
              <div className="text-center">
                <i className={`${feature.icon} text-2xl ${feature.color} mb-3`}></i>
                <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Trend Analysis Types */}
        <div className="space-y-4 mb-8">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 text-center">Analysis Timeframes</h3>
          {trendTypes.map((trend, index) => (
            <div key={index} className={`p-4 rounded-lg border ${trend.bgColor} ${trend.borderColor}`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className={`font-medium ${trend.textColor}`}>{trend.title}</h4>
                <span className={`text-sm ${trend.textColor} opacity-75`}>{trend.period}</span>
              </div>
              <p className={`text-sm ${trend.textColor} opacity-90`}>{trend.description}</p>
            </div>
          ))}
        </div>

        {/* Visualization Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-muted rounded-lg border border-border">
            <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-4 text-center">Handicap Progression</h3>
            <div className="w-full h-32 bg-gradient-to-r from-blue-100 to-green-100 dark:from-blue-900/30 dark:to-green-900/30 rounded flex items-center justify-center">
              <div className="text-center">
                <i className="fas fa-chart-line text-3xl text-gray-400 mb-2"></i>
                <span className="text-gray-500 text-sm">Trend Line Visualization</span>
              </div>
            </div>
          </div>
          <div className="p-6 bg-muted rounded-lg border border-border">
            <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-4 text-center">Performance Heatmap</h3>
            <div className="w-full h-32 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded flex items-center justify-center">
              <div className="text-center">
                <i className="fas fa-th text-3xl text-gray-400 mb-2"></i>
                <span className="text-gray-500 text-sm">Heat Map Analysis</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
          <div className="flex items-center space-x-3">
            <i className="fas fa-lightbulb text-indigo-600 dark:text-indigo-400"></i>
            <div>
              <h4 className="font-medium text-indigo-900 dark:text-indigo-100">Predictive Analytics</h4>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                AI-powered trend analysis with predictive modeling to forecast performance improvements and identify optimal practice areas.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}