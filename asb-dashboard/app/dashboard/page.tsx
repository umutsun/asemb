"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NetworkGraph } from '@/components/graph/NetworkGraph'
import { KnowledgeMap } from '@/components/graph/KnowledgeMap'
import { MetricsDashboard } from '@/components/analytics/MetricsDashboard'
import { PerformanceChart } from '@/components/analytics/PerformanceChart'
import { MonitoringDashboard } from '@/components/monitoring/MonitoringDashboard'
import {
    BarChart3,
    Brain,
    Network,
    PieChart,
    Activity,
    Settings,
    TrendingUp,
    Users,
    Database,
    Server
} from 'lucide-react'

// Mock data for NetworkGraph
const mockNodes = [
    { id: '1', name: 'Alice', type: 'entity' as const, value: 100 },
    { id: '2', name: 'Semantic Bridge', type: 'concept' as const, value: 80 },
    { id: '3', name: 'Knowledge Graph', type: 'relation' as const, value: 60 },
    { id: '4', name: 'AI Assistant', type: 'entity' as const, value: 90 },
    { id: '5', name: 'Data Processing', type: 'concept' as const, value: 70 },
    { id: '6', name: 'API Gateway', type: 'entity' as const, value: 85 }
]

const mockLinks = [
    { source: '1', target: '2', value: 10 },
    { source: '2', target: '3', value: 8 },
    { source: '3', target: '4', value: 12 },
    { source: '4', target: '5', value: 9 },
    { source: '5', target: '6', value: 7 },
    { source: '1', target: '6', value: 5 }
]

// Mock data for KnowledgeMap
const knowledgeNodes = [
    { id: '1', label: 'Alice', category: 'entity', importance: 0.9, connections: ['2', '3'] },
    { id: '2', label: 'Semantic Bridge', category: 'concept', importance: 0.8, connections: ['1', '3', '4'] },
    { id: '3', label: 'Knowledge Graph', category: 'relation', importance: 0.7, connections: ['1', '2', '4'] },
    { id: '4', label: 'AI Assistant', category: 'entity', importance: 0.85, connections: ['2', '3', '5'] },
    { id: '5', label: 'Data Processing', category: 'process', importance: 0.6, connections: ['4'] },
    { id: '6', label: 'API Gateway', category: 'entity', importance: 0.75, connections: ['2'] }
]

const knowledgeLinks = [
    { source: '1', target: '2', strength: 0.9, type: 'uses' },
    { source: '2', target: '3', strength: 0.8, type: 'contains' },
    { source: '3', target: '4', strength: 0.7, type: 'connected' },
    { source: '4', target: '5', strength: 0.6, type: 'processes' },
    { source: '2', target: '6', strength: 0.5, type: 'exposes' }
]

// Mock data for Metrics
const mockMetricData = Array.from({ length: 24 }, (_, i) => ({
    timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString(),
    value: Math.random() * 100 + 50
}))

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState('overview')

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Alice Semantic Bridge Dashboard</h1>
                    <p className="text-muted-foreground">Monitor and analyze your semantic bridge system</p>
                </div>
                <Button variant="outline" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Settings
                </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">1,234</div>
                        <p className="text-xs text-muted-foreground">+20.1% from last month</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Knowledge Nodes</CardTitle>
                        <Brain className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">5,678</div>
                        <p className="text-xs text-muted-foreground">+180.1% from last month</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">API Calls</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">45,678</div>
                        <p className="text-xs text-muted-foreground">+201% from last month</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">System Health</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">98.5%</div>
                        <p className="text-xs text-muted-foreground">+0.5% from yesterday</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview" className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Overview
                    </TabsTrigger>
                    <TabsTrigger value="network" className="flex items-center gap-2">
                        <Network className="h-4 w-4" />
                        Network
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Analytics
                    </TabsTrigger>
                    <TabsTrigger value="monitoring" className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Monitoring
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Network Graph */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Network className="h-5 w-5" />
                                    Semantic Network
                                </CardTitle>
                                <CardDescription>
                                    Interactive graph showing relationships between entities
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[400px]">
                                    <NetworkGraph
                                        nodes={mockNodes}
                                        links={mockLinks}
                                        width={100}
                                        height={400}
                                        onNodeClick={(node) => console.log('Node clicked:', node)}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Metrics Chart */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <PieChart className="h-5 w-5" />
                                    Activity Metrics
                                </CardTitle>
                                <CardDescription>
                                    System activity over the last 24 hours
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[400px]">
                                    <MetricsDashboard
                                        title="Activity"
                                        description="System activity metrics"
                                        data={mockMetricData}
                                        type="line"
                                        color="#6366F1"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Knowledge Map */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Brain className="h-5 w-5" />
                                Knowledge Map
                            </CardTitle>
                            <CardDescription>
                                Visual representation of the knowledge structure
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[500px]">
                                <KnowledgeMap
                                    nodes={knowledgeNodes}
                                    links={knowledgeLinks}
                                    width={100}
                                    height={500}
                                    onNodeClick={(node) => console.log('Node clicked:', node)}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="network" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Network Graph</CardTitle>
                                <CardDescription>Detailed network visualization</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[600px]">
                                    <NetworkGraph
                                        nodes={mockNodes}
                                        links={mockLinks}
                                        width={100}
                                        height={600}
                                        onNodeClick={(node) => console.log('Node clicked:', node)}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Knowledge Graph</CardTitle>
                                <CardDescription>Knowledge structure visualization</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[600px]">
                                    <KnowledgeMap
                                        nodes={knowledgeNodes}
                                        links={knowledgeLinks}
                                        width={100}
                                        height={600}
                                        onNodeClick={(node) => console.log('Node clicked:', node)}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="analytics" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Performance Metrics</CardTitle>
                                <CardDescription>System performance over time</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[400px]">
                                    <PerformanceChart
                                        title="Performance"
                                        data={mockMetricData.map(d => ({
                                            timestamp: d.timestamp,
                                            responseTime: Math.random() * 200 + 50,
                                            throughput: Math.random() * 1000 + 500,
                                            errorRate: Math.random() * 5
                                        }))}
                                        showMetrics={['responseTime', 'throughput', 'errorRate']}
                                        height={400}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Activity Analysis</CardTitle>
                                <CardDescription>User activity patterns</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="h-[400px]">
                                    <MetricsDashboard
                                        title="User Activity"
                                        data={mockMetricData}
                                        type="area"
                                        color="#10B981"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="monitoring" className="space-y-6">
                    <MonitoringDashboard />
                </TabsContent>
            </Tabs>
        </div>
    )
}