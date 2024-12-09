import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import fs from 'fs';
import path from 'path';

interface Session {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  organizationName?: string;
  [key: string]: any; // Allow additional properties
}

class AuthProvider {
  private session: Session;
  public isAuthenticated: boolean;
  private graphClient: Client | null;
  private organizationName: string | null;
  private tenantFolder: string | null;

  constructor(session: Session) {
    this.session = session;
    this.isAuthenticated = false;
    this.graphClient = null;
    this.organizationName = null;
    this.tenantFolder = null;
  }

  async initialize(): Promise<void> {
    const { tenantId, clientId, clientSecret } = this.session;

    if (tenantId && clientId && clientSecret) {
      await this.login(tenantId, clientId, clientSecret);
    }
  }

  async login(tenantId: string, clientId: string, clientSecret: string): Promise<boolean> {
    try {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const client = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken("https://graph.microsoft.com/.default");
            return token.token;
          }
        }
      });

      // Test the connection and fetch organization info
      const orgInfo = await client.api('/organization').select('displayName').get();
      this.organizationName = orgInfo.value[0].displayName;

      this.isAuthenticated = true;
      this.graphClient = client;

      // Save credentials in session
      this.session.tenantId = tenantId;
      this.session.clientId = clientId;
      this.session.clientSecret = clientSecret;
      this.session.organizationName = this.organizationName || undefined;

      // Create tenant folder
      await this.createTenantFolder(tenantId);

      return true;
    } catch (error) {
      console.error('Login failed:', error);
      this.isAuthenticated = false;
      this.graphClient = null;
      this.organizationName = null;
      this.tenantFolder = null;
      return false;
    }
  }

  logout(): void {
    this.isAuthenticated = false;
    this.graphClient = null;
    this.organizationName = null;
    this.tenantFolder = null;

    // Clear credentials from session
    delete this.session.tenantId;
    delete this.session.clientId;
    delete this.session.clientSecret;
    delete this.session.organizationName;
  }

  getOrganizationName(): string | null {
    return this.organizationName || this.session.organizationName || null;
  }

  public getGraphClient(): Client {
    if (!this.graphClient) {
      throw new Error('Graph client is not initialized');
    }
    return this.graphClient;
  }

  private async createTenantFolder(tenantId: string): Promise<void> {
    const pstFolderPath = path.resolve(__dirname, '../pst');
    const tenantFolderPath = path.join(pstFolderPath, tenantId);

    try {
      if (!fs.existsSync(tenantFolderPath)) {
        await fs.promises.mkdir(tenantFolderPath, { recursive: true });
      }
      this.tenantFolder = tenantFolderPath;
    } catch (error) {
      console.error(`Error creating tenant folder: ${error}`);
      throw error;
    }
  }

  public getTenantFolder(): string | null {
    return this.tenantFolder;
  }
}

export default AuthProvider;