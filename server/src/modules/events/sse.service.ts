import { Response } from 'express';

class SseService {
  private readonly connections = new Map<string, Set<Response>>();

  subscribe(unitId: string, res: Response): void {
    if (!this.connections.has(unitId)) this.connections.set(unitId, new Set());
    this.connections.get(unitId)!.add(res);
  }

  unsubscribe(unitId: string, res: Response): void {
    this.connections.get(unitId)?.delete(res);
  }

  emit(unitId: string, event: string): void {
    const subs = this.connections.get(unitId);
    if (!subs?.size) return;
    const payload = `event: ${event}\ndata: {}\n\n`;
    for (const res of subs) {
      try { res.write(payload); }
      catch { subs.delete(res); }
    }
  }
}

export const sseService = new SseService();
