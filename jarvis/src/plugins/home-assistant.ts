import type { ToolDefinition } from '../actions/tools/registry.ts';

export interface HADevice {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
}

export interface HAScene {
  entity_id: string;
  attributes: Record<string, any>;
}

export class HomeAssistantClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || process.env.HOME_ASSISTANT_URL || 'http://homeassistant.local:8123';
    this.token = token || process.env.HOME_ASSISTANT_TOKEN || '';
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}/api${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Home Assistant API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getStates(): Promise<HADevice[]> {
    return this.request('/states');
  }

  async getServices(): Promise<Record<string, any>> {
    return this.request('/services');
  }

  async callService(domain: string, service: string, data?: Record<string, any>): Promise<any> {
    return this.request(`/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  async getScenes(): Promise<HAScene[]> {
    const states = await this.getStates();
    return states.filter(s => s.entity_id.startsWith('scene.'));
  }
}

let haClient: HomeAssistantClient | null = null;

function getHA(): HomeAssistantClient {
  if (!haClient) {
    haClient = new HomeAssistantClient();
  }
  return haClient;
}

export const haControlTool: ToolDefinition = {
  name: 'ha_control',
  description: 'Control Home Assistant devices (lights, switches, thermostats, locks).',
  category: 'iot',
  parameters: {
    entity: {
      type: 'string',
      description: 'Entity ID (e.g., light.living_room)',
      required: true,
    },
    action: {
      type: 'string',
      description: 'Action: turn_on, turn_off, toggle, set',
      required: true,
    },
    brightness: {
      type: 'number',
      description: 'Brightness (0-100) for lights',
      required: false,
    },
    temperature: {
      type: 'number',
      description: 'Temperature for thermostats',
      required: false,
    },
  },
  execute: async (params) => {
    const ha = getHA();
    const entity = params.entity as string;
    const action = params.action as string;

    let domain = 'homeassistant';
    if (entity.startsWith('light.')) domain = 'light';
    else if (entity.startsWith('switch.')) domain = 'switch';
    else if (entity.startsWith('climate.')) domain = 'climate';
    else if (entity.startsWith('lock.')) domain = 'lock';
    else if (entity.startsWith('cover.')) domain = 'cover';

    let service = action;
    let data: Record<string, any> = { entity_id: entity };

    if (action === 'set') {
      service = 'turn_on';
      if (params.brightness !== undefined) {
        data.brightness = (params.brightness as number) * 2.55;
      }
      if (params.temperature !== undefined) {
        data.temperature = params.temperature;
      }
    }

    try {
      await ha.callService(domain, service, data);
      return `✅ ${entity} → ${action}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const haSceneTool: ToolDefinition = {
  name: 'ha_scene',
  description: 'Activate a Home Assistant scene.',
  category: 'iot',
  parameters: {
    scene: {
      type: 'string',
      description: 'Scene name or entity ID',
      required: true,
    },
  },
  execute: async (params) => {
    const ha = getHA();
    const scene = params.scene as string;

    const entityId = scene.startsWith('scene.') ? scene : `scene.${scene.toLowerCase().replace(/\s+/g, '_')}`;

    try {
      await ha.callService('scene', 'turn_on', { entity_id: entityId });
      return `✅ Scene activated: ${scene}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const haListDevicesTool: ToolDefinition = {
  name: 'ha_list_devices',
  description: 'List all Home Assistant devices and their current states.',
  category: 'iot',
  parameters: {},
  execute: async () => {
    const ha = getHA();

    try {
      const states = await ha.getStates();
      const devices = states.map(d => `${d.entity_id}: ${d.state}`).join('\n');
      return `Home Assistant Devices (${states.length}):\n\n${devices}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}. Check HA_URL and HA_TOKEN in config.`;
    }
  },
};