#!/bin/bash
# RAM Cleanup Script for OpenClaw + Claude CLI
# Run when memory is low: cleanup-ram.sh

echo "🧹 RAM Cleanup Starting..."

# Kill zombie MCP processes
echo "Killing orphan MCP processes..."
pkill -f "npm exec @modelcontextprotocol" 2>/dev/null
pkill -f "npm exec @playwright" 2>/dev/null
pkill -f "npm exec @upstash" 2>/dev/null
pkill -f "npm exec @supabase" 2>/dev/null
pkill -f "npm exec @anthropic" 2>/dev/null

# Clear npm cache (optional, uncomment if needed)
# npm cache clean --force 2>/dev/null

# Clear system caches
sync
echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1 || true

# Show result
echo ""
echo "📊 Memory Status:"
free -h
echo ""
echo "✅ Cleanup complete!"
