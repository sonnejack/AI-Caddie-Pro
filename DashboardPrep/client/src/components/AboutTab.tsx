import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ES } from '@shared/expectedStrokesAdapter';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Chart.js imports for the expected strokes chart
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function AboutTab() {

  // Generate reference table data for expected strokes
  const generateReferenceTableData = () => {
    const targetStrokes = [2, 2.5, 3, 3.5, 4, 4.5];
    const conditions = ['fairway', 'rough', 'sand', 'recovery'];
    const tableData: Record<string, Record<number, string>> = {};

    conditions.forEach(condition => {
      tableData[condition] = {};
      targetStrokes.forEach(target => {
        // Binary search to find distance that yields target expected strokes
        let low = 0;
        let high = 600;
        let bestDistance = '-';
        
        while (high - low > 1) {
          const mid = Math.floor((low + high) / 2);
          const es = ES.calculate(mid, condition as any);
          
          if (Math.abs(es - target) < 0.05) {
            bestDistance = `${mid} yds`;
            break;
          } else if (es < target) {
            low = mid;
          } else {
            high = mid;
          }
        }
        
        // If no exact match found, interpolate between low and high
        if (bestDistance === '-') {
          const esLow = ES.calculate(low, condition as any);
          const esHigh = ES.calculate(high, condition as any);
          
          if (target >= esLow && target <= esHigh) {
            const ratio = (target - esLow) / (esHigh - esLow);
            const interpolatedDistance = Math.round(low + ratio * (high - low));
            bestDistance = `${interpolatedDistance} yds`;
          }
        }
        
        tableData[condition][target] = bestDistance;
      });
    });

    return { targetStrokes, conditions, tableData };
  };

  // Generate putting chart data (in feet)
  const generatePuttingData = () => {
    const distances = [];
    const expectedStrokes = [];

    // Generate data points from 0 to 100 feet in increments of 2 feet
    for (let distanceFeet = 0; distanceFeet <= 100; distanceFeet += 2) {
      const distanceYards = distanceFeet / 3; // Convert feet to yards for ES calculation
      distances.push(distanceFeet);
      expectedStrokes.push(ES.calculate(distanceYards, 'green'));
    }

    return {
      labels: distances,
      datasets: [
        {
          label: 'Putting Expected Strokes',
          data: expectedStrokes,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 6
        }
      ]
    };
  };

  const puttingChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const
    },
    plugins: {
      legend: {
        display: false // Hide legend for single dataset
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#2c3e50',
        bodyColor: '#2c3e50',
        borderColor: '#3498db',
        borderWidth: 1,
        cornerRadius: 8,
        titleFont: {
          weight: 'bold' as const
        },
        callbacks: {
          title: function(tooltipItems: any[]) {
            return `Distance: ${tooltipItems[0].label} feet`;
          },
          label: function(context: any) {
            return `Expected Strokes: ${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Distance (feet)',
          font: {
            size: 16,
            weight: 'bold' as const
          }
        },
        grid: {
          color: 'rgba(44, 62, 80, 0.1)'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Expected Strokes',
          font: {
            size: 16,
            weight: 'bold' as const
          }
        },
        grid: {
          color: function(context: any) {
            // Bold gridlines at key values
            if ([1.5, 2, 2.5].includes(context.tick.value)) {
              return 'rgba(44, 62, 80, 0.4)';
            }
            return 'rgba(44, 62, 80, 0.1)';
          }
        },
        ticks: {
          callback: function(value: any) {
            return value.toFixed(1);
          }
        },
        min: 1.0,
        max: 3.0
      }
    }
  };

  // Expected Strokes data generation using the real engine
  const generateExpectedStrokesData = () => {
    const distances = [];
    const fairway = [];
    const rough = [];
    const sand = [];
    const green = [];
    const recovery = [];

    // Generate data points from 0 to 600 yards in increments of 5 (matching reference)
    for (let distance = 0; distance <= 600; distance += 5) {
      distances.push(distance);
      
      fairway.push(ES.calculate(distance, 'fairway'));
      rough.push(ES.calculate(distance, 'rough'));
      sand.push(ES.calculate(distance, 'sand'));
      recovery.push(ES.calculate(distance, 'recovery'));
      
      // For green, only show meaningful data for putting distances
      if (distance <= 100) {
        green.push(ES.calculate(distance, 'green'));
      } else {
        green.push(null); // Don't show putting data for long distances
      }
    }

    return {
      labels: distances,
      datasets: [
        {
          label: 'Fairway',
          data: fairway,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        },
        {
          label: 'Rough',
          data: rough,
          borderColor: '#15803d',
          backgroundColor: 'rgba(21, 128, 61, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        },
        {
          label: 'Sand',
          data: sand,
          borderColor: '#d97706',
          backgroundColor: 'rgba(217, 119, 6, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        },
        {
          label: 'Green (Putting)',
          data: green,
          borderColor: '#86efac',
          backgroundColor: 'rgba(134, 239, 172, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        },
        {
          label: 'Recovery',
          data: recovery,
          borderColor: '#9333ea',
          backgroundColor: 'rgba(147, 51, 234, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 14,
            weight: 'bold' as const
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#2c3e50',
        bodyColor: '#2c3e50',
        borderColor: '#3498db',
        borderWidth: 1,
        cornerRadius: 8,
        titleFont: {
          weight: 'bold' as const
        },
        callbacks: {
          title: function(tooltipItems: any[]) {
            return `Distance: ${tooltipItems[0].label} yards`;
          },
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} strokes`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Distance to Pin (yards)',
          font: {
            size: 16,
            weight: 'bold' as const
          }
        },
        grid: {
          color: 'rgba(44, 62, 80, 0.1)'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Expected Strokes',
          font: {
            size: 16,
            weight: 'bold' as const
          }
        },
        grid: {
          color: 'rgba(44, 62, 80, 0.1)'
        },
        ticks: {
          callback: function(value: any) {
            return value.toFixed(1);
          }
        },
        min: 1.0,
        max: 6.0
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      {/* Header */}
      <Card className="text-center bg-gradient-to-br from-card to-muted border-2">
        <CardHeader className="pb-8">
          <CardTitle className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            About Golf Analytics Pro
          </CardTitle>
          <div className="text-left max-w-4xl mx-auto space-y-4">
            <p className="text-lg text-foreground">
              Golf is a game of messy probabilities. Every swing produces a distribution of outcomes, not a single number. Golf Analytics Pro helps you make better decisions by modeling that uncertainty, simulating thousands of plausible shots, and choosing the target that minimizes your Expected Strokes.
            </p>
            <p className="text-muted-foreground">
              While you only experience a discrete outcome after every shot—"my ball is in the fairway, rough, bunker" or "I made a birdie, par, or bogey"—golf is played over many shots, holes, rounds, and tournaments strung together. While sometimes the optimal place to hit is not far off from where you usually would aim, fractional differences will become noticeable over time. Your more-disciplined, smarter self would handily prove to be the better golfer at the end of your career.
            </p>
            <p className="text-muted-foreground">
              Most people recognize the importance of tracking basic stats like fairway %, GIR%, driving distance and short game saves. But there are better ways to do this without spending any extra effort. Why do these statistics really matter? Because typically, they minimize your expected strokes outcome. You are always better being in the fairway vs the rough (from the same distance). At some point, you are better off close in the rough than you are far from the fairway.
            </p>
            <div className="bg-muted border-l-4 border-primary rounded-lg p-6 text-lg italic text-center">
              <strong>"If you've ever been told 'just aim at the middle,' this shows when that's right—and when a smarter, data-driven target quietly saves you strokes over a season."</strong>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Prepare Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <i className="fas fa-map-marked-alt text-primary-foreground text-xl"></i>
            </div>
            <CardTitle className="text-2xl">Prepare: Optimize Your Aim</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg">
            The <strong>Prepare</strong> tab is where intelligent course strategy begins. It calculates your <strong>optimal aim point</strong> based on your personal shot distance and dispersion patterns, not generic advice.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-lg">3D Visualization Features:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <i className="fas fa-globe text-primary w-4"></i>
                  Real-world 3D GPS mapping with Cesium terrain
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-eye text-primary w-4"></i>
                  Shot POV camera for precise target selection
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-tree text-primary w-4"></i>
                  OpenStreetMap integration with course features
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-mobile-alt text-primary w-4"></i>
                  Touch-optimized for mobile and desktop use
                </li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-lg">Smart Course Analysis:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <i className="fas fa-draw-polygon text-primary w-4"></i>
                  Draw missing hazards, trees, or course features
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-chart-area text-primary w-4"></i>
                  Real-time dispersion visualization as confidence ellipses
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-crosshairs text-primary w-4"></i>
                  Automatic hole navigation with tee-to-pin optimization
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-mountain text-primary w-4"></i>
                  Elevation-aware distance calculations
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two ways we find the best aim */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center">
              <i className="fas fa-cogs text-accent-foreground text-xl"></i>
            </div>
            <CardTitle className="text-2xl">Two ways we find the best aim</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-lg">
            We support two optimizers so you can compare:
          </p>
          
          <div className="grid md:grid-cols-1 gap-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-lg">
                  <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
                  Cross-Entropy Method (CEM)
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>A smart, iterative search:</strong>
                </p>
                <ol className="text-sm text-muted-foreground space-y-2 ml-4">
                  <li>1. Sample candidate aims from a broad region ahead of the tee (respecting your max "plays-like" distance).</li>
                  <li>2. Evaluate ES for each candidate (using your dispersion and the course raster).</li>
                  <li>3. Keep the elite fraction (the best ES).</li>
                  <li>4. Re-center and shrink the sampling distribution around those elites.</li>
                  <li>5. Repeat until the candidates stabilize.</li>
                </ol>
                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 mt-4">
                  <p className="text-blue-800 dark:text-blue-200 text-sm">
                    <strong>Why it's good:</strong> It quickly homes in on a basin of good solutions—even on messy holes with multiple hazards and odd shapes.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-lg">
                  <span className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
                  Ring-Grid (modified)
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  <strong>A transparent, structured sweep:</strong>
                </p>
                <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                  <li>• Build half-rings (only forward from tee) at distances within your "plays-like" max.</li>
                  <li>• Lay down a grid of aim angles on each ring (denser near hazards or tight fairways).</li>
                  <li>• Evaluate ES at each grid point, return the top K.</li>
                </ul>
                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 mt-4">
                  <p className="text-green-800 dark:text-green-200 text-sm">
                    <strong>Why it's good:</strong> Dead simple, easy to visualize, and you see why a particular aim wins. It's also more robust when CEM could over-focus on a narrow local basin.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* How this differs from DECADE */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center">
              <i className="fas fa-balance-scale text-white text-xl"></i>
            </div>
            <CardTitle className="text-2xl">How this differs from DECADE</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <p className="text-muted-foreground">
              DECADE (very effective, to be clear) tends to:
            </p>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                Model a fixed cone (often ~7° total) off your starting line — similar to the dispersion oval, but shows your dispersion at every distance.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                Choose a layup/driver target that avoids "out of play" down the cone edges.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                Use rules of thumb like "don't aim at flags" and "hit it as far as you can unless the cone clips trouble."
              </li>
            </ul>
          </div>

          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-4">
            <h4 className="font-semibold text-primary mb-3">We go further by optimizing the expected score, not just avoiding disaster:</h4>
            <ul className="space-y-2 text-sm ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                We evaluate thousands of landing outcomes (not just the cone boundary).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                We price every miss via ES (fairway good, rough worse, bunker worse, penalty worst).
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                We optimize target and distance to minimize ES, which can recommend:
                <ul className="ml-4 mt-1 space-y-1">
                  <li>- Aiming slightly toward a hazard if the average outcome is still better.</li>
                  <li>- A shorter club when the longer club's added penalty risk outweighs distance gained.</li>
                  <li>- A non-center green aim when a tucked pin plus slopes/hazards change the scoring distribution.</li>
                </ul>
              </li>
            </ul>
          </div>

          <div className="bg-muted border-l-4 border-primary rounded-lg p-4">
            <p className="text-sm font-semibold">
              Put simply: DECADE avoids big mistakes; we directly minimize expected score. The two often agree—but when they differ, you get a data-backed reason why.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Expected Strokes Explained */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center">
              <i className="fas fa-chart-line text-white text-xl"></i>
            </div>
            <CardTitle className="text-2xl">What is "Expected Strokes"?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <p className="text-lg">
              Expected Strokes (ES) at a location is the average number of strokes a scratch-calibrated player is expected to take to hole out from there, given:
            </p>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                Distance to the hole (carry + roll context as needed)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                Lie/condition (fairway, rough, sand, green, water, OB, recovery)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                Green distance/putt length (on green: putting model; off green: short-game models)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                Penalties (e.g., water, OB, hazards)
              </li>
            </ul>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Formal Definition</h4>
            <p className="text-blue-700 dark:text-blue-300 text-sm">
              <strong>ES(position) = 1</strong> (for the stroke you're about to hit) <strong>+ E[ES(next_position)]</strong><br/>
              …where the expectation averages over landing outcomes based on your shot dispersion and the course conditions at those landings.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-lg">In our app:</h4>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                ES is computed for each sampled landing point using lie-specific models (e.g., fairway &lt; rough &lt; bunker in difficulty)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                Penalties (water/OB) include the penalty (and typical next-lie) costs
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                "Plays-like" elevation can adjust effective yardage before ES is computed
              </li>
            </ul>
          </div>

          <div className="mt-4 bg-muted rounded-lg p-4">
            <div className="h-96 w-full">
              <Line data={generateExpectedStrokesData()} options={chartOptions} />
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Hover over the chart to see expected strokes for different distances and conditions. 
              Notice how putting (green) is only relevant for short distances, while other conditions show the increasing difficulty with distance.
            </p>
          </div>

          {/* Expected Strokes Reference Table */}
          <div className="mt-6">
            <h4 className="font-semibold text-lg mb-4">Expected Strokes Reference Table</h4>
            <p className="text-sm text-muted-foreground mb-4">
              This table shows the approximate distance (in yards) where each condition would result in the expected stroke values. 
              Use this for quick reference when analyzing course strategy.
            </p>
            <div className="bg-muted rounded-lg p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Expected Strokes</TableHead>
                    <TableHead className="text-center font-semibold">Fairway</TableHead>
                    <TableHead className="text-center font-semibold">Rough</TableHead>
                    <TableHead className="text-center font-semibold">Sand</TableHead>
                    <TableHead className="text-center font-semibold">Recovery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const { targetStrokes, conditions, tableData } = generateReferenceTableData();
                    return targetStrokes.map((target) => (
                      <TableRow key={target}>
                        <TableCell className="font-semibold">{target}</TableCell>
                        <TableCell className="text-center">{tableData.fairway[target]}</TableCell>
                        <TableCell className="text-center">{tableData.rough[target]}</TableCell>
                        <TableCell className="text-center">{tableData.sand[target]}</TableCell>
                        <TableCell className="text-center">{tableData.recovery[target]}</TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Putting Chart */}
          <div className="mt-6">
            <h4 className="font-semibold text-lg mb-4">Putting Expected Strokes</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Detailed putting performance chart showing expected strokes by distance in feet. 
              Bold gridlines highlight key benchmarks: 1.5 strokes (excellent), 2.0 strokes (good), and 2.5 strokes (challenging).
            </p>
            <div className="bg-muted rounded-lg p-4">
              <div className="h-80 w-full">
                <Line data={generatePuttingData()} options={puttingChartOptions} />
              </div>
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Putting distances shown in feet. Notice how putting performance degrades more gradually than full swing shots.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dispersion Analysis */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center">
              <i className="fas fa-bullseye text-white text-xl"></i>
            </div>
            <CardTitle className="text-2xl">Why dispersion matters (and how we model it)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <p className="text-lg font-semibold">
              You're not a sniper, you're a shotgun.
            </p>
            <p className="text-muted-foreground">
              Hitting at the same target with the same club, you'll see:
            </p>
            <ul className="space-y-2 text-muted-foreground ml-6">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <strong>Directional error</strong> ≈ push/pull, curve, wind misjudgment
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <strong>Distance error</strong> ≈ thin/fat, adrenaline, lie, temperature, altitude, wind misjudgment
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <strong>Shot shape biases</strong> (e.g., push-fade), swing issues shift the oval (personalization coming soon!)
              </li>
            </ul>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <h4 className="font-semibold mb-3">How We Model It</h4>
            <p className="text-sm text-muted-foreground mb-3">
              We represent this as an ellipse on the ground (centered on your intended carry point), then sample points uniformly within it to represent many plausible landings. Each sample is classified by the rasterized course map (fairway/rough/bunker/water/OB/etc.), then passed through the ES engine. Averaging those results gives ES for that aim.
            </p>
            <p className="text-sm text-muted-foreground">
              Your dispersion is the area that your best 80% of shots land. If you were to hit hundreds or thousands of shots on a driving range, with the same club trying to do the same thing, you would notice that you hit good shots which are just as likely to NOT go into the hole, despite trying to make it. Occasionally, you'll hit a shot that is not representative of the others. Real, ugly mishits happen, and they can't be planned for.
            </p>
          </div>

          <div className="bg-green-50 dark:bg-green-950 border-l-4 border-green-500 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">Intuition</h4>
            <p className="text-green-700 dark:text-green-300 text-sm">
              Aim more left and you reduce right-side trouble—but maybe bring a left bunker into play. The best aim is the target that produces the lowest average score once all those tradeoffs are accounted for.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold">For Every Golfer:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <i className="fas fa-user-friends text-primary w-4"></i>
                  Pre-built skill profiles (Tour, Elite Am, Club Pro, etc.)
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-sliders-h text-primary w-4"></i>
                  Adjustable confidence levels (80%, 90%, 95% of shots)
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-arrows-alt text-primary w-4"></i>
                  Distance-based dispersion scaling
                </li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold">For Advanced Users:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <i className="fas fa-upload text-primary w-4"></i>
                  Upload TrackMan or launch monitor data
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-golf-ball text-primary w-4"></i>
                  Club-specific dispersion patterns
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-wind text-primary w-4"></i>
                  Environmental condition adjustments
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technical Foundation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-code text-white text-xl"></i>
            </div>
            <CardTitle className="text-2xl">Technical Foundation</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold">Frontend Technologies:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <i className="fab fa-react text-blue-500 w-4"></i>
                  React 18 with TypeScript
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-palette text-purple-500 w-4"></i>
                  shadcn/ui with Tailwind CSS
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-globe text-green-500 w-4"></i>
                  CesiumJS for 3D terrain visualization
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-chart-bar text-orange-500 w-4"></i>
                  Chart.js for data visualization
                </li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold">Backend & Data:</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <i className="fas fa-server text-green-600 w-4"></i>
                  Express.js with PostgreSQL
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-database text-blue-600 w-4"></i>
                  PostGIS for spatial data operations
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-map text-red-500 w-4"></i>
                  OpenStreetMap course data integration
                </li>
                <li className="flex items-center gap-2">
                  <i className="fas fa-worker text-yellow-600 w-4"></i>
                  Web Workers for optimization algorithms
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-muted rounded-lg p-4">
            <h4 className="font-semibold mb-2">Data Sources:</h4>
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <i className="fas fa-golf-ball text-primary text-2xl mb-2"></i>
                <p className="font-medium">PGA Tour ShotLink</p>
                <p className="text-muted-foreground">Professional shot outcome data</p>
              </div>
              <div className="text-center">
                <i className="fas fa-map-marker-alt text-primary text-2xl mb-2"></i>
                <p className="font-medium">OpenStreetMap</p>
                <p className="text-muted-foreground">Crowd-sourced course mapping</p>
              </div>
              <div className="text-center">
                <i className="fas fa-mountain text-primary text-2xl mb-2"></i>
                <p className="font-medium">Cesium Terrain</p>
                <p className="text-muted-foreground">High-resolution elevation data</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* About the Creator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center">
              <i className="fas fa-user text-white text-xl"></i>
            </div>
            <CardTitle className="text-2xl">About the Creator</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="text-2xl font-bold text-primary">Jack Sonne</div>
          <div className="space-y-2 text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <i className="fas fa-university text-primary"></i>
              Carnegie Mellon University '24
            </div>
            <div className="flex items-center justify-center gap-2">
              <i className="fas fa-graduation-cap text-primary"></i>
              B.S. Materials Science Engineering
            </div>
            <div className="flex items-center justify-center gap-2">
              <i className="fas fa-chart-line text-primary"></i>
              Minor: Data Analytics & Optimization
            </div>
            <div className="flex items-center justify-center gap-2">
              <i className="fas fa-trophy text-amber-500"></i>
              <strong>2023 NCAA Men's Golf National Champion</strong>
            </div>
            <div className="flex items-center justify-center gap-2">
              <i className="fas fa-rocket text-primary"></i>
              Aerospace/Defense Engineering Professional
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mission Statement */}
      <Card className="bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <CardContent className="pt-8 text-center space-y-4">
          <h2 className="text-3xl font-bold text-primary mb-4">Why This Exists</h2>
          <p className="text-xl text-muted-foreground mb-6">
            Golf Analytics Pro bridges the gap between elite-level analysis and user-friendly tools
          </p>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <i className="fas fa-brain text-primary text-3xl mb-3"></i>
              <h3 className="font-semibold mb-2">Better Decisions</h3>
              <p className="text-sm text-muted-foreground">Make strategic choices based on mathematics, not guesswork</p>
            </div>
            <div>
              <i className="fas fa-eye text-primary text-3xl mb-3"></i>
              <h3 className="font-semibold mb-2">Visual Understanding</h3>
              <p className="text-sm text-muted-foreground">See and feel your game patterns in an intuitive way</p>
            </div>
            <div>
              <i className="fas fa-target text-primary text-3xl mb-3"></i>
              <h3 className="font-semibold mb-2">Accessible Analytics</h3>
              <p className="text-sm text-muted-foreground">Professional-grade analysis for players at every level</p>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-primary/20">
            <p className="text-lg font-semibold text-primary">Version 1.0.0 - 2025</p>
            <p className="text-sm text-muted-foreground">Built with ❤️ for the golf community</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}