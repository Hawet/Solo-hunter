# WebGL Star Map - Setup Guide

## Quick Start

1. **Install Three.js:**
   ```bash
   cd frontend
   npm install three
   ```

2. **Start the dev server:**
   ```bash
   npm run dev
   ```

3. **Navigate to test page:**
   - Go to `http://localhost:5173/#/map-test`
   - Or click the "🧪 WebGL Test" link in the header

## What to Test

### Performance
- Check FPS counter (should be 60 FPS)
- Pan and zoom smoothly
- Verify no jank or stuttering

### Functionality
- Mouse wheel: Zoom in/out
- Mouse drag: Pan around
- Touch gestures: Pinch zoom, drag pan
- "Update Active Systems" button: Should highlight systems with recent kills
- "Reset Camera" button: Should return to center view

### Visual
- All systems should be visible
- Edges (stargates) should connect systems
- Active systems should be highlighted in red
- Colors should reflect security status (green=high sec, yellow=low sec, red=null sec)

## Troubleshooting

### "Three is not defined" error
- Make sure Three.js is installed: `npm install three`
- Check browser console for import errors

### Low FPS (< 55)
- Check browser console for warnings
- Try reducing node/edge count in renderer options
- Verify GPU acceleration is enabled in browser

### Nothing renders
- Check browser console for errors
- Verify map data is loaded (check Network tab)
- Check that canvas container has dimensions

### Pan/zoom not working
- Check browser console for errors
- Verify mouse/touch events are being captured
- Try refreshing the page

## Next Steps

Once testing is successful:
1. Compare performance with vis-network version
2. Test with full dataset (8k systems, 25k edges)
3. Fine-tune LOD thresholds
4. Add route highlighting
5. Integrate into main map page

## Performance Targets

- **60 FPS** with 8k nodes, 25k edges
- **<16ms** frame time
- **Smooth pan/zoom** (no jank)
- **<100ms** initial load

## Architecture

See `src/lib/starMap/architecture.md` for detailed architecture documentation.

