'use client'

interface LogEntry {
  message: string
  timestamp: Date
  type: 'info' | 'success' | 'error'
}

interface ActivityLogProps {
  logs: LogEntry[]
}

export default function ActivityLog({ logs }: ActivityLogProps) {
  if (logs.length === 0) return null

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-blue-400'
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Activity Log</h3>
        <span className="text-xs text-gray-500">
          {logs.length} {logs.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {logs.map((log, index) => (
          <div
            key={index}
            className="text-xs font-mono bg-gray-900 p-2 rounded border-l-2 border-gray-600"
          >
            <span className="text-gray-500">[{formatTime(log.timestamp)}]</span>{' '}
            <span className={getTypeColor(log.type)}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
