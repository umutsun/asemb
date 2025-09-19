"use client"

import { useState, useEffect } from "react"
import { Search, Settings, Activity, Database, Zap, Cloud, AlertCircle, CheckCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SearchCommand } from "@/components/search-command"
import { NodeStatusCard } from "@/components/node-status-card"
import { StatsChart } from "@/components/stats-chart"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { LightragQuery } from "@/components/lightrag-query"
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Define a type for our metrics data for better type safety
interface AnalyticsMetrics {
  cache: {
    hits: number;
    misses: number;
    size: number;
  };
  lightrag: {
    status: string;
    entities: number;
    relationships: number;
  };
  performance: {
    avgResponseTime: string;
    successRate: string;
    activeConnections: number;
  };
  timestamp: string;
}

export default function DashboardPage() {
  const [selectedView, setSelectedView] = useState<'overview' | 'nodes' | 'analytics'>('overview')
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/analytics/metrics')
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const data: AnalyticsMetrics = await response.json()
        setMetrics(data)
        toast.success('System metrics loaded successfully!')
      } catch (error) {
        console.error("Failed to fetch analytics metrics:", error)
        toast.error('Failed to load system metrics.')
        setMetrics(null) // Set to null on error to show error state
      } finally {
        setIsLoading(false)
      }
    }

    fetchMetrics()
  }, [])

  // A simple loading component
  const LoadingComponent = () => (
    <div className="flex items-center justify-center h-full">
      <p className="text-lg text-muted-foreground">Yükleniyor...</p>
    </div>
  )

  // A simple error component
  const ErrorComponent = () => (
    <div className="flex items-center justify-center h-full">
      <p className="text-lg text-red-500">Veri yüklenemedi. Lütfen backend sunucusunun çalıştığından emin olun.</p>
    </div>
  )

  return (
    <>
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
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
                    metrics ? "bg-green-500" : "bg-red-500"
                  )} />
                  <span className="text-sm">
                    {isLoading ? 'Connecting...' : metrics ? 'Connected' : 'Disconnected'}
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
            {isLoading ? <LoadingComponent /> : !metrics ? <ErrorComponent /> : (
              <>
                {selectedView === 'overview' && (
                  <div className="space-y-6">
                    {/* Stats Cards - Now with live data */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Cache Hits</CardTitle>
                          <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{metrics.cache.hits}</div>
                          <p className="text-xs text-muted-foreground">Total successful cache lookups</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Avg. Response Time</CardTitle>
                          <Zap className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{metrics.performance.avgResponseTime}</div>
                          <p className="text-xs text-muted-foreground">API performance metric</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                          <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{metrics.performance.successRate}</div>
                          <p className="text-xs text-muted-foreground">Request success percentage</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Active Connections</CardTitle>
                          <Activity className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{metrics.performance.activeConnections}</div>
                          <p className="text-xs text-muted-foreground">Live WebSocket connections</p>
                        </CardContent>
                      </Card>
                    </div>

                    <LightragQuery />

                    <div className="grid gap-4 md:grid-cols-2">
                      <StatsChart />
                      <Card>
                        <CardHeader>
                          <CardTitle>LightRAG Status</CardTitle>
                          <CardDescription>Current state of the LightRAG service</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p>Status: <span className="font-semibold">{metrics.lightrag.status}</span></p>
                          <p>Entities: <span className="font-semibold">{metrics.lightrag.entities}</span></p>
                          <p>Relationships: <span className="font-semibold">{metrics.lightrag.relationships}</span></p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}

                {selectedView === 'nodes' && (
                  <div className="space-y-6">
                    <h1 className="text-2xl font-bold">Node Management</h1>
                    <p className="text-muted-foreground">Node data will be fetched from a dedicated endpoint.</p>
                  </div>
                )}

                {selectedView === 'analytics' && (
                  <div className="space-y-6">
                    <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
                    <StatsChart />
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
