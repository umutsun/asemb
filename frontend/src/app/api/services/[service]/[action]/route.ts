import { NextRequest, NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Service configurations
const SERVICE_CONFIGS: Record<string, any> = {
  lightrag: {
    name: 'LightRAG API',
    script: 'lightrag_api.py',
    port: 8084,
    cwd: path.join(process.cwd(), '..', 'backend'),
    command: 'python',
    args: ['lightrag_api.py', '--port', '8084']
  },
  raganything: {
    name: 'RAGAnything',
    script: 'raganything_server.py',
    port: 8085,
    cwd: path.join(process.cwd(), '..', 'backend'),
    command: 'python',
    args: ['raganything_server.py', '--port', '8085']
  },
  embedder: {
    name: 'Embedder Service',
    script: 'embedder_service.py',
    port: 8086,
    cwd: path.join(process.cwd(), '..', 'backend'),
    command: 'python',
    args: ['embedder_service.py', '--port', '8086']
  },
  ollama: {
    name: 'Ollama',
    port: 11434,
    command: 'ollama',
    args: ['serve']
  }
};

// Store running processes
const runningProcesses: Map<string, any> = new Map();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string; action: string }> }
) {
  const { service, action } = await params;
  
  if (!SERVICE_CONFIGS[service]) {
    return NextResponse.json(
      { error: 'Unknown service' },
      { status: 404 }
    );
  }

  const config = SERVICE_CONFIGS[service];

  try {
    switch (action) {
      case 'start':
        return await startService(service, config);
      
      case 'stop':
        return await stopService(service, config);
      
      case 'restart':
        await stopService(service, config);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await startService(service, config);
      
      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`Error ${action} service ${service}:`, error);
    return NextResponse.json(
      { error: `Failed to ${action} service` },
      { status: 500 }
    );
  }
}

async function startService(serviceId: string, config: any) {
  // Check if already running
  if (runningProcesses.has(serviceId)) {
    return NextResponse.json({ 
      status: 'already_running',
      message: `${config.name} is already running`
    });
  }

  try {
    // Check if script exists (for Python services)
    if (config.script) {
      const scriptPath = path.join(config.cwd, config.script);
      try {
        await fs.access(scriptPath);
      } catch {
        return NextResponse.json(
          { error: `Script not found: ${scriptPath}` },
          { status: 404 }
        );
      }
    }

    // Start the process
    const process = spawn(config.command, config.args, {
      cwd: config.cwd,
      detached: false,
      stdio: 'pipe',
      shell: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      }
    });

    // Store process reference
    runningProcesses.set(serviceId, process);

    // Handle process output
    process.stdout?.on('data', (data) => {
      console.log(`[${serviceId}] ${data.toString()}`);
    });

    process.stderr?.on('data', (data) => {
      console.error(`[${serviceId}] ${data.toString()}`);
    });

    process.on('exit', (code) => {
      console.log(`[${serviceId}] Process exited with code ${code}`);
      runningProcesses.delete(serviceId);
    });

    return NextResponse.json({ 
      status: 'started',
      message: `${config.name} started successfully`,
      pid: process.pid
    });
  } catch (error) {
    console.error('Failed to start service:', error);
    return NextResponse.json(
      { error: 'Failed to start service' },
      { status: 500 }
    );
  }
}

async function stopService(serviceId: string, config: any) {
  const process = runningProcesses.get(serviceId);
  
  if (!process) {
    // Try to find and kill by port if no stored process
    if (config.port) {
      try {
        if (process.platform === 'win32') {
          // Windows: Find and kill process by port
          const { stdout } = await execAsync(`netstat -ano | findstr :${config.port}`);
          const lines = stdout.trim().split('\n');
          
          for (const line of lines) {
            if (line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/);
              const pid = parts[parts.length - 1];
              await execAsync(`taskkill /F /PID ${pid}`);
              return NextResponse.json({ 
                status: 'stopped',
                message: `${config.name} stopped`
              });
            }
          }
        } else {
          // Unix-like: Use lsof to find and kill
          const { stdout } = await execAsync(`lsof -ti:${config.port}`);
          const pid = stdout.trim();
          if (pid) {
            await execAsync(`kill -9 ${pid}`);
            return NextResponse.json({ 
              status: 'stopped',
              message: `${config.name} stopped`
            });
          }
        }
      } catch (error) {
        // Process might not be running
      }
    }
    
    return NextResponse.json({ 
      status: 'not_running',
      message: `${config.name} is not running`
    });
  }

  // Kill the stored process
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /F /PID ${process.pid}`);
    } else {
      process.kill('SIGTERM');
    }
    
    runningProcesses.delete(serviceId);
    
    return NextResponse.json({ 
      status: 'stopped',
      message: `${config.name} stopped successfully`
    });
  } catch (error) {
    console.error('Failed to stop service:', error);
    return NextResponse.json(
      { error: 'Failed to stop service' },
      { status: 500 }
    );
  }
}