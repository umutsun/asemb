"use client"

import { useState } from "react"
import { Search, Settings, Activity, Database, Zap, Cloud, AlertCircle, CheckCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SearchCommand } from "@/components/search-command"
import { NodeStatusCard } from "@/components/node-status-card"
import { StatsChart } from "@/components/stats-chart"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAppStore } from "@/stores/use-app-store"
import { cn } from "@/lib/utils"
import { LightragQuery } from "@/components/lightrag-query"

export default function DashboardPage() {
  const { nodes, stats, isConnected } = useAppStore()
  const [selectedView, setSelectedView] = useState<'overview' | 'nodes' | 'analytics'>('overview')

  const mockNodes = [
    { id: '1', name: 'HTTP Request', type: 'webhook', status: 'active' as const, lastUpdated: new Date() },
    { id: '2', name: 'PostgreSQL', type: 'database', status: 'active' as const, lastUpdated: new Date() },
    { id: '3', name: 'OpenAI', type: 'ai', status: 'pending' as const, lastUpdated: new Date() },
    { id: '4', name: 'Redis Cache', type: 'cache', status: 'error' as const, lastUpdated: new Date() },
  ]

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          <div className="p-6">
            <h2 className="text-lg font-semibold">ASB Dashboard</h2>
            <p className="text-sm text-muted-foreground">Alice Semantic Bridge</p>
          </div>
          
          <nav className="flex-1 space-y-1 px-3">
            <Button
              variant={selectedView === 'overview' ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setSelectedView('overview')}
            >
              <Activity className="mr-2 h-4 w-4" />
              Overview
            </Button>
            <Button
              variant={selectedView === 'nodes' ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setSelectedView('nodes')}
            >
              <Database className="mr-2 h-4 w-4" />
              Nodes
            </Button>
            <Button
              variant={selectedView === 'analytics' ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setSelectedView('analytics')}
            >
              <Zap className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          </nav>

          <div className="border-t p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected ? "bg-green-500" : "bg-red-500"
                )} />
                <span className="text-sm">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1">
        {/* Header */}
        <header className="border-b">
          <div className="flex h-16 items-center px-6">
            <div className="flex-1">
              <SearchCommand />
            </div>
            <div className="ml-4 flex items-center space-x-4">
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {selectedView === 'overview' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Nodes</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">24</div>
                    <p className="text-xs text-muted-foreground">+2 from last hour</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Nodes</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">19</div>
                    <p className="text-xs text-muted-foreground">79% uptime</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Processing Rate</CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">1.2k/s</div>
                    <p className="text-xs text-muted-foreground">+15% from average</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">0.3%</div>
                    <p className="text-xs text-muted-foreground">-0.1% from last hour</p>
                  </CardContent>
                </Card>
              </div>

              {/* LightRAG Query Component */}
              <LightragQuery />

              {/* Charts */}
              <div className="grid gap-4 md:grid-cols-2">
                <StatsChart />
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                    <CardDescription>Latest node operations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {mockNodes.slice(0, 3).map((node) => (
                        <div key={node.id} className="flex items-center">
                          <div className={cn(
                            "h-2 w-2 rounded-full mr-2",
                            node.status === 'active' && "bg-green-500",
                            node.status === 'error' && "bg-red-500",
                            node.status === 'pending' && "bg-yellow-500"
                          )} />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{node.name}</p>
                            <p className="text-xs text-muted-foreground">{node.type}</p>
                          </div>
                          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                            {node.lastUpdated.toLocaleTimeString('en-US', { hour12: false })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {selectedView === 'nodes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Node Management</h1>
                <Button>
                  <Cloud className="mr-2 h-4 w-4" />
                  Add Node
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mockNodes.map((node) => (
                  <NodeStatusCard key={node.id} node={node} />
                ))}
              </div>
            </div>
          )}

          {selectedView === 'analytics' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
              <div className="grid gap-4">
                <StatsChart />
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                    <CardDescription>System performance over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      Advanced charts will be displayed here
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
