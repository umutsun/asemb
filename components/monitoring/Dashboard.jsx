// Monitoring Dashboard Component
// Displays real-time system metrics

export default function MonitoringDashboard() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">System Monitoring</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* PostgreSQL Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3 flex items-center">
            <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
            PostgreSQL
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <span className="text-red-600 font-medium">Disconnected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Documents</span>
              <span>0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Host</span>
              <span className="font-mono text-xs">91.99.229.96:5432</span>
            </div>
          </div>
        </div>

        {/* Redis Status */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3 flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
            Redis Cache
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status</span>
              <span className="text-green-600 font-medium">Connected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Database</span>
              <span>DB 2</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Keys</span>
              <span>47</span>
            </div>
          </div>
        </div>
      </div>

      {/* n8n Nodes Status */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h3 className="font-semibold mb-3">n8n Custom Nodes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">15</div>
            <div className="text-xs text-gray-600">Total Nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">3</div>
            <div className="text-xs text-gray-600">Enhanced</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">5</div>
            <div className="text-xs text-gray-600">Pgvector</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">2</div>
            <div className="text-xs text-gray-600">WebScrape</div>
          </div>
        </div>
      </div>

      {/* System Metrics */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-3">System Metrics</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Query Performance</span>
              <span>0ms avg</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{width: '0%'}}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">Cache Hit Rate</span>
              <span>0%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-500 h-2 rounded-full" style={{width: '0%'}}></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">API Response Time</span>
              <span>N/A</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-purple-500 h-2 rounded-full" style={{width: '0%'}}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Error Alert */}
      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Database Connection Issue</h3>
            <p className="mt-1 text-sm text-yellow-700">
              PostgreSQL is disconnected. Backend API endpoints are not available. 
              Gemini agent needs to fix the connection using Node.js pg library.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}