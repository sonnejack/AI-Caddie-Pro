const fs = require('fs');
const { createCanvas } = require('canvas');

// Create a 1024x1024 canvas
const canvas = createCanvas(1024, 1024);
const ctx = canvas.getContext('2d');

// Fill with rough (red=8) as default
ctx.fillStyle = 'rgb(8, 0, 0)';
ctx.fillRect(0, 0, 1024, 1024);

// Add a fairway strip down the center (red=6)
ctx.fillStyle = 'rgb(6, 0, 0)';
ctx.fillRect(400, 0, 224, 1024);

// Add a green at the end (red=5)
ctx.fillStyle = 'rgb(5, 0, 0)';
ctx.beginPath();
ctx.arc(512, 900, 80, 0, 2 * Math.PI);
ctx.fill();

// Add some bunkers around the green (red=4)
ctx.fillStyle = 'rgb(4, 0, 0)';
ctx.beginPath();
ctx.arc(420, 850, 25, 0, 2 * Math.PI);
ctx.fill();
ctx.beginPath();
ctx.arc(604, 850, 25, 0, 2 * Math.PI);
ctx.fill();

// Add water hazard on left (red=2)
ctx.fillStyle = 'rgb(2, 0, 0)';
ctx.fillRect(200, 600, 180, 80);

// Save the image
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('/Users/jacksonne/Coding Projects/AI-Caddie/DashboardPrep/public/masks/standrews_h01.png', buffer);

console.log('✅ Placeholder mask created at public/masks/standrews_h01.png');