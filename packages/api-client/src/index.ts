import type { User, Agent, Message } from '@strawberry/shared';
import { ApiClient } from './http';

export function createApi(apiBaseUrl: string, getToken: () => string | null) {
  const http = new ApiClient(apiBaseUrl, getToken);
  return {
    // Auth
    register: (b: { email: string; password: string; name?: string }) =>
      http.post<{ token: string; user_id: number; email: string; name: string }>(
        '/v1/user/register',
        b,
      ),
    login: (b: { email: string; password: string }) =>
      http.post<{ token: string; user_id: number; email: string; name: string }>(
        '/v1/user/login',
        b,
      ),
    // Me
    me: () => http.get<User & { devices: any[] }>('/v1/me'),
    patchMe: (b: Partial<Pick<User, 'name' | 'email'>>) => http.patch<User>('/v1/me', b),
    changePassword: (b: { current_password: string; new_password: string }) =>
      http.put<void>('/v1/me/password', b),
    // Agent
    agent: () => http.get<Agent>('/v1/me/agent'),
    patchAgent: (b: { name: string }) => http.patch<Agent>('/v1/me/agent', b),
    systemMessage: () => http.get<{ system_message: string }>('/v1/me/agent/system_message'),
    setSystemMessage: (b: { system_message: string }) =>
      http.post<{ message: string }>('/v1/me/agent/system_message', b),
    clearContext: () => http.post<{ message: string }>('/v1/me/agent/context/clear', {}),
    // Chat
    listMessages: (count = 20) => http.get<{ messages: Message[] }>(`/v1/conversations/messages?count=${count}`),
    sendMessage: (content: string) => http.post<{ status: string; stream: boolean }>(`/v1/conversations/messages`, { content }),
  };
}

