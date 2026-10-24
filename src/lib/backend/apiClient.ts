/**
 * QueryPilot FastAPI Backend Client
 */

import { queryPilotEventBus, QueryPilotBackendEvent } from './eventBus';

export class QueryPilotApiClient {
  private ws: WebSocket | null = null;
  private backendUrl: string;
  private wsUrl: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(backendUrl = 'http://localhost:8000') {
    this.backendUrl = backendUrl;
    this.wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/investigations';
  }

  public connect(): void {
    if (typeof window === 'undefined') return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log('[QueryPilot] Connected to FastAPI backend at', this.wsUrl);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as QueryPilotBackendEvent;
          queryPilotEventBus.emit(data);
        } catch (err) {
          console.error('[QueryPilot] Failed to parse backend event', err);
        }
      };

      this.ws.onclose = () => {
        // Retry connection after 5 seconds
        this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
      };

      this.ws.onerror = () => {
        // Will fallback to simulation mode gracefully
      };
    } catch {
      // Local development fallback
    }
  }

  public disconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public async startInvestigation(prompt: string, schemaId: string): Promise<any> {
    try {
      const res = await fetch(`${this.backendUrl}/api/investigations/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schemaId }),
      });
      return await res.json();
    } catch {
      return { status: 'mock_mode_active' };
    }
  }
}

export const queryPilotClient = new QueryPilotApiClient();
