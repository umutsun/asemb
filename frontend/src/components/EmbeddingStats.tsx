'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart3, PieChart, TrendingUp } from 'lucide-react'

interface EmbeddingStatsProps {
  stats?: {
    by_model?: Array<{
      model: string
      count: string
      tables: string
    }>
    by_table?: Array<{
      source_table: string
      count: string
      models_used: string
    }>
    daily_counts?: Array<{
      date: string
      count: string
    }>
  }
}

export default function EmbeddingStats({ stats }: EmbeddingStatsProps) {
  if (!stats) return null

  const totalEmbeddings = stats.by_model?.reduce((sum, item) => sum + parseInt(item.count), 0) || 0
  const totalModels = stats.by_model?.length || 0
  const totalTables = stats.by_table?.length || 0

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Embeddings</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmbeddings.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Across {totalTables} tables
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Models Used</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalModels}</div>
            <p className="text-xs text-muted-foreground">
              Different embedding models
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.daily_counts?.[0]?.count || '0'}
            </div>
            <p className="text-xs text-muted-foreground">
              Embeddings today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* By Model */}
      <Card>
        <CardHeader>
          <CardTitle>Embeddings by Model</CardTitle>
          <CardDescription>Distribution of embeddings across different models</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.by_model?.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="outline">{item.model}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {item.tables} table{parseInt(item.tables) > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{parseInt(item.count).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {((parseInt(item.count) / totalEmbeddings) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* By Table */}
      <Card>
        <CardHeader>
          <CardTitle>Embeddings by Source Table</CardTitle>
          <CardDescription>Number of embeddings per source table</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.by_table?.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{item.source_table}</span>
                  {parseInt(item.models_used) > 0 && (
                    <Badge variant="secondary">
                      {item.models_used} model{parseInt(item.models_used) > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-medium">{parseInt(item.count).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {((parseInt(item.count) / totalEmbeddings) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Embedding Activity</CardTitle>
          <CardDescription>Last 30 days of embedding activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stats.daily_counts?.slice(0, 10).map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <span>{new Date(item.date).toLocaleDateString()}</span>
                <span>{parseInt(item.count).toLocaleString()} embeddings</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}