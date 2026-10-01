export type AvatarStyle = 'INITIAL' | 'FLOWER' | 'SUN' | 'SPROUT'

export interface Me {
  id: string
  username: string
  nickname: string
  avatarStyle: AvatarStyle
  timezone: string
  notificationEmail: string | null
  mailReminderAvailable: boolean
  shareAvailability: boolean
  version: string
  stats: { openCommitmentCount: number; archivedMemoryCount: number }
}

export interface ApiErrorBody {
  code: string
  message: string
  fieldErrors?: Record<string, string> | null
  traceId?: string
}
