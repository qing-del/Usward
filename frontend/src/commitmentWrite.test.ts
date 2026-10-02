import { describe, expect, it } from 'vitest'
import { createCommitmentValues, emptyCommitmentDraft, patchCommitmentValues } from './commitmentWrite'

describe('commitment due precision and partial editing', () => {
  it('keeps a calendar date and its original timezone', () => {
    const draft = { ...emptyCommitmentDraft('Asia/Shanghai'), title: '一起读书', dueKind: 'DATE' as const,
      dueDate: '2026-11-01', dueTimezone: 'America/New_York' }
    expect(createCommitmentValues(draft, 'Asia/Shanghai', null)).toMatchObject({
      dueKind: 'DATE', dueDate: '2026-11-01', dueTimezone: 'America/New_York', dueAt: null,
    })
    expect(() => createCommitmentValues({ ...draft, dueDate: '2011-12-30',
      dueTimezone: 'Pacific/Apia' }, 'Asia/Shanghai', null)).toThrow('整日不存在')
  })

  it('requires a chosen offset for repeated local time and rejects a nonexistent time', () => {
    const draft = { ...emptyCommitmentDraft('America/New_York'), title: '读书',
      dueKind: 'INSTANT' as const, dueLocal: '2026-11-01T01:30' }
    expect(() => createCommitmentValues(draft, 'America/New_York', null)).toThrow('明确选择')
    expect(createCommitmentValues({ ...draft, dueOffset: '-05:00' },
      'America/New_York', null).dueAt).toBe('2026-11-01T06:30:00.000Z')
    expect(() => createCommitmentValues({ ...draft, dueLocal: '2026-03-08T02:30' },
      'America/New_York', null)).toThrow('不存在')
  })

  it('patches only changed fields and does not revalidate a stale source unless removed', () => {
    const original = { ...emptyCommitmentDraft('Asia/Shanghai'), title: '原题' }
    expect(patchCommitmentValues({ ...original, title: '新题' }, original,
      'Asia/Shanghai', '7', false)).toEqual({ expectedVersion: '7', title: '新题' })
    expect(patchCommitmentValues(original, original, 'Asia/Shanghai', '7', true)).toEqual({
      expectedVersion: '7', sourceType: null, sourceId: null,
    })
    expect(patchCommitmentValues({ ...original, dueKind: 'DATE', dueDate: '2026-11-01' },
      original, 'Asia/Shanghai', '7', false)).toMatchObject({ expectedVersion: '7',
      dueKind: 'DATE', dueAt: null, dueDate: '2026-11-01', dueTimezone: 'Asia/Shanghai' })
  })
})
