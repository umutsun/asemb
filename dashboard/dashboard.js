document.addEventListener('DOMContentLoaded', () => {
    // Connect to API server on port 3003
    const socket = io('http://localhost:3003');

    // Status indicators
    const apiStatus = document.getElementById('api-status').querySelector('.status-indicator');
    const redisStatus = document.getElementById('redis-status').querySelector('.status-indicator');
    const n8nStatus = document.getElementById('n8n-status').querySelector('.status-indicator');

    // Agent metrics
    const claudeTasks = document.getElementById('claude-tasks');
    const claudeMemory = document.getElementById('claude-memory');
    const geminiTasks = document.getElementById('gemini-tasks');
    const geminiMemory = document.getElementById('gemini-memory');
    const codexTasks = document.getElementById('codex-tasks');
    const codexMemory = document.getElementById('codex-memory');

    // Performance metrics elements
    const searchLatency = document.getElementById('search-latency');
    const throughput = document.getElementById('throughput');
    const cacheHitRate = document.getElementById('cache-hit-rate');
    const errorRate = document.getElementById('error-rate');

    // Workflow list
    const workflowList = document.getElementById('workflow-list');

    // Redis stats
    const redisUsed = document.getElementById('redis-used');
    const redisPeak = document.getElementById('redis-peak');
    const redisKeys = document.getElementById('redis-keys');

    // Activity log
    const activityLog = document.getElementById('activity-log');

    // Redis chart
    const redisChartCtx = document.getElementById('redis-chart').getContext('2d');
    const redisChart = new Chart(redisChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Redis Memory Usage (MB)',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });

    // WebSocket event listeners
    socket.on('connect', () => {
        console.log('Connected to WebSocket');
        updateStatus(apiStatus, 'active');
        addLogEntry({ timestamp: new Date(), message: 'Dashboard connected to API server' });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket');
        updateStatus(apiStatus, 'inactive');
        addLogEntry({ timestamp: new Date(), message: 'Dashboard disconnected from API server' });
    });

    socket.on('status_update', (data) => {
        console.log('Received status update:', data);
        
        // Update status indicators
        updateStatus(apiStatus, data.api);
        updateStatus(redisStatus, data.redis);
        updateStatus(n8nStatus, data.n8n);

        // Update agent metrics
        if (data.agents) {
            updateAgent(data.agents.claude, claudeTasks, claudeMemory);
            updateAgent(data.agents.gemini, geminiTasks, geminiMemory);
            updateAgent(data.agents.codex, codexTasks, codexMemory);
        }

        // Update performance metrics
        if (data.performance) {
            updatePerformance(data.performance);
        }

        // Update workflow list
        if (data.workflows) {
            updateWorkflows(data.workflows);
        }

        // Update Redis stats and chart
        if (data.redis) {
            updateRedis(data.redis);
        }
    });

    socket.on('log_entry', (entry) => {
        addLogEntry(entry);
    });

    // Helper functions
    function updateStatus(element, status) {
        element.className = `status-indicator ${status}`;
        element.textContent = status === 'active' ? 'Online' : status === 'inactive' ? 'Offline' : 'Checking...';
    }

    function updateAgent(agent, tasksElement, memoryElement) {
        if (!agent) return;
        tasksElement.textContent = agent.tasks;
        memoryElement.textContent = `${agent.memory}MB`;
    }

    function updatePerformance(performance) {
        if (searchLatency) searchLatency.textContent = `${performance.searchLatency}ms`;
        if (throughput) throughput.textContent = `${performance.throughput}/s`;
        if (cacheHitRate) cacheHitRate.textContent = `${performance.cacheHitRate}%`;
        if (errorRate) errorRate.textContent = `${performance.errorRate}%`;
    }

    function updateWorkflows(workflows) {
        workflowList.innerHTML = '';
        workflows.forEach(workflow => {
            const item = document.createElement('div');
            item.className = 'workflow-item';
            item.innerHTML = `<span class="workflow-name">${workflow.name}</span><span class="workflow-status ${workflow.status}">${workflow.status}</span>`;
            workflowList.appendChild(item);
        });
    }

    function updateRedis(redis) {
        redisUsed.textContent = `${redis.used}MB`;
        redisPeak.textContent = `${redis.peak}MB`;
        redisKeys.textContent = redis.keys;

        // Update chart
        redisChart.data.labels.push(new Date().toLocaleTimeString());
        redisChart.data.datasets[0].data.push(redis.used);
        if (redisChart.data.labels.length > 20) {
            redisChart.data.labels.shift();
            redisChart.data.datasets[0].data.shift();
        }
        redisChart.update();
    }

    function addLogEntry(entry) {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `<span class="log-timestamp">${new Date(entry.timestamp).toLocaleTimeString()}</span><span class="log-message">${entry.message}</span>`;
        activityLog.appendChild(item);
        activityLog.scrollTop = activityLog.scrollHeight;
        
        // Keep only last 50 entries
        while (activityLog.children.length > 50) {
            activityLog.removeChild(activityLog.firstChild);
        }
    }

    // Load MetricsPanel
    const metricsFrame = document.querySelector('iframe[src*="MetricsPanel"]');
    if (metricsFrame) {
        metricsFrame.onload = function() {
            console.log('MetricsPanel loaded');
        };
    }
    
    // Periodic status updates
    setInterval(() => {
        fetch('http://localhost:3003/api/dashboard/status')
            .then(res => res.json())
            .then(data => {
                socket.emit('status_update', data);
            })
            .catch(err => console.error('Failed to fetch status:', err));
    }, 5000);
});

// Control panel functions
function deployToProduction() {
    console.log('Deploying to production...');
    alert('Deployment feature coming soon!');
}

function runTests() {
    console.log('Running tests...');
    fetch('http://localhost:3003/api/tests/run')
        .then(res => res.json())
        .then(data => {
            alert('Tests completed! Check console for results.');
            console.log(data);
        })
        .catch(err => {
            alert('Tests feature not yet implemented');
        });
}

function clearCache() {
    console.log('Clearing cache...');
    if (confirm('Are you sure you want to clear the cache?')) {
        fetch('http://localhost:3003/api/cache/clear', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                alert('Cache cleared successfully!');
            })
            .catch(err => {
                alert('Cache clear feature not yet implemented');
            });
    }
}

function refreshStatus() {
    console.log('Refreshing status...');
    location.reload();
}
