import { Card, CardContent } from '@/components/ui/card';

export default function DispersionTab() {
  const analysisFeatures = [
    {
      title: 'Shot Pattern Analysis',
      description: 'Comprehensive analysis of your shot dispersion patterns',
      visual: 'Heat Map Visualization',
      gradient: 'from-blue-100 to-green-100 dark:from-blue-900/30 dark:to-green-900/30'
    },
    {
      title: 'Confidence Ellipses',
      description: 'Statistical confidence intervals for shot placement',
      visual: 'Statistical Models',
      gradient: 'from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30'
    },
    {
      title: 'Club-Specific Patterns',
      description: 'Individual dispersion analysis for each club in your bag',
      visual: 'Club Comparison',
      gradient: 'from-green-100 to-yellow-100 dark:from-green-900/30 dark:to-yellow-900/30'
    },
    {
      title: 'Environmental Factors',
      description: 'How wind, weather, and course conditions affect dispersion',
      visual: 'Condition Analysis',
      gradient: 'from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30'
    }
  ];

  const dispersionMetrics = [
    {
      metric: 'Circular Error Probable',
      description: 'CEP radius containing 50% of shots',
      icon: 'fas fa-circle-dot',
      value: '8.3 yds'
    },
    {
      metric: 'Standard Deviation',
      description: 'Statistical spread measurement',
      icon: 'fas fa-chart-simple',
      value: '±6.2 yds'
    },
    {
      metric: 'Bivariate Normal',
      description: 'Two-dimensional distribution fit',
      icon: 'fas fa-gaussian',
      value: 'R² = 0.94'
    },
    {
      metric: 'Miss Direction',
      description: 'Primary direction of missed shots',
      icon: 'fas fa-compass',
      value: '3° right'
    }
  ];

  return (
    <Card>
      <CardContent className="p-8">
        <div className="text-center mb-8">
          <i className="fas fa-bullseye text-4xl text-gray-300 mb-4"></i>
          <h2 className="text-2xl font-bold text-gray-400 mb-2">Dispersion Analysis</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Advanced shot dispersion analysis and modeling. 
            Understand your shot patterns with statistical analysis, confidence intervals, and predictive modeling.
          </p>
        </div>

        {/* Analysis Visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {analysisFeatures.map((feature, index) => (
            <div key={index} className="p-6 bg-muted rounded-lg border border-border">
              <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{feature.description}</p>
              <div className={`w-full h-32 bg-gradient-to-br ${feature.gradient} rounded flex items-center justify-center`}>
                <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">{feature.visual}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Dispersion Metrics */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">Statistical Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {dispersionMetrics.map((metric, index) => (
              <div key={index} className="p-4 bg-card rounded-lg border border-border text-center">
                <i className={`${metric.icon} text-2xl text-primary mb-3`}></i>
                <h4 className="font-medium text-gray-700 dark:text-gray-300 text-sm mb-1">{metric.metric}</h4>
                <p className="text-lg font-bold text-primary mb-2">{metric.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{metric.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Advanced Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-muted rounded-lg border border-border text-center">
            <i className="fas fa-chart-scatter text-2xl text-blue-500 mb-3"></i>
            <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-2">3D Visualization</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Three-dimensional shot pattern analysis</p>
          </div>
          <div className="p-4 bg-muted rounded-lg border border-border text-center">
            <i className="fas fa-brain text-2xl text-purple-500 mb-3"></i>
            <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-2">ML Predictions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Machine learning shot prediction models</p>
          </div>
          <div className="p-4 bg-muted rounded-lg border border-border text-center">
            <i className="fas fa-sliders-h text-2xl text-green-500 mb-3"></i>
            <h3 className="font-medium text-gray-600 dark:text-gray-300 mb-2">Custom Filters</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Filter by conditions, clubs, and distances</p>
          </div>
        </div>

        {/* Main Feature Highlight */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <i className="fas fa-chart-area text-3xl text-blue-600 dark:text-blue-400"></i>
            </div>
            <div>
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Advanced Dispersion Modeling</h4>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                Sophisticated statistical analysis combining Monte Carlo simulation, bivariate normal distributions, 
                and machine learning to model your shot patterns with unprecedented accuracy.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}