'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Play,
  Pause,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Trash2,
  Pencil
} from 'lucide-react';
import { toast } from 'sonner';

interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  job_type: string;
  schedule_type: string;
  cron_expression?: string;
  interval_seconds?: number;
  enabled: boolean;
  last_run_at?: string;
  last_run_status?: string;
  next_run_at?: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  job_config?: Record<string, unknown>;
}

interface SchedulerStats {
  total_jobs: number;
  enabled_jobs: number;
  disabled_jobs: number;
  executions_last_24h: number;
  successful_last_24h: number;
  failed_last_24h: number;
  scheduler_running: boolean;
}

interface CrawlerOption {
  id: string;
  label: string;
  description: string;
  script: string;
  category: string;
}

// GIB categories and Legislation types - matched to real crawler scripts
const AVAILABLE_CRAWLERS: CrawlerOption[] = [
  // GIB Crawlers
  { id: 'gib_sirkuler', label: 'GIB Circulars', description: 'Circular list', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_kanunlar', label: 'GIB Laws', description: 'Tax laws', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_gerekceler', label: 'GIB Justifications', description: 'Law justifications', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_tebligler', label: 'GIB Notices', description: 'Tax notices', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_yonetmelikler', label: 'GIB Regulations', description: 'Regulations', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_ic_genelgeler', label: 'GIB Internal Circulars', description: 'Internal circulars', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_genel_yazilar', label: 'GIB General Letters', description: 'General letters', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_ozelgeler', label: 'GIB Tax Rulings', description: 'Tax rulings', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_cbk', label: 'GIB CBK', description: 'Presidential decisions', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  { id: 'gib_bkk', label: 'GIB BKK', description: 'Council of Ministers decisions', script: 'vergilex_gib_crawler.py', category: 'GIB' },
  // Legislation Crawlers
  { id: 'mevzuat_kanun', label: 'Legislation Laws', description: 'mevzuat.gov.tr laws', script: 'vergilex_mevzuat_crawler.py', category: 'Legislation' },
  { id: 'mevzuat_tuzuk', label: 'Legislation Statutes', description: 'mevzuat.gov.tr statutes', script: 'vergilex_mevzuat_crawler.py', category: 'Legislation' },
  { id: 'mevzuat_yonetmelik', label: 'Legislation Regulations', description: 'mevzuat.gov.tr regulations', script: 'vergilex_mevzuat_crawler.py', category: 'Legislation' },
  { id: 'mevzuat_khk', label: 'Legislation Decree-Laws', description: 'Decree-laws with the force of statute', script: 'vergilex_mevzuat_crawler.py', category: 'Legislation' },
  { id: 'mevzuat_cbk', label: 'Legislation CBK', description: 'Presidential decrees', script: 'vergilex_mevzuat_crawler.py', category: 'Legislation' },
  { id: 'mevzuat_teblig', label: 'Legislation Notices', description: 'mevzuat.gov.tr notices', script: 'vergilex_mevzuat_crawler.py', category: 'Legislation' },
];

// Crawler ID → script args mapping
const CRAWLER_ARGS: Record<string, string[]> = {
  // GIB
  'gib_sirkuler': ['sirkuler', '--update'],
  'gib_kanunlar': ['kanunlar', '--update'],
  'gib_gerekceler': ['gerekceler', '--update'],
  'gib_tebligler': ['tebligler', '--update'],
  'gib_yonetmelikler': ['yonetmelikler', '--update'],
  'gib_ic_genelgeler': ['ic_genelgeler', '--update'],
  'gib_genel_yazilar': ['genel_yazilar', '--update'],
  'gib_ozelgeler': ['ozelgeler', '--update'],
  'gib_cbk': ['cbk', '--update'],
  'gib_bkk': ['bkk', '--update'],
  // Mevzuat (MevzuatTur values)
  'mevzuat_kanun': ['--tur', '1', '--update'],
  'mevzuat_tuzuk': ['--tur', '2', '--update'],
  'mevzuat_yonetmelik': ['--tur', '3', '--update'],
  'mevzuat_khk': ['--tur', '4', '--update'],
  'mevzuat_cbk': ['--tur', '6', '--update'],
  'mevzuat_teblig': ['--tur', '9', '--update'],
};

interface JobFormData {
  name: string;
  crawler: string;
  scheduleType: 'cron' | 'interval';
  cronExpression: string;
  intervalHours: number;
  enabled: boolean;
}

const DEFAULT_FORM: JobFormData = {
  name: '',
  crawler: '',
  scheduleType: 'cron',
  cronExpression: '0 3 * * 0', // Every Sunday at 03:00
  intervalHours: 168, // 1 week
  enabled: true
};

export default function SchedulerSection() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [stats, setStats] = useState<SchedulerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [formData, setFormData] = useState<JobFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, statsRes] = await Promise.all([
        fetch('/api/v2/scheduler/jobs'),
        fetch('/api/v2/scheduler/stats')
      ]);

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Failed to fetch scheduler data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const openAddModal = () => {
    setEditingJob(null);
    setFormData(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEditModal = (job: ScheduledJob) => {
    setEditingJob(job);

    // Parse job config to extract crawler ID
    let crawlerId = '';
    if (job.job_config) {
      const config = job.job_config as Record<string, unknown>;
      const scriptPath = config.script_path as string || '';
      const args = config.args as string[] || [];

      // Try to determine crawler from script and args
      if (scriptPath.includes('gib_crawler')) {
        const category = args[0];
        if (category) crawlerId = `gib_${category}`;
      } else if (scriptPath.includes('mevzuat_crawler')) {
        const turIndex = args.indexOf('--tur');
        if (turIndex !== -1) {
          const tur = args[turIndex + 1];
          const turMap: Record<string, string> = {
            '1': 'mevzuat_kanun',
            '2': 'mevzuat_tuzuk',
            '3': 'mevzuat_yonetmelik',
            '4': 'mevzuat_khk',
            '6': 'mevzuat_cbk',
            '9': 'mevzuat_teblig'
          };
          crawlerId = turMap[tur] || '';
        }
      }
    }

    setFormData({
      name: job.name,
      crawler: crawlerId,
      scheduleType: job.schedule_type as 'cron' | 'interval',
      cronExpression: job.cron_expression || '0 3 * * 0',
      intervalHours: job.interval_seconds ? Math.round(job.interval_seconds / 3600) : 168,
      enabled: job.enabled
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Job name is required');
      return;
    }
    if (!formData.crawler) {
      toast.error('Crawler selection is required');
      return;
    }

    setSaving(true);
    try {
      const crawler = AVAILABLE_CRAWLERS.find(c => c.id === formData.crawler);
      const args = CRAWLER_ARGS[formData.crawler] || [];

      const payload = {
        name: formData.name,
        job_type: 'custom_script',
        description: crawler?.description || '',
        schedule_type: formData.scheduleType,
        cron_expression: formData.scheduleType === 'cron' ? formData.cronExpression : undefined,
        interval_seconds: formData.scheduleType === 'interval' ? formData.intervalHours * 3600 : undefined,
        job_config: {
          script_path: `crawlers/${crawler?.script}`,
          args: args,
          timeout_seconds: 7200 // 2 saat
        },
        enabled: formData.enabled
      };

      let res: Response;
      if (editingJob) {
        res = await fetch(`/api/v2/scheduler/jobs/${editingJob.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/v2/scheduler/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        toast.success(editingJob ? 'Job updated' : 'Job created');
        setShowModal(false);
        fetchData();
      } else {
        const error = await res.json();
        toast.error(error.message || 'Operation failed');
      }
    } catch (error) {
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    setActionLoading(jobId);
    try {
      const res = await fetch(`/api/v2/scheduler/jobs/${jobId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId));
        toast.success('Job deleted');
      } else {
        toast.error('Failed to delete job');
      }
    } catch (error) {
      toast.error('Failed to delete job');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggle = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const res = await fetch(`/api/v2/scheduler/jobs/${jobId}/toggle`, {
        method: 'POST'
      });

      if (res.ok) {
        const updatedJob = await res.json();
        setJobs(prev => prev.map(j => j.id === jobId ? updatedJob : j));
        toast.success(updatedJob.enabled ? 'Job enabled' : 'Job disabled');
      } else {
        toast.error('Operation failed');
      }
    } catch (error) {
      toast.error('Operation failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunNow = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const res = await fetch(`/api/v2/scheduler/jobs/${jobId}/run-now`, {
        method: 'POST'
      });

      if (res.ok) {
        toast.success('Job started');
        setTimeout(fetchData, 2000);
      } else {
        toast.error('Failed to start job');
      }
    } catch (error) {
      toast.error('Failed to start job');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Success</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Failed</Badge>;
      case 'running':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Running</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500/30">Pending</Badge>;
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const formatSchedule = (job: ScheduledJob) => {
    if (job.schedule_type === 'cron' && job.cron_expression) {
      // Simple cron description
      const parts = job.cron_expression.split(' ');
      if (parts.length >= 5) {
        const [min, hour, , , dayOfWeek] = parts;
        if (dayOfWeek === '0') return `Every Sunday ${hour}:${min.padStart(2, '0')}`;
        if (dayOfWeek === '*' && hour !== '*') return `Every day ${hour}:${min.padStart(2, '0')}`;
      }
      return job.cron_expression;
    }
    if (job.schedule_type === 'interval' && job.interval_seconds) {
      const hours = Math.round(job.interval_seconds / 3600);
      if (hours >= 24) return `Every ${Math.round(hours / 24)} days`;
      return `Every ${hours} hours`;
    }
    return '-';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Total Jobs</div>
              <p className="text-2xl font-bold mt-1">{stats.total_jobs}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Active</div>
              <p className="text-2xl font-bold mt-1 text-green-600">{stats.enabled_jobs}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Successful (24h)</div>
              <p className="text-2xl font-bold mt-1 text-green-600">{stats.successful_last_24h}</p>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Failed (24h)</div>
              <p className="text-2xl font-bold mt-1 text-red-600">{stats.failed_last_24h}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Jobs List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Scheduled Jobs</CardTitle>
              <CardDescription>
                Crawler and data processing tasks
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-1" />
                New Job
              </Button>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No scheduled jobs yet</p>
              <p className="text-sm mt-1">Click New Job to add a crawler</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card/30 hover:bg-card/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{job.name}</span>
                      {getStatusBadge(job.last_run_status)}
                      {!job.enabled && (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatSchedule(job)}</span>
                      <span>Last: {formatDateTime(job.last_run_at)}</span>
                      <span>{job.successful_runs}/{job.total_runs} successful</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRunNow(job.id)}
                      disabled={actionLoading === job.id || !job.enabled}
                      title="Run Now"
                    >
                      {actionLoading === job.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(job)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Switch
                      checked={job.enabled}
                      onCheckedChange={() => handleToggle(job.id)}
                      disabled={actionLoading === job.id}
                    />

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteJob(job.id)}
                      disabled={actionLoading === job.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingJob ? 'Edit Job' : 'New Crawler Job'}
            </DialogTitle>
            <DialogDescription>
              {editingJob ? 'Update job settings' : 'Create a scheduled crawler task'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Job Name */}
            <div className="space-y-2">
              <Label htmlFor="jobName">Job Name</Label>
              <Input
                id="jobName"
                placeholder="e.g. GIB Circulars Weekly"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Crawler Selection */}
            <div className="space-y-2">
              <Label>Crawler</Label>
              <Select
                value={formData.crawler}
                onValueChange={(value) => setFormData({ ...formData, crawler: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select crawler" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">GIB</div>
                  {AVAILABLE_CRAWLERS.filter(c => c.category === 'GIB').map((crawler) => (
                    <SelectItem key={crawler.id} value={crawler.id}>
                      {crawler.label}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">Legislation</div>
                  {AVAILABLE_CRAWLERS.filter(c => c.category === 'Legislation').map((crawler) => (
                    <SelectItem key={crawler.id} value={crawler.id}>
                      {crawler.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Schedule Type */}
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select
                value={formData.scheduleType}
                onValueChange={(value: 'cron' | 'interval') => setFormData({ ...formData, scheduleType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">Cron (Specific Time)</SelectItem>
                  <SelectItem value="interval">Periodic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cron / Interval Input */}
            {formData.scheduleType === 'cron' ? (
              <div className="space-y-2">
                <Label htmlFor="cronExpr">Cron Expression</Label>
                <Input
                  id="cronExpr"
                  placeholder="0 3 * * 0"
                  value={formData.cronExpression}
                  onChange={(e) => setFormData({ ...formData, cronExpression: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Examples: 0 3 * * 0 (Every Sunday 03:00), 0 6 * * * (Every day 06:00)
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="intervalHours">Repeat Interval (Hours)</Label>
                <Input
                  id="intervalHours"
                  type="number"
                  min={1}
                  value={formData.intervalHours}
                  onChange={(e) => setFormData({ ...formData, intervalHours: parseInt(e.target.value) || 168 })}
                />
                <p className="text-xs text-muted-foreground">
                  168 hours = 1 week
                </p>
              </div>
            )}

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="enabled">Active</Label>
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                editingJob ? 'Update' : 'Create'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
