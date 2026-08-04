import type { BoardSeedPost, Submission, SubmissionType } from "@/lib/types";

/**
 * Helpers for telling the facilitator's own posts apart from what participants
 * contributed, and for the seed posts a board opens with.
 *
 * The distinction matters in more places than it first looks: a facilitator's
 * guidance card must never queue for its author's own approval, must not be
 * counted as a contribution in the "how much came in" figures, and reads
 * differently on the board than a participant's answer.
 */

export function isFacilitatorPost(s: Pick<Submission, "author_profile_id">): boolean {
  return !!s.author_profile_id;
}

/**
 * Whether a post counts towards "how much has been contributed". The
 * facilitator's own framing posts don't — counting the three guidance cards she
 * wrote as collected contributions would misreport an empty board as a busy one.
 */
export function countsAsContribution(s: Pick<Submission, "author_profile_id" | "status">): boolean {
  return !isFacilitatorPost(s) && s.status !== "deleted" && s.status !== "rejected";
}

/** Seed posts the board actually has something to show for. */
export function usableSeedPosts(posts: BoardSeedPost[] | undefined | null): BoardSeedPost[] {
  if (!Array.isArray(posts)) return [];
  return posts.filter((p) => (p.type === "text" ? !!p.text.trim() : !!p.media_url));
}

/** A fresh, empty seed post of the given kind. */
export function blankSeedPost(type: SubmissionType, index: number): BoardSeedPost {
  return { id: `sp${index}_${Math.random().toString(36).slice(2, 8)}`, type, text: "", media_url: null, zone_id: null, pinned: false };
}

/** Copy label for the seed-post kinds, in the editor's own terms. */
export const SEED_POST_LABELS: Record<SubmissionType, string> = {
  text: "כרטיס טקסט",
  image: "תמונה",
  video: "סרטון",
};

/** Comments worth rendering (soft-deleted and hidden ones are not). */
export function visibleComments<T extends { status: string }>(comments: T[]): T[] {
  return comments.filter((c) => c.status === "published");
}
