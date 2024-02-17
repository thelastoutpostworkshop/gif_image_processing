// Screen layout configuration
const layoutConfig = {
    totalScreens: 4, // Total number of screens
    screensPerRow: 2, // Number of screens per row
    screenWidth: 240, // Width of each screen (pixels)
    screenHeight: 240, // Height of each screen (pixels)
  };
  
  // Function to calculate the position (x, y coordinates) of each screen based on its index
  function calculateScreenPosition(screenIndex) {
    const row = Math.floor(screenIndex / layoutConfig.screensPerRow);
    const col = screenIndex % layoutConfig.screensPerRow;
  
    const x = layoutConfig.screenWidth  * col;
    const y = layoutConfig.screenHeight * row;
  
    return { x, y };
  }
  
  // Example usage: Calculate and log the position of each screen
  for (let i = 0; i < layoutConfig.totalScreens; i++) {
    const position = calculateScreenPosition(i, layoutConfig);
    console.log(`Screen ${i}: Position (x: ${position.x}, y: ${position.y})`);
  }
  