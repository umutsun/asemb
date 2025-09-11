'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Activity, 
  FileText, 
  Hash, 
  Clock, 
  AlertCircle, 
  CheckCircle2,
  XCircle,
  TrendingUp,
  Database,
  BarChart3,
  RefreshCw
} from 'lucide-react';

interface ActivityItem {
  id: number;
  operation_type: string;
  source_url?: string;
  title?: string;
  status: string;
  details: any;
  metrics: any;
  error_message?: string;
  created_at: string;
}

interface ActivityStats {
  operation_type: string;
  count: string;
  success_count: string;
  error_count: string;
  avg_tokens?: string;
  total_tokens?: string;
  avg_chunks?: string;
  total_chunks?: string;
  avg_content_length?: string;
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [statistics, setStatistics] = useState<ActivityStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const fetchActivities = async () => {
    try {
      setRefreshing(true);
      const params = selectedType !== 'all' ? `?operation_type=${selectedType}` : '';
      const data = await api.activity.getHistory(params);
      setActivities(data.activities || []);
      setStatistics(data.statistics || []);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError('Failed to load activity history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const initializeTables = async () => {
    try {
      await api.activity.initTable();
      await fetchActivities();
    } catch (err) {
      console.error('Error initializing tables:', err);
    }
  };

  useEffect(() => {
    initializeTables();
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [selectedType]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatNumber = (num: string | number | null | undefined) => {
    if (!num) return '0';
    return parseInt(num.toString()).toLocaleString('tr-TR');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'scrape':
        return <FileText className="w-4 h-4" />;
      case 'embedding':
        return <Hash className="w-4 h-4" />;
      case 'delete':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  if (loading && !refreshing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Loading activity history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Activity History</h1>
          <p className="text-muted-foreground">Track all operations and metrics</p>
        </div>
        <Button
          onClick={() => fetchActivities()}
          disabled={refreshing}
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statistics.map((stat) => (
          <Card key={stat.operation_type}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {getOperationIcon(stat.operation_type)}
                {stat.operation_type.charAt(0).toUpperCase() + stat.operation_type.slice(1)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium">{formatNumber(stat.count)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Success:</span>
                  <span className="font-medium">{formatNumber(stat.success_count)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Error:</span>
                  <span className="font-medium">{formatNumber(stat.error_count)}</span>
                </div>
                {stat.total_tokens && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tokens:</span>
                      <span className="font-medium">{formatNumber(stat.total_tokens)}</span>
                    </div>
                  </div>
                )}
                {stat.total_chunks && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Chunks:</span>
                    <span className="font-medium">{formatNumber(stat.total_chunks)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
          <CardDescription>Detailed log of all operations</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedType} onValueChange={setSelectedType}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="scrape">Scraping</TabsTrigger>
              <TabsTrigger value="embedding">Embeddings</TabsTrigger>
              <TabsTrigger value="delete">Deletions</TabsTrigger>
            </TabsList>
            
            <TabsContent value={selectedType}>
              <div className="space-y-4">
                {activities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No activities found
                  </div>
                ) : (
                  activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getOperationIcon(activity.operation_type)}
                            <span className="font-medium">
                              {activity.operation_type.charAt(0).toUpperCase() + 
                               activity.operation_type.slice(1)}
                            </span>
                            {getStatusBadge(activity.status)}
                            <span className="text-sm text-muted-foreground">
                              {formatDate(activity.created_at)}
                            </span>
                          </div>
                          
                          {activity.title && (
                            <p className="font-medium mb-1">{activity.title}</p>
                          )}
                          
                          {activity.source_url && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {activity.source_url}
                            </p>
                          )}
                          
                          {activity.error_message && (
                            <Alert variant="destructive" className="mt-2">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{activity.error_message}</AlertDescription>
                            </Alert>
                          )}
                          
                          {activity.metrics && (
                            <div className="flex flex-wrap gap-4 mt-2">
                              {activity.metrics.content_length && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Content: </span>
                                  <span className="font-medium">
                                    {formatNumber(activity.metrics.content_length)} chars
                                  </span>
                                </div>
                              )}
                              {activity.metrics.chunk_count && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Chunks: </span>
                                  <span className="font-medium">
                                    {formatNumber(activity.metrics.chunk_count)}
                                  </span>
                                </div>
                              )}
                              {activity.metrics.token_count && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Tokens: </span>
                                  <span className="font-medium">
                                    {formatNumber(activity.metrics.token_count)}
                                  </span>
                                </div>
                              )}
                              {activity.metrics.extraction_time_ms && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Time: </span>
                                  <span className="font-medium">
                                    {activity.metrics.extraction_time_ms}ms
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}