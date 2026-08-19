export type CloudProviderType = 'google' | 'microsoft';

export interface ConnectionStatus {
  connected: boolean;
  provider: CloudProviderType;
  accountEmail?: string;
  credentialsConfigured?: boolean;
  errorMessage?: string;
}

export interface DeviceCodeInfo {
  success: boolean;
  message: string;
  userCode?: string;
  verificationUrl?: string;
  verificationUrlComplete?: string;
  authUrl?: string;
  expiresIn?: number;
  interval?: number;
}

export interface PollResult {
  status: 'pending' | 'done' | 'error';
  accountEmail?: string;
  message?: string;
}

// Client-side API wrapper for Cloud Backup operations via EDARA server API
export const cloudBackupApi = {
  async getStatus(provider: CloudProviderType): Promise<ConnectionStatus> {
    try {
      const res = await fetch(`/api/cloud-backup/status?provider=${provider}`);
      const data = await res.json();
      return {
        connected: !!data.connected,
        provider,
        accountEmail: data.accountEmail || undefined,
        credentialsConfigured: data.credentialsConfigured,
        errorMessage: data.message,
      };
    } catch (e) {
      return { connected: false, provider, errorMessage: 'تعذر الاتصال بخدمة النسخ السحابي.' };
    }
  },

  async startConnect(provider: CloudProviderType): Promise<DeviceCodeInfo> {
    const res = await fetch('/api/cloud-backup/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    return res.json();
  },

  async pollConnect(provider: CloudProviderType): Promise<PollResult> {
    const res = await fetch('/api/cloud-backup/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    return res.json();
  },

  async disconnect(provider: CloudProviderType): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/cloud-backup/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    return res.json();
  },
};
