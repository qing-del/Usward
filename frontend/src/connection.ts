import { request } from './api'

export interface PublicUser {
  id: string
  nickname: string
  avatarStyle: 'INITIAL' | 'FLOWER' | 'SUN' | 'SPROUT'
}

export interface PairConnection {
  id: string
  status: 'ACTIVE'
  version: string
  members: PublicUser[]
}

export interface InviteMeta {
  id: string
  status: 'PENDING' | 'REVOKED' | 'ACCEPTED' | 'EXPIRED'
  expiresAt: string
  version: string
}

export interface CurrentConnection {
  connection: PairConnection | null
  currentInvite: InviteMeta | null
}

export interface IssuedInvite extends InviteMeta {
  token: string
}

export interface InvitePreview {
  id: string
  inviter: PublicUser
  expiresAt: string
  version: string
}

export function getConnection(): Promise<CurrentConnection> {
  return request<CurrentConnection>('GET', '/connection')
}

export function issueInvite(): Promise<IssuedInvite> {
  return request<IssuedInvite>('POST', '/connection-invites')
}

export function previewInvite(token: string): Promise<InvitePreview> {
  return request<InvitePreview>('POST', '/connection-invites/preview', { token })
}

export function acceptInvite(token: string, expectedVersion: string): Promise<PairConnection> {
  return request<PairConnection>('POST', '/connection-invites/accept', { token, expectedVersion })
}

export function revokeInvite(id: string, expectedVersion: string): Promise<InviteMeta> {
  return request<InviteMeta>('POST', `/connection-invites/${encodeURIComponent(id)}/revoke`,
    { expectedVersion })
}

export function endConnection(expectedVersion: string): Promise<CurrentConnection> {
  return request<CurrentConnection>('POST', '/connection/end', { expectedVersion })
}
