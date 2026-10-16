import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { UsageScanWorktreeRef } from '../usage/usage-provider-contract'

export function defaultCursorChatsDir(home = homedir()): string {
  return join(home, '.cursor', 'chats')
}

export function cursorChatsWorkspaceHash(workspacePath: string): string {
  return createHash('md5').update(workspacePath).digest('hex')
}

export async function mapCursorConversationWorkspaces(
  worktrees: UsageScanWorktreeRef[],
  chatsDir = defaultCursorChatsDir()
): Promise<Map<string, string>> {
  const workspaceByConversation = new Map<string, string>()
  for (const worktree of worktrees) {
    let conversationIds: string[]
    try {
      conversationIds = await readdir(join(chatsDir, cursorChatsWorkspaceHash(worktree.path)))
    } catch {
      continue
    }
    for (const conversationId of conversationIds) {
      workspaceByConversation.set(conversationId, worktree.path)
    }
  }
  return workspaceByConversation
}
