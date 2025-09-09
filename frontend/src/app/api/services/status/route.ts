import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);

// Check if a port is in use
async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', () => {
      resolve(true); // Port is in use
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false); // Port is free
    });
    
    server.listen(port, '127.0.0.1');
  });
}

// Get process info for Windows
async function getWindowsProcessInfo(port: number): Promise<any> {
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
    const lines = stdout.trim().split('\n');
    
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        
        // Get process name
        const { stdout: processInfo } = await execAsync(`tasklist /fi "PID eq ${pid}" /fo csv`);
        const processLines = processInfo.trim().split('\n');
        if (processLines.length > 1) {
          const processData = processLines[1].split(',');
          const processName = processData[0].replace(/"/g, '');
          
          return {
            pid: parseInt(pid),
            name: processName,
            status: 'running'
          };
        }
      }
    }
  } catch (error) {
    // Process not found or command failed
  }
  return null;
}

export async function GET() {
  try {
    const services: Record<string, any> = {
      lightrag: {
        name: 'LightRAG API',
        port: 8084,
        status: 'stopped',
      },
      raganything: {
        name: 'RAGAnything',
        port: 8085,
        status: 'stopped',
      },
      embedder: {
        name: 'Embedder Service',
        port: 8086,
        status: 'stopped',
      },
      ollama: {
        name: 'Ollama',
        port: 11434,
        status: 'stopped',
      },
      postgres: {
        name: 'PostgreSQL',
        port: 5432,
        status: 'stopped',
      },
      redis: {
        name: 'Redis',
        port: 6379,
        status: 'stopped',
      }
    };

    // Check each service
    for (const [key, service] of Object.entries(services)) {
      const portInUse = await checkPort(service.port);
      
      if (portInUse) {
        services[key].status = 'running';
        
        // Get process info on Windows
        if (process.platform === 'win32') {
          const processInfo = await getWindowsProcessInfo(service.port);
          if (processInfo) {
            services[key].pid = processInfo.pid;
            services[key].processName = processInfo.name;
          }
        }
      }
    }

    return NextResponse.json({ 
      services,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking services:', error);
    return NextResponse.json(
      { error: 'Failed to check service status' },
      { status: 500 }
    );
  }
}