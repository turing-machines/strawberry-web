export type User = { user_id: number; email: string; name: string; status: string };
export type Device = { device_id: string; role: string; status: string; agent_name: string };
export type Agent = { agent_id: number; name: string };
export type Message = { role: 'user' | 'assistant'; name?: string; content: string; created_at: number };
export type HttpEnvelope<T = unknown> = { version: string; status_code: number; message: string; data?: T; request_id?: string };
export type WsRequest<T = unknown> = { type: 'request'; version: string; action: string; request_id: string; data: T };
export type WsResponse<T = unknown> = { type: 'response'; version: string; action: string; request_id: string; status_code: number; message: string; data?: T };
export type WsEvent<T = unknown> = { type: 'event'; version: string; event: string; request_id: string; status_code: number; message: string; data?: T };

