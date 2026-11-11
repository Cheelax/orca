import type { OwnerRepo } from './github-repository-identity'
import type { GitHubRepoExecOptions } from './github-api-repository'
import type { HostedReviewLocalGitOptions } from '../source-control/hosted-review-git-options'
import {
  isCommitPartOfMergedPR,
  type MergedPRCommitMembership
} from './merged-pr-commit-membership'
import { mergedReviewHeadIsEquivalent } from '../source-control/merged-review-head-equivalence'

/** PR-history membership, or a local proof that HEAD is an equivalent rebase GitHub never saw. */
export async function mergedPRHeadMembership(args: {
  ownerRepo: OwnerRepo
  prNumber: number
  prHeadOid: string | undefined
  baseRefName: string | undefined
  headOid: string
  ghOptions: GitHubRepoExecOptions
  repoPath: string
  connectionId?: string | null
  localGitOptions: HostedReviewLocalGitOptions
}): Promise<MergedPRCommitMembership> {
  const membership = await isCommitPartOfMergedPR({
    ownerRepo: args.ownerRepo,
    prNumber: args.prNumber,
    commitOid: args.headOid,
    ghOptions: args.ghOptions
  })
  if (membership === 'contained') {
    return membership
  }
  const equivalent = await mergedReviewHeadIsEquivalent({
    repoPath: args.repoPath,
    connectionId: args.connectionId,
    localGitOptions: args.localGitOptions,
    reviewHeadOid: args.prHeadOid,
    baseBranchName: args.baseRefName,
    headOid: args.headOid
  })
  return equivalent ? 'contained' : membership
}
