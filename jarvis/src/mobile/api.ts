import type { ApiContext } from '../daemon/api-routes.ts';

export function createMobileRoutes(ctx: ApiContext) {
  return {
    '/api/mobile/status': {
      GET: () => {
        const llm = ctx.agentService.getLLMManager();
        return Response.json({
          daemon: 'online',
          version: '1.0.0',
          model: llm?.getPrimary() || 'none',
          features: [
            'voice',
            'browser',
            'desktop',
            'awareness',
            'sites',
            'workflows',
          ],
        });
      },
    },
    '/api/mobile/chat': {
      POST: async (req: Request) => {
        if (!ctx.wsService) {
          return Response.json({ error: 'WebSocket service not available' }, { status: 503 });
        }
        try {
          const body = await req.json() as { message: string; voice?: boolean };
          if (!body.message) {
            return Response.json({ error: 'Missing message' }, { status: 400 });
          }

          const result = await ctx.wsService.sendChat(body.message, body.voice);
          return Response.json({ response: result });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    '/api/mobile/notifications': {
      GET: () => {
        const notifications = ctx.wsService?.getRecentNotifications(20) || [];
        return Response.json({ notifications });
      },
    },
    '/api/mobile/geofence': {
      POST: async (req: Request) => {
        const body = await req.json() as { lat: number; lng: number; zone?: string };
        
        if (body.zone) {
          ctx.wsService?.broadcastNotification(
            `📍 Entered zone: ${body.zone}`,
            'normal'
          );
        }
        
        return Response.json({ success: true, zone: body.zone });
      },
      GET: () => {
        return Response.json({
          enabled: false,
          zones: [],
        });
      },
    },
  };
}